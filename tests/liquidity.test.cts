import { Order, HexString } from "@1inch/swap-vm-sdk";
import { expect, test } from "@playwright/test";
import { decodeFunctionData, formatUnits, type Hex } from "viem";
import { createPublicClient, custom, type EIP1193RequestFn } from "viem";
import { config, maker, buyer, SwapWallet } from "./swap-wallet.cjs";
import { SwapSession } from "../src/live/swapSession";
import { registryAbi, sameAddress, type SwapOperation } from "../src/live/swapModel";
import { parseSwapOrder } from "../src/live/swapConfig";
import {
  allowanceTargets,
  createLiquidityOrder,
  emptyAmounts,
  humanRange,
  liquidityAbi,
  liquidityAmount,
  liquiditySteps,
  openingPrice,
  randomSalt,
  rangeBounds,
  readAmounts,
  tokenOrder,
} from "../src/live/liquidityModel";
import {
  catalogOrders,
  catalogKey,
  discoverPositions,
  readCatalog,
  type LiquidityReader,
} from "../src/live/liquidityDiscovery";

test.beforeAll(() =>
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      async request(_key: string, _options: unknown, action: (lock: object) => Promise<void>) {
        await action({});
      },
    },
  }),
);
function harness() {
  const wallet = new SwapWallet();
  wallet.account = maker;
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const provider = {
    async request(call: { method: string; params?: unknown }) {
      const result = await wallet.handle(call as { method: string; params?: unknown[] });
      if (result && typeof result === "object" && "mockError" in result)
        throw Object.assign(new Error("Synthetic rejection"), { code: result.mockError });
      return result;
    },
  };
  return {
    wallet,
    saved,
    storage,
    provider,
    session: new SwapSession(config, provider, storage, provider),
  };
}
const amounts = { xauh: 10n ** 18n, usdt: 125n * 10n ** 6n };
async function step(session: SwapSession) {
  const next = session.liquidityNext();
  expect(next, session.state.message).toBeDefined();
  await session.executeLiquidityStep(next!.id);
  expect(session.state.operations.at(-1)?.status, session.state.message).toBe("pending");
  await session.reconcile();
  expect(session.state.operations.at(-1)?.status, session.state.message).toBe("confirmed");
}
async function finish(session: SwapSession) {
  for (let i = 0; i < 12 && session.workflowIncomplete(); i++) await step(session);
  expect(session.workflowIncomplete(), session.state.message).toBe(false);
}
async function create(
  h: ReturnType<typeof harness>,
  family: "constant-product" | "concentrated-liquidity" = "constant-product",
  oneSided = false,
) {
  await h.session.connect();
  await h.session.reviewLiquidity({
    action: "create",
    amounts: oneSided ? { ...amounts, usdt: 0n } : amounts,
    family,
    minimum: "100",
    maximum: "150",
    feeBps: "5",
  });
  expect(h.session.state.workflow, h.session.state.message).toBeDefined();
  const encoded = h.session.state.workflow!.encoded;
  await finish(h.session);
  return parseSwapOrder(encoded);
}

