import {
  createPublicClient,
  decodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  getAbiItem,
  type Hex,
} from "viem";
import { Order } from "@1inch/swap-vm-sdk";
import { forkReadAbi, parseSwapOrder, type SwapConfig, type SwapOrder } from "./swapConfig";
import { assets, emptyAmounts, liquidityAbi, type LiquidityPosition } from "./liquidityModel";
import { registryAbi, sameAddress } from "./swapModel";

export type LiquidityReader = Pick<
  ReturnType<typeof createPublicClient>,
  "readContract" | "getLogs" | "getBlock" | "getTransaction"
>;
type Entry = { encoded: Hex; block?: string };
export type DiscoveryCache = {
  version: 1;
  next: string;
  anchor?: { number: string; hash: Hex };
  entries: Entry[];
};
export type DiscoveryResult = {
  cache: DiscoveryCache;
  orders: SwapOrder[];
  complete: boolean;
  message: string;
};
export const catalogKey = (config: SwapConfig) =>
  `aqua-catalog-${config.chainId}-${config.router.toLowerCase()}-${config.registry.toLowerCase()}`;
export function readCatalog(raw: string | null, config: SwapConfig): DiscoveryCache {
  if (!raw) return { version: 1, next: config.deploymentBlock.toString(), entries: [] };
  try {
    const value = JSON.parse(raw) as DiscoveryCache;
    if (
      value.version !== 1 ||
      BigInt(value.next) < config.deploymentBlock ||
      !Array.isArray(value.entries) ||
      value.entries.some(
        (entry) =>
          !parseSwapOrder(entry.encoded) ||
          (entry.block && BigInt(entry.block) < config.deploymentBlock),
      ) ||
      (value.anchor &&
        (!/^0x[\da-f]{64}$/i.test(value.anchor.hash) || BigInt(value.anchor.number) < 0n))
    )
      throw new Error("Invalid catalog.");
    return value;
  } catch {
    return { version: 1, next: config.deploymentBlock.toString(), entries: [] };
  }
}
export function catalogOrders(
  config: SwapConfig,
  cache: DiscoveryCache,
  extra: Hex[] = [],
): SwapOrder[] {
  const orders = [
    ...config.orders,
    ...cache.entries.map((entry) => parseSwapOrder(entry.encoded)),
    ...extra.map(parseSwapOrder),
  ];
  return [...new Map(orders.map((order) => [order.hash, order])).values()];
}
export async function discoverPositions(
  client: LiquidityReader,
  config: SwapConfig,
  previous: DiscoveryCache,
  head: bigint,
): Promise<DiscoveryResult> {
  let cache: DiscoveryCache = { ...previous, entries: [...previous.entries] };
  const start = config.deploymentBlock;
  let next = BigInt(cache.next);
  if (cache.anchor) {
    const canonical =
      BigInt(cache.anchor.number) <= head
        ? await client.getBlock({ blockNumber: BigInt(cache.anchor.number) })
        : undefined;
    if (canonical?.hash !== cache.anchor.hash) {
      next = start;
      cache = {
        version: 1,
        next: start.toString(),
        entries: cache.entries.filter((entry) => !entry.block),
      };
    }
  }
  let anchorNumber = cache.anchor
    ? BigInt(cache.anchor.number)
    : next > start
      ? next - 1n
      : undefined;
  let error: string | undefined;
  const scan = async (begin: bigint, limit: number) => {
    let from = begin,
      range = 2000n,
      batches = 0;
    while (from <= head && batches < limit) {
      const to = from + range - 1n < head ? from + range - 1n : head;
      try {
        const [shipped, initialized] = await Promise.all([
          client.getLogs({
            address: config.registry,
            event: getAbiItem({ abi: registryAbi, name: "Shipped" }),
            fromBlock: from,
            toBlock: to,
            strict: true,
          }),
          client.getLogs({
            address: config.router,
            event: getAbiItem({ abi: liquidityAbi, name: "FeeOnTransferInitialized" }),
            fromBlock: from,
            toBlock: to,
            strict: true,
          }),
        ]);
        if (shipped.length + initialized.length > 1000)
          throw new Error("Event range is too dense.");
        const entries = cache.entries.filter(
          (entry) => !entry.block || BigInt(entry.block) < from || BigInt(entry.block) > to,
        );
        for (const log of shipped) {
          if (log.removed || !sameAddress(log.args.app, config.router)) continue;
          try {
            const order = parseSwapOrder(log.args.strategy);
            if (order.hash === log.args.strategyHash && sameAddress(order.maker, log.args.maker))
              entries.push({ encoded: order.encoded, block: log.blockNumber.toString() });
          } catch {
            continue;
          }
        }
        for (const log of initialized) {
          if (
            log.removed ||
            entries.some((entry) => parseSwapOrder(entry.encoded).hash === log.args.orderHash)
          )
            continue;
          const transaction = await client.getTransaction({ hash: log.transactionHash });
          try {
            const call = decodeFunctionData({ abi: liquidityAbi, data: transaction.input });
            if (call.functionName !== "initializeFeeOnTransfer") continue;
            const order = parseSwapOrder(encodeAbiParameters([Order.ABI], [call.args[0]]));
            if (
              order.hash === log.args.orderHash &&
              sameAddress(order.maker, log.args.maker) &&
              assets.every((token) =>
                [call.args[1], call.args[2]].some((address) =>
                  sameAddress(address, config.tokens[token]),
                ),
              )
            )
              entries.push({ encoded: order.encoded, block: log.blockNumber.toString() });
          } catch {
            continue;
          }
        }
        cache.entries = entries;
        if (from <= next && to >= next) next = to + 1n;
        if (anchorNumber === undefined || to > anchorNumber) anchorNumber = to;
        from = to + 1n;
        range = range * 2n < 2000n ? range * 2n : 2000n;
        batches++;
      } catch {
        if (range > 1n) {
          range /= 2n;
          continue;
        }
        error = "Some event ranges could not be read. Resume discovery or import an encoded order.";
        break;
      }
    }
  };
  await scan(next > start + 12n ? next - 12n : start, 20);
  if (next <= head) {
    const recent = head > start + 2047n ? head - 2047n : start;
    await scan(recent > next ? recent : next, 4);
  }
  const anchor =
    anchorNumber !== undefined ? await client.getBlock({ blockNumber: anchorNumber }) : undefined;
  cache = {
    version: 1,
    next: next.toString(),
    entries: [...new Map(cache.entries.map((entry) => [entry.encoded, entry])).values()],
    anchor: anchor?.hash ? { number: anchor.number.toString(), hash: anchor.hash } : undefined,
  };
  const complete = next > head && !error;
  return {
    cache,
    orders: catalogOrders(config, cache),
    complete,
    message:
      error ??
      (complete
        ? `Discovery current through block ${head}.`
        : `Discovery incomplete; scanned through block ${next - 1n}. Resume to continue or import an encoded order.`),
  };
}
export async function readPosition(
  client: Pick<LiquidityReader, "readContract">,
  config: SwapConfig,
  order: SwapOrder,
  block: bigint,
): Promise<LiquidityPosition> {
  const position: LiquidityPosition = {
    order,
    status: "unavailable",
    reserves: emptyAmounts(),
    allocations: emptyAmounts(),
    balances: emptyAmounts(),
    allowances: emptyAmounts(),
    block,
  };
  try {
    const initialized = await client.readContract({
      address: config.router,
      abi: forkReadAbi,
      functionName: "feeOnTransferInitialized",
      args: [order.hash],
      blockNumber: block,
    });
    const counts = await Promise.all(
      assets.map(async (token) => {
        const [raw, reserve, balance, allowance] = await Promise.all([
          client.readContract({
            address: config.registry,
            abi: registryAbi,
            functionName: "rawBalances",
            args: [order.maker, config.router, order.hash, config.tokens[token]],
            blockNumber: block,
          }),
          client.readContract({
            address: config.router,
            abi: forkReadAbi,
            functionName: "feeOnTransferReserves",
            args: [order.hash, config.tokens[token]],
            blockNumber: block,
          }),
          client.readContract({
            address: config.tokens[token],
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [order.maker],
            blockNumber: block,
          }),
          client.readContract({
            address: config.tokens[token],
            abi: erc20Abi,
            functionName: "allowance",
            args: [order.maker, config.registry],
            blockNumber: block,
          }),
        ]);
        position.allocations[token] = raw[0];
        position.reserves[token] = reserve;
        position.balances[token] = balance;
        position.allowances[token] = allowance;
        return raw[1];
      }),
    );
    if (counts.every((count) => count === 255)) position.status = "closed";
    else if (counts.every((count) => count === 0))
      position.status = initialized ? "initialized" : "draft";
    else if (counts.every((count) => count === 2) && initialized) position.status = "active";
    else throw new Error("Inconsistent position lifecycle. Writes are unavailable.");
  } catch (error) {
    position.error = error instanceof Error ? error.message : "Position state could not be read.";
  }
  return position;
}
