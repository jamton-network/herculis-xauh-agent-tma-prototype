import { ABI as AquaABI } from "@1inch/aqua-sdk";
import {
  ABI as SwapABI,
  Address as SdkAddress,
  HexString,
  Order,
  SwapVMContract,
  TakerTraits,
} from "@1inch/swap-vm-sdk";
import {
  decodeEventLog,
  decodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import type { ExecutionFamily } from "../types";
import type { SwapConfig, SwapDirection, SwapOrder, SwapToken } from "./swapConfig";

export const registryAbi = AquaABI.AQUA_ABI;
export const routerAbi = SwapABI.SWAP_VM_ABI;
export const sameAddress = (a: string | undefined, b: string | undefined) =>
  Boolean(a && b && a.toLowerCase() === b.toLowerCase());
export const inputToken = (direction: SwapDirection): SwapToken =>
  direction === "instant-buy" ? "usdt" : "xauh";
export const outputToken = (direction: SwapDirection): SwapToken =>
  direction === "instant-buy" ? "xauh" : "usdt";
export type FeeRate = { rate: bigint; parts: bigint };
export type SwapQuote = {
  order: SwapOrder;
  direction: SwapDirection;
  account?: Address;
  input: bigint;
  output: bigint;
  minimum: bigint;
  transferFees: bigint[];
  swapFee: bigint;
  feeRate: FeeRate;
  block: bigint;
  deadline: bigint;
  expiresAt: number;
  generation: number;
};
export type SwapEstimate = { family: ExecutionFamily; quote?: SwapQuote; error?: string };
export type SwapOperation = {
  id: Hex;
  kind: "approval" | "swap";
  account: Address;
  nonce: number;
  to: Address;
  data: Hex;
  startBlock: string;
  scanBlock: string;
  status:
    | "awaiting-wallet"
    | "ambiguous"
    | "pending"
    | "confirmed"
    | "rejected"
    | "reverted"
    | "replaced"
    | "needs-review";
  hash?: Hex;
  evidence?: string;
  feeRate?: { rate: string; parts: string };
  receiptBlockHash?: Hex;
};
export const isUnresolved = (operation: SwapOperation) =>
  ["awaiting-wallet", "ambiguous", "pending", "needs-review"].includes(operation.status);

export function parseAmount(value: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw new Error("Enter a positive plain decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n || amount >= 1n << 248n)
    throw new Error("Amount must be positive and fit uint248.");
  return amount;
}

export function tokenFee(amount: bigint, fee: FeeRate): bigint {
  if (amount < 0n || fee.rate < 0n || fee.parts <= 0n || fee.rate >= fee.parts)
    throw new Error("Unsupported token transfer fee.");
  return (amount * fee.rate) / fee.parts;
}

export function feeBreakdown(
  direction: SwapDirection,
  amount: bigint,
  netOutput: bigint,
  fee: FeeRate,
) {
  if (direction === "instant-sell") {
    const first = tokenFee(amount, fee);
    return [first, tokenFee(amount - first, fee)];
  }
  tokenFee(netOutput, fee);
  const gross = (netOutput * fee.parts) / (fee.parts - fee.rate);
  return [gross - netOutput];
}

export function minReceipt(output: bigint, slippage: string): bigint {
  if (!/^\d+$/.test(slippage) || BigInt(slippage) > 500n)
    throw new Error("Slippage must be a whole number from 0 to 500 basis points.");
  const minimum = (output * (10_000n - BigInt(slippage))) / 10_000n;
  if (minimum <= 0n) throw new Error("Minimum receipt rounds to zero.");
  return minimum;
}

export function swapPayload(
  config: SwapConfig,
  quote: Pick<SwapQuote, "order" | "direction" | "input" | "minimum" | "deadline">,
  preview = false,
) {
  const args = {
    order: Order.decode(new HexString(quote.order.encoded)),
    tokenIn: new SdkAddress(config.tokens[inputToken(quote.direction)]),
    tokenOut: new SdkAddress(config.tokens[outputToken(quote.direction)]),
    amount: quote.input,
    takerTraits: TakerTraits.new({
      exactIn: true,
      useTransferFromAndAquaPush: true,
      threshold: quote.minimum,
      deadline: quote.deadline,
    }),
  };
  return {
    to: config.router,
    data: (preview
      ? SwapVMContract.encodeQuoteCallData(args)
      : SwapVMContract.encodeSwapCallData(args)
    ).toString() as Hex,
  };
}

export function operationIdentity(
  config: SwapConfig,
  operation: Pick<SwapOperation, "account" | "nonce" | "to" | "data">,
): Hex {
  return keccak256(
    new TextEncoder().encode(
      `${config.chainId}:${operation.account.toLowerCase()}:${operation.nonce}:${operation.to.toLowerCase()}:0:${operation.data}`,
    ),
  );
}

export function receiptSummary(
  config: SwapConfig,
  operation: SwapOperation,
  receipt: TransactionReceipt,
): string {
  if (receipt.status !== "success") throw new Error("Transaction reverted.");
  const transfers = receipt.logs.flatMap((log) => {
    try {
      return [{ address: log.address, event: decodeEventLog({ abi: erc20Abi, ...log }) }];
    } catch {
      return [];
    }
  });
  if (operation.kind === "approval") {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: operation.data });
    if (
      decoded.functionName !== "approve" ||
      !sameAddress(decoded.args[0], config.router) ||
      !Object.values(config.tokens).some((address) => sameAddress(address, operation.to))
    )
      throw new Error("Unexpected approval payload.");
    if (
      !transfers.some(
        (log) =>
          sameAddress(log.address, operation.to) &&
          log.event.eventName === "Approval" &&
          sameAddress(log.event.args.owner, operation.account) &&
          sameAddress(log.event.args.spender, config.router) &&
          log.event.args.value === decoded.args[1],
      )
    )
      throw new Error("Approval event missing.");
    return decoded.args[1] === 0n
      ? "Allowance reset confirmed."
      : "Exact allowance confirmed. Refresh quotes before swapping.";
  }
  const decoded = decodeFunctionData({ abi: routerAbi, data: operation.data });
  if (decoded.functionName !== "swap") throw new Error("Unexpected swap payload.");
  const [order, tokenIn, tokenOut, amount, packed] = decoded.args;
  const traits = TakerTraits.decode(new HexString(packed));
  const strategy = config.orders.find(
    (item) => item.encoded === encodeAbiParameters([Order.ABI], [order]),
  );
  if (!strategy || !sameAddress(operation.to, config.router))
    throw new Error("Unknown strategy identity.");
  const direction: SwapDirection = sameAddress(tokenIn, config.tokens.usdt)
    ? "instant-buy"
    : "instant-sell";
  if (
    !sameAddress(tokenIn, config.tokens[inputToken(direction)]) ||
    !sameAddress(tokenOut, config.tokens[outputToken(direction)]) ||
    !traits.exactIn ||
    !traits.useTransferFromAndAquaPush ||
    traits.threshold <= 0n ||
    !operation.feeRate
  )
    throw new Error("Unexpected swap constraints.");
  const logs = receipt.logs
    .filter((log) => sameAddress(log.address, config.router))
    .flatMap((log) => {
      try {
        return [decodeEventLog({ abi: routerAbi, ...log })];
      } catch {
        return [];
      }
    });
  const swapped = logs.find(
    (log) =>
      log.eventName === "Swapped" &&
      log.args.orderHash === strategy.hash &&
      sameAddress(log.args.maker, order.maker) &&
      sameAddress(log.args.taker, operation.account) &&
      sameAddress(log.args.tokenIn, tokenIn) &&
      sameAddress(log.args.tokenOut, tokenOut) &&
      log.args.amountIn === amount &&
      log.args.amountOut >= traits.threshold,
  );
  if (!swapped || swapped.eventName !== "Swapped") throw new Error("Expected swap event missing.");
  const delta = (token: Address, account: Address) =>
    transfers.reduce((total, log) => {
      if (!sameAddress(log.address, token) || log.event.eventName !== "Transfer") return total;
      return (
        total +
        (sameAddress(log.event.args.to, account) ? log.event.args.value : 0n) -
        (sameAddress(log.event.args.from, account) ? log.event.args.value : 0n)
      );
    }, 0n);
  const received = delta(tokenOut, operation.account);
  const makerDebit = -delta(tokenOut, order.maker);
  const fee = { rate: BigInt(operation.feeRate.rate), parts: BigInt(operation.feeRate.parts) };
  const fees = feeBreakdown(direction, amount, received, fee);
  const makerCredit = direction === "instant-sell" ? amount - fees[0] - fees[1] : amount;
  const outputFee = direction === "instant-buy" ? tokenFee(makerDebit, fee) : 0n;
  const registryLogs = receipt.logs
    .filter((log) => sameAddress(log.address, config.registry))
    .flatMap((log) => {
      try {
        return [decodeEventLog({ abi: registryAbi, ...log })];
      } catch {
        return [];
      }
    })
    .filter(
      (log) =>
        sameAddress(log.args.maker, order.maker) &&
        sameAddress(log.args.app, config.router) &&
        log.args.strategyHash === strategy.hash,
    );
  if (
    received !== swapped.args.amountOut ||
    received < traits.threshold ||
    delta(tokenIn, operation.account) !== -amount ||
    delta(tokenIn, order.maker) !== makerCredit ||
    makerDebit - outputFee !== received ||
    delta(tokenIn, config.router) !== 0n ||
    delta(tokenOut, config.router) !== 0n ||
    !registryLogs.some(
      (log) =>
        log.eventName === "Pulled" &&
        sameAddress(log.args.token, tokenOut) &&
        log.args.amount === makerDebit,
    ) ||
    !registryLogs.some(
      (log) =>
        log.eventName === "Pushed" &&
        sameAddress(log.args.token, tokenIn) &&
        log.args.amount === (direction === "instant-sell" ? amount - fees[0] : amount),
    )
  )
    throw new Error("Transfer amounts do not match settlement.");
  return "Swap confirmed. The net wallet receipt meets the minimum; swap, registry and token transfer events match.";
}