test("amounts, sorted tokens, price inversion, salts and immutable program settings use exact values", () => {
  expect(liquidityAmount("1.000001", 6)).toBe(1_000_001n);
  expect(liquidityAmount("0", 18)).toBe(0n);
  for (const value of ["-1", "1e4", "1.0000001"]) expect(() => liquidityAmount(value, 6)).toThrow();
  const decimals = { xauh: 18, usdt: 6 };
  for (const c of [
    config,
    { ...config, tokens: { xauh: config.tokens.usdt, usdt: config.tokens.xauh } },
  ]) {
    const order = createLiquidityOrder(
      c,
      maker,
      "concentrated-liquidity",
      amounts,
      decimals,
      "25",
      "100",
      "150",
      123n,
    );
    const range = humanRange(c, order, decimals)!;
    expect(range[0]).toBeCloseTo(100, 6);
    expect(range[1]).toBeCloseTo(150, 6);
    expect(order.feeUnits).toBe(2_500_000n);
    expect(openingPrice(c, order, amounts, decimals)).toBeGreaterThanOrEqual(100);
    expect(openingPrice(c, order, amounts, decimals)).toBeLessThanOrEqual(150);
  }
  const a = createLiquidityOrder(
    config,
    maker,
    "constant-product",
    amounts,
    decimals,
    "0",
    "0",
    "0",
    1n,
  );
  const b = createLiquidityOrder(
    config,
    maker,
    "constant-product",
    amounts,
    decimals,
    "0",
    "0",
    "0",
    2n,
  );
  expect(a.hash).not.toBe(b.hash);
  expect(openingPrice(config, a, amounts, decimals)).toBeCloseTo(125, 10);
  expect(randomSalt()).toBeLessThan(1n << 64n);
  expect(new Set(Array.from({ length: 100 }, () => randomSalt())).size).toBe(100);
  expect(() =>
    createLiquidityOrder(
      config,
      maker,
      "constant-product",
      { ...amounts, xauh: 0n },
      decimals,
      "0",
      "0",
      "0",
      1n,
    ),
  ).toThrow();
  for (const fee of ["10000", "1.1", "-1"])
    expect(() =>
      createLiquidityOrder(config, maker, "constant-product", amounts, decimals, fee, "0", "0", 1n),
    ).toThrow();
  expect(() => rangeBounds(config, decimals, "150", "100")).toThrow();
});

for (const family of ["constant-product", "concentrated-liquidity"] as const) {
  test(`${family} initialization, first ship, pushes, absolute reserves and permanent docking`, async () => {
    const h = harness(),
      order = await create(h, family);
    const init = h.wallet.sends.find((tx) => {
      try {
        return (
          decodeFunctionData({ abi: liquidityAbi, data: tx.data }).functionName ===
          "initializeFeeOnTransfer"
        );
      } catch {
        return false;
      }
    })!;
    const call = decodeFunctionData({ abi: liquidityAbi, data: init.data });
    const [a, b] = tokenOrder(config);
    expect(call.args.slice(1)).toEqual([
      config.tokens[a],
      config.tokens[b],
      amounts[a],
      amounts[b],
    ]);
    expect(h.session.state.positions.find((p) => p.order.hash === order.hash)?.status).toBe(
      "active",
    );
    const before = h.wallet.balances.get(h.wallet.key(config.tokens.xauh, maker))!;
    await h.session.reviewLiquidity({
      action: "add",
      order: order.encoded,
      amounts: { xauh: 10n ** 18n, usdt: 1_000_000n },
    });
    const targets = allowanceTargets(h.session.state.workflow!, h.session.state.operations);
    expect(targets.xauh).toBe(3n * 10n ** 18n);
    await finish(h.session);
    const pushed = h.session.state.operations.filter((op) => op.kind === "push");
    expect(pushed).toHaveLength(2);
    expect(before - h.wallet.balances.get(h.wallet.key(config.tokens.xauh, maker))!).toBe(
      200_000_000_000_000n,
    );
    expect(
      pushed.find((op) =>
        sameAddress(
          decodeFunctionData({ abi: registryAbi, data: op.data }).args?.[3] as string,
          config.tokens.xauh,
        ),
      )?.evidence,
    ).toContain("200000000000000 base units");
    const p = h.wallet.positions.get(order.hash)!;
    expect(p.reserves.get(config.tokens.usdt.toLowerCase())).toBe(126_000_000n);
    const allocation = p.allocations.get(config.tokens.xauh.toLowerCase());
    await h.session.reviewLiquidity({
      action: "ratio",
      order: order.encoded,
      amounts: { xauh: 1n * 10n ** 18n, usdt: 100_000_000n },
    });
    expect(liquiditySteps(config, h.session.state.workflow!)).toHaveLength(1);
    await finish(h.session);
    expect(p.allocations.get(config.tokens.xauh.toLowerCase())).toBe(allocation);
    await h.session.reviewLiquidity({
      action: "remove",
      order: order.encoded,
      amounts: emptyAmounts(),
    });
    await finish(h.session);
    expect(p.count).toBe(255);
    const count = h.wallet.sends.length;
    await h.session.reviewLiquidity({ action: "add", order: order.encoded, amounts });
    expect(h.session.state.message).toContain("Closed orders");
    expect(h.wallet.sends).toHaveLength(count);
  });
}

test("one-sided concentrated creation and one-token addition do not submit zero pushes", async () => {
  const h = harness(),
    order = await create(h, "concentrated-liquidity", true);
  expect(
    h.wallet.positions.get(order.hash)?.allocations.get(config.tokens.usdt.toLowerCase()),
  ).toBe(0n);
  await h.session.reviewLiquidity({
    action: "add",
    order: order.encoded,
    amounts: { xauh: 0n, usdt: 2_000_000n },
  });
  await finish(h.session);
  expect(h.session.state.operations.filter((op) => op.kind === "push")).toHaveLength(1);
});

test("interrupted initialization reuses the saved order and a reload never repeats a confirmed push", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.reviewLiquidity({ action: "create", amounts, family: "constant-product" });
  const encoded = h.session.state.workflow!.encoded;
  await step(h.session);
  const reloaded = new SwapSession(config, h.provider, h.storage, h.provider);
  await reloaded.connect();
  expect(reloaded.state.workflow?.encoded).toBe(encoded);
  expect(reloaded.liquidityNext()?.kind).toBe("ship");
  await finish(reloaded);
  await reloaded.reviewLiquidity({
    action: "add",
    order: encoded,
    amounts: { xauh: 10n ** 18n, usdt: 1_000_000n },
  });
  await step(reloaded);
  h.wallet.next = "reject";
  await reloaded.executeLiquidityStep(reloaded.liquidityNext()!.id);
  expect(reloaded.state.operations.at(-1)?.status).toBe("rejected");
  const restored = new SwapSession(config, h.provider, h.storage, h.provider);
  await restored.connect();
  expect(restored.liquidityNext()?.id).toBe("push-usdt");
  await finish(restored);
  expect(
    restored.state.operations.filter((op) => op.kind === "push" && op.status === "confirmed"),
  ).toHaveLength(2);
  expect(
    h.wallet.positions
      .get(parseSwapOrder(encoded).hash)
      ?.allocations.get(config.tokens.xauh.toLowerCase()),
  ).toBe(2n * 10n ** 18n);
});

test("ambiguous push locks all writes and recovers across account changes", async () => {
  const h = harness(),
    order = await create(h);
  await h.session.reviewLiquidity({
    action: "add",
    order: order.encoded,
    amounts: { xauh: 10n ** 18n, usdt: 0n },
  });
  h.wallet.next = "ambiguous";
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  const count = h.wallet.sends.length;
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  await h.session.approve("constant-product", true, "usdt");
  expect(h.wallet.sends).toHaveLength(count);
  h.wallet.account = buyer;
  await h.session.reconcile();
  expect(h.session.state.message).toContain("account that submitted");
  h.wallet.account = maker;
  await h.session.reconcile();
  expect(h.session.state.operations.at(-1)?.status).toBe("confirmed");
  await finish(h.session);
});

test("stale targets require explicit review and ratio allocation shortfalls are pushed before totals", async () => {
  const h = harness(),
    order = await create(h);
  await h.session.reviewLiquidity({
    action: "ratio",
    order: order.encoded,
    amounts: { xauh: 2n * 10n ** 18n, usdt: 125_000_000n },
  });
  const p = h.wallet.positions.get(order.hash)!;
  p.reserves.set(config.tokens.usdt.toLowerCase(), 124_000_000n);
  const count = h.wallet.sends.length;
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  expect(h.wallet.sends).toHaveLength(count);
  expect(h.session.state.message).toContain("since review");
  await h.session.rereviewLiquidity();
  await finish(h.session);
  const calls = h.session.state.operations.filter(
    (op) => op.workflowId === h.session.state.workflow?.id && op.status === "confirmed",
  );
  expect(calls.map((op) => op.kind)).toEqual(["push", "update-reserves"]);
  expect(readAmounts(h.session.state.workflow!.targets).xauh).toBe(2n * 10n ** 18n);
});

test("finite Aqua allowance includes remaining pushes and fills with separate zero reset", async () => {
  const h = harness();
  h.wallet.allowances.set(h.wallet.key(config.tokens.xauh, maker, config.registry), 1n);
  await h.session.connect();
  await h.session.reviewLiquidity({ action: "create", amounts });
  expect(h.session.liquidityNext()?.amount).toBe(0n);
  await step(h.session);
  expect(h.session.liquidityNext()?.amount).toBe(amounts.xauh);
  await finish(h.session);
  const order = h.session.state.workflow!.encoded;
  await h.session.reviewLiquidity({
    action: "add",
    order,
    amounts: { xauh: 10n ** 18n, usdt: 0n },
  });
  expect(allowanceTargets(h.session.state.workflow!, h.session.state.operations).xauh).toBe(
    3n * 10n ** 18n,
  );
  await finish(h.session);
  expect(h.wallet.allowance(config.tokens.xauh, maker, config.registry)).toBe(2n * 10n ** 18n);
});

test("version one journals migrate while preserving prior operations", async () => {
  const h = harness();
  h.wallet.account = buyer;
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  await h.session.reconcile();
  const operations = h.session.state.operations;
  h.storage.setItem(
    h.session.storageKey,
    JSON.stringify({ version: 1, registry: config.registry, operations }),
  );
  const restored = new SwapSession(config, h.provider, h.storage, h.provider);
  await restored.connect();
  await restored.quote("instant-buy", "1", "50");
  await restored.swap("constant-product");
  expect(restored.state.operations[0]).toEqual(operations[0]);
  expect(JSON.parse(h.storage.getItem(h.session.storageKey)!).version).toBe(2);
});

test("missing or incorrect liquidity receipt evidence blocks workflow advancement", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.reviewLiquidity({ action: "create", amounts });
  h.wallet.next = "missing-events";
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  await h.session.reconcile();
  expect(h.session.state.operations.at(-1)?.status).toBe("needs-review");
  const count = h.wallet.sends.length;
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  expect(h.wallet.sends).toHaveLength(count);
});

test("event discovery adapts ranges, resumes, handles reorganization and introduces cross-wallet quotes", async () => {
  const h = harness(),
    order = await create(h);
  const reader = createPublicClient({
    transport: custom(h.provider as { request: EIP1193RequestFn }, { retryCount: 0 }),
  });
  h.wallet.maxLogRange = 20n;
  let result = await discoverPositions(reader, config, readCatalog(null, config), h.wallet.block);
  for (let i = 0; i < 10 && !result.complete; i++)
    result = await discoverPositions(reader, config, result.cache, h.wallet.block);
  expect(result.complete).toBe(true);
  expect(result.orders.some((item) => item.hash === order.hash)).toBe(true);
  const oldCache = result.cache;
  const anchor = oldCache.anchor!;
  const reorgReader = {
    ...reader,
    async getBlock(args: Parameters<typeof reader.getBlock>[0]) {
      const block = await reader.getBlock(args);
      return {
        ...block,
        hash:
          args?.blockNumber === BigInt(anchor.number) ? (`0x${"a".repeat(64)}` as Hex) : block.hash,
      };
    },
  };
  h.wallet.receipts.clear();
  result = await discoverPositions(
    reorgReader as LiquidityReader,
    config,
    oldCache,
    h.wallet.block,
  );
  expect(catalogOrders(config, result.cache).some((item) => item.hash === order.hash)).toBe(false);
  h.wallet.quoteBonuses.set(Order.decode(new HexString(order.encoded)).build().data, 10n);
  h.wallet.account = buyer;
  const other = new SwapSession(config, h.provider, h.storage, h.provider);
  await other.connect();
  await other.importPosition(order.encoded);
  await other.quote("instant-buy", "1", "50");
  expect(
    other.state.estimates.find((item) => item.family === "constant-product")?.quote?.order.hash,
  ).toBe(order.hash);
  h.wallet.allowances.set(h.wallet.key(config.tokens.xauh, maker, config.registry), 0n);
  await other.quote("instant-buy", "1", "50");
  expect(other.state.estimates.every((item) => !item.quote)).toBe(true);
  expect(formatUnits(amounts.usdt, 6)).toBe("125");
});

test("recent positions remain discoverable across historical gaps, aging and reorganizations", async () => {
  const h = harness();
  h.wallet.block = 10_000n;
  const order = await create(h);
  const client = createPublicClient({
    transport: custom(h.provider as { request: EIP1193RequestFn }, { retryCount: 0 }),
  });
  const reader = {
    ...client,
    async getLogs(args: Parameters<typeof client.getLogs>[0]) {
      const from = args?.fromBlock;
      if (from === undefined || BigInt(from) < 7000n)
        throw new Error("Historical logs unavailable");
      return client.getLogs(args);
    },
  } as LiquidityReader;
  let result = await discoverPositions(reader, config, readCatalog(null, config), h.wallet.block);
  expect(result.complete).toBe(false);
  expect(result.cache.next).toBe(config.deploymentBlock.toString());
  expect(result.orders.some((item) => item.hash === order.hash)).toBe(true);
  h.storage.setItem(catalogKey(config), JSON.stringify(result.cache));
  h.wallet.account = buyer;
  h.wallet.quoteBonuses.set(Order.decode(new HexString(order.encoded)).build().data, 10n);
  const other = new SwapSession(config, h.provider, h.storage, h.provider);
  await other.connect();
  await other.quote("instant-buy", "1", "50");
  expect(
    other.state.estimates.find((item) => item.family === "constant-product")?.quote?.order.hash,
  ).toBe(order.hash);
  h.wallet.block += 3000n;
  result = await discoverPositions(reader, config, result.cache, h.wallet.block);
  expect(result.orders.some((item) => item.hash === order.hash)).toBe(true);
  const anchor = result.cache.anchor!;
  const reorgReader = {
    ...reader,
    async getBlock(args: Parameters<typeof client.getBlock>[0]) {
      const block = await client.getBlock(args);
      return {
        ...block,
        hash:
          args?.blockNumber === BigInt(anchor.number) ? (`0x${"b".repeat(64)}` as Hex) : block.hash,
      };
    },
  } as LiquidityReader;
  h.wallet.receipts.clear();
  result = await discoverPositions(reorgReader, config, result.cache, h.wallet.block);
  expect(result.orders.some((item) => item.hash === order.hash)).toBe(false);
});

test("historical discovery advances when RPC ranges are smaller than the overlap", async () => {
  const h = harness();
  h.wallet.maxLogRange = 1n;
  const reader = createPublicClient({
    transport: custom(h.provider as { request: EIP1193RequestFn }, { retryCount: 0 }),
  });
  const previous = {
    ...readCatalog(null, config),
    next: "50",
    anchor: { number: "49", hash: h.wallet.blockHash(49n) },
  };
  const result = await discoverPositions(reader, config, previous, h.wallet.block);
  expect(BigInt(result.cache.next)).toBeGreaterThan(50n);
  expect(result.complete).toBe(false);
});

test("corrupt workflow recovery blocks writes without erasing old operations", async () => {
  const h = harness();
  h.storage.setItem(
    h.session.storageKey,
    JSON.stringify({
      version: 2,
      registry: config.registry,
      operations: [] as SwapOperation[],
      workflow: { action: "add" },
    }),
  );
  const restored = new SwapSession(config, h.provider, h.storage, h.provider);
  expect(restored.state.storageError).toBeDefined();
  await restored.connect();
  await restored.reviewLiquidity({ action: "create", amounts });
  expect(h.wallet.sends).toHaveLength(0);
});

test("a successful receipt with a wrong push fee cannot advance reserve accounting", async () => {
  const h = harness(),
    order = await create(h);
  await h.session.reviewLiquidity({
    action: "add",
    order: order.encoded,
    amounts: { xauh: 10n ** 18n, usdt: 0n },
  });
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  const operation = h.session.state.operations.at(-1)!;
  const receipt = h.wallet.receipts.get(operation.hash!)!;
  const logs = receipt.logs as { address: string; data: Hex }[];
  const movement = logs.find((log) => sameAddress(log.address, config.tokens.xauh))!;
  movement.data = `0x${"0".repeat(63)}1`;
  await h.session.reconcile();
  expect(h.session.state.operations.at(-1)?.status).toBe("needs-review");
  expect(h.wallet.positions.get(order.hash)?.reserves.get(config.tokens.xauh.toLowerCase())).toBe(
    amounts.xauh,
  );
});

test("canonical receipt changes block the next financial action", async () => {
  const h = harness(),
    order = await create(h);
  const hash = h.session.state.operations.find((op) => op.kind === "initialize")!.hash!;
  const receipt = h.wallet.receipts.get(hash)!;
  receipt.blockHash = `0x${"b".repeat(64)}`;
  const count = h.wallet.sends.length;
  await h.session.reviewLiquidity({ action: "add", order: order.encoded, amounts });
  expect(h.session.state.operations.some((op) => op.status === "needs-review")).toBe(true);
  expect(h.wallet.sends).toHaveLength(count);
});

test("discovery reports incomplete ranges and resumes from its persisted cursor", async () => {
  const h = harness();
  h.wallet.failLogs = true;
  const reader = createPublicClient({
    transport: custom(h.provider as { request: EIP1193RequestFn }, { retryCount: 0 }),
  });
  const failed = await discoverPositions(reader, config, readCatalog(null, config), h.wallet.block);
  expect(failed.complete).toBe(false);
  expect(failed.cache.next).toBe(config.deploymentBlock.toString());
  h.wallet.failLogs = false;
  const resumed = await discoverPositions(
    reader,
    config,
    readCatalog(JSON.stringify(failed.cache), config),
    h.wallet.block,
  );
  expect(resumed.complete).toBe(true);
});

test("partially added liquidity can be explicitly reviewed for full closure without another push", async () => {
  const h = harness(),
    order = await create(h);
  await h.session.reviewLiquidity({
    action: "add",
    order: order.encoded,
    amounts: { xauh: 10n ** 18n, usdt: 1_000_000n },
  });
  await step(h.session);
  const pushes = h.wallet.sends.length;
  await h.session.reviewLiquidityClosure();
  expect(h.session.liquidityNext()?.kind).toBe("dock");
  await finish(h.session);
  expect(h.wallet.sends.length - pushes).toBe(1);
  expect(h.wallet.positions.get(order.hash)?.count).toBe(255);
});

test("changed token fees require renewed review while the order and completed steps stay fixed", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.reviewLiquidity({ action: "create", amounts });
  const encoded = h.session.state.workflow!.encoded;
  await step(h.session);
  h.wallet.fee.rate = 300n;
  await h.session.executeLiquidityStep(h.session.liquidityNext()!.id);
  expect(h.session.state.message).toContain("fees changed");
  await h.session.rereviewLiquidity();
  expect(h.session.state.workflow?.encoded).toBe(encoded);
  await finish(h.session);
  expect(
    h.session.state.operations.filter(
      (op) => op.kind === "initialize" && op.status === "confirmed",
    ),
  ).toHaveLength(1);
});

test("receipt fees use actual self-transfers when the rate changes before mining", async () => {
  const h = harness(),
    order = await create(h);
  await h.session.reviewLiquidity({
    action: "add",
    order: order.encoded,
    amounts: { xauh: 10n ** 18n, usdt: 0n },
  });
  const request = h.provider.request.bind(h.provider);
  h.provider.request = async (call) => {
    if (call.method === "eth_sendTransaction") h.wallet.fee.rate = 300n;
    return request(call);
  };
  await step(h.session);
  expect(h.session.state.operations.at(-1)?.actualFee).toBe("300000000000000");
  await h.session.rereviewLiquidity();
  await finish(h.session);
});

test("quotes exclude active orders whose remaining Aqua allocation cannot cover output", async () => {
  const h = harness();
  h.wallet.account = buyer;
  await h.session.connect();
  for (const position of h.wallet.positions.values())
    position.allocations.set(config.tokens.xauh.toLowerCase(), 1n);
  await h.session.quote("instant-buy", "1", "50");
  expect(h.session.state.estimates.every((item) => !item.quote)).toBe(true);
});
