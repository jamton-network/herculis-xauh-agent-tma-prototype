import {
  Address as SdkAddress,
  AquaXYCAmmStrategy,
  HexString,
  MakerTraits,
  Order,
} from "@1inch/swap-vm-sdk";
import { encodeFunctionData, erc20Abi, keccak256, parseAbi, type Address, type Hex } from "viem";
import type { ExecutionFamily } from "../types";
import { parseSwapOrder, type SwapConfig, type SwapOrder, type SwapToken } from "./swapConfig";
import { registryAbi, sameAddress, tokenFee, type SwapOperation } from "./swapModel";

export const liquidityAbi = parseAbi([
  "function initializeFeeOnTransfer((address maker, uint256 traits, bytes data) order, address token0, address token1, uint256 reserve0, uint256 reserve1)",
  "function updateFeeOnTransferReserves((address maker, uint256 traits, bytes data) order, address token0, address token1, uint256 reserve0, uint256 reserve1)",
  "event FeeOnTransferInitialized(bytes32 indexed orderHash, address indexed maker, address token0, address token1, uint256 reserve0, uint256 reserve1)",
  "event FeeOnTransferReservesUpdated(bytes32 indexed orderHash, address token0, address token1, uint256 reserve0, uint256 reserve1)",
]);
export const assets = ["xauh", "usdt"] as const;
export type TokenAmounts = Record<SwapToken, bigint>;
export type StoredAmounts = Record<SwapToken, string>;
export type LiquidityPosition = {
  order: SwapOrder;
  status: "draft" | "initialized" | "active" | "closed" | "unavailable";
  reserves: TokenAmounts;
  allocations: TokenAmounts;
  balances: TokenAmounts;
  allowances: TokenAmounts;
  block: bigint;
  error?: string;
};
export type LiquidityAction = "create" | "add" | "ratio" | "remove";
export type LiquidityWorkflow = {
  id: Hex;
  action: LiquidityAction;
  encoded: Hex;
  maker: Address;
  baseReserves: StoredAmounts;
  baseAllocations: StoredAmounts;
  increments: StoredAmounts;
  targets: StoredAmounts;
  fee: { rate: string; parts: string };
  reviewedBlock: string;
};
export type LiquidityStep = {
  id: string;
  kind: SwapOperation["kind"];
  label: string;
  to: Address;
  data: Hex;
  token?: SwapToken;
  amount?: bigint;
};
export const storeAmounts = (amounts: TokenAmounts): StoredAmounts => ({
  xauh: amounts.xauh.toString(),
  usdt: amounts.usdt.toString(),
});
export const readAmounts = (amounts: StoredAmounts): TokenAmounts => ({
  xauh: BigInt(amounts.xauh),
  usdt: BigInt(amounts.usdt),
});
export const emptyAmounts = (): TokenAmounts => ({ xauh: 0n, usdt: 0n });
export function liquidityAmount(text: string, decimals: number): bigint {
  if (
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(text) ||
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  )
    throw new Error("Use a nonnegative plain decimal amount.");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error(`Use at most ${decimals} decimal places.`);
  const amount =
    BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount >= 1n << 248n) throw new Error("Amount must fit uint248.");
  return amount;
}
export function sqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Invalid square root.");
  if (value < 2n) return value;
  let result = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
  for (;;) {
    const next = (result + value / result) / 2n;
    if (next >= result) return result;
    result = next;
  }
}
export function tokenOrder(config: SwapConfig): [SwapToken, SwapToken] {
  return BigInt(config.tokens.xauh) < BigInt(config.tokens.usdt)
    ? ["xauh", "usdt"]
    : ["usdt", "xauh"];
}
export function rangeBounds(
  config: SwapConfig,
  decimals: Record<SwapToken, number>,
  minimum: string,
  maximum: string,
) {
  const min = liquidityAmount(minimum, 18),
    max = liquidityAmount(maximum, 18);
  if (min <= 0n || max <= min)
    throw new Error("Maximum price must exceed a positive minimum price.");
  const [lt, gt] = tokenOrder(config);
  const scale = 10n ** BigInt(decimals[gt]) * 10n ** 36n;
  const denominator = 10n ** BigInt(decimals[lt]);
  const ratio = (price: bigint) =>
    lt === "xauh"
      ? { numerator: price * scale, denominator: denominator * 10n ** 18n }
      : { numerator: scale * 10n ** 18n, denominator: denominator * price };
  const lo = ratio(lt === "xauh" ? min : max),
    hi = ratio(lt === "xauh" ? max : min);
  const floor = sqrt(lo.numerator / lo.denominator);
  const sqrtPriceMin = floor * floor * lo.denominator === lo.numerator ? floor : floor + 1n;
  const sqrtPriceMax = sqrt(hi.numerator / hi.denominator);
  if (sqrtPriceMin <= 0n || sqrtPriceMax <= sqrtPriceMin || sqrtPriceMax >= 1n << 256n)
    throw new Error("Price range cannot be represented by this pricing program.");
  return { sqrtPriceMin, sqrtPriceMax };
}
export function createLiquidityOrder(
  config: SwapConfig,
  maker: Address,
  family: ExecutionFamily,
  amounts: TokenAmounts,
  decimals: Record<SwapToken, number>,
  feeBps: string,
  minimum: string,
  maximum: string,
  salt: bigint,
) {
  if (!/^\d+$/.test(feeBps) || BigInt(feeBps) >= 10_000n)
    throw new Error("Swap fee must be a whole number from 0 to 9999 bps.");
  if (salt < 0n || salt >= 1n << 64n) throw new Error("Salt must fit uint64.");
  if (
    amounts.xauh < 0n ||
    amounts.usdt < 0n ||
    amounts.xauh + amounts.usdt <= 0n ||
    assets.some((token) => amounts[token] >= 1n << 248n) ||
    (family === "constant-product" && (amounts.xauh === 0n || amounts.usdt === 0n))
  )
    throw new Error(
      "Constant-product needs two positive amounts; concentrated liquidity needs at least one.",
    );
  const strategy =
    family === "constant-product"
      ? AquaXYCAmmStrategy.new()
      : AquaXYCAmmStrategy.newConcentrate(rangeBounds(config, decimals, minimum, maximum));
  if (BigInt(feeBps) > 0n) strategy.withFeeTokenIn(Number(feeBps));
  strategy.withSalt(salt);
  return parseSwapOrder(
    Order.new({
      maker: new SdkAddress(maker),
      traits: MakerTraits.default(),
      program: strategy.build(),
    })
      .encode()
      .toString(),
  );
}
export function openingPrice(
  config: SwapConfig,
  order: SwapOrder,
  amounts: TokenAmounts,
  decimals: Record<SwapToken, number>,
): number {
  const [lt, gt] = tokenOrder(config),
    one = 10n ** 18n;
  let a = amounts[lt],
    b = amounts[gt];
  if (order.range) {
    const { min, max } = order.range;
    const alpha = one - (min * one) / max;
    const beta = (a * min) / one + (b * one) / max;
    if (alpha <= 0n) return NaN;
    const liquidity =
      ((beta + sqrt(beta * beta + ((4n * alpha * a) / one) * b)) * one) / (2n * alpha);
    a += (liquidity * one) / max;
    b += (liquidity * min) / one;
  }
  const normalized = (Number(b) / Number(a)) * 10 ** (decimals[lt] - decimals[gt]);
  return lt === "xauh" ? normalized : 1 / normalized;
}
export function humanRange(
  config: SwapConfig,
  order: SwapOrder,
  decimals: Record<SwapToken, number>,
): [number, number] | undefined {
  if (!order.range) return undefined;
  const [lt, gt] = tokenOrder(config);
  const price = (s: bigint) => {
    const raw = (Number(s) / 1e18) ** 2 * 10 ** (decimals[lt] - decimals[gt]);
    return lt === "xauh" ? raw : 1 / raw;
  };
  const a = price(order.range.min),
    b = price(order.range.max);
  return [Math.min(a, b), Math.max(a, b)];
}
export function randomSalt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const salt = BigInt(
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
  return salt === 0n ? randomSalt() : salt;
}
export function reservePayload(
  config: SwapConfig,
  order: SwapOrder,
  amounts: TokenAmounts,
  initialize: boolean,
) {
  const [a, b] = tokenOrder(config);
  return {
    to: config.router,
    data: encodeFunctionData({
      abi: liquidityAbi,
      functionName: initialize ? "initializeFeeOnTransfer" : "updateFeeOnTransferReserves",
      args: [
        Order.decode(new HexString(order.encoded)).build(),
        config.tokens[a],
        config.tokens[b],
        amounts[a],
        amounts[b],
      ],
    }),
  };
}
export function liquiditySteps(config: SwapConfig, workflow: LiquidityWorkflow): LiquidityStep[] {
  const order = parseSwapOrder(workflow.encoded),
    targets = readAmounts(workflow.targets);
  const increments = readAmounts(workflow.increments),
    [a, b] = tokenOrder(config);
  if (workflow.action === "remove")
    return [
      {
        id: "dock",
        kind: "dock",
        label: "Close position",
        to: config.registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "dock",
          args: [config.router, order.hash, [config.tokens[a], config.tokens[b]]],
        }),
      },
    ];
  if (workflow.action === "create")
    return [
      {
        id: "initialize",
        kind: "initialize",
        label: "Initialize pricing reserves",
        ...reservePayload(config, order, targets, true),
      },
      {
        id: "ship",
        kind: "ship",
        label: "Activate Aqua allocation",
        to: config.registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "ship",
          args: [
            config.router,
            order.encoded,
            [config.tokens[a], config.tokens[b]],
            [targets[a], targets[b]],
          ],
        }),
      },
    ];
  return [
    ...[a, b]
      .filter((token) => increments[token] > 0n)
      .map((token): LiquidityStep => ({
        id: `push-${token}`,
        kind: "push",
        label: `Push ${token.toUpperCase()} increment`,
        token,
        amount: increments[token],
        to: config.registry,
        data: encodeFunctionData({
          abi: registryAbi,
          functionName: "push",
          args: [order.maker, config.router, order.hash, config.tokens[token], increments[token]],
        }),
      })),
    {
      id: "reserves",
      kind: "update-reserves",
      label: "Set resulting pricing reserves",
      ...reservePayload(config, order, targets, false),
    },
  ];
}
export function workflowConfirmed(
  workflow: LiquidityWorkflow,
  step: LiquidityStep,
  operations: SwapOperation[],
) {
  return operations.some(
    (op) =>
      op.workflowId === workflow.id &&
      op.stepId === step.id &&
      op.data === step.data &&
      op.status === "confirmed",
  );
}
export function validateWorkflow(config: SwapConfig, value: LiquidityWorkflow): LiquidityWorkflow {
  if (
    !value ||
    !/^0x[\da-f]{64}$/i.test(value.id) ||
    !["create", "add", "ratio", "remove"].includes(value.action) ||
    !sameAddress(parseSwapOrder(value.encoded).maker, value.maker) ||
    BigInt(value.reviewedBlock) < 0n
  )
    throw new Error("Invalid liquidity recovery data.");
  for (const amounts of [
    value.baseReserves,
    value.baseAllocations,
    value.increments,
    value.targets,
  ])
    if (
      assets.some((token) => !/^\d+$/.test(amounts[token]) || BigInt(amounts[token]) >= 1n << 248n)
    )
      throw new Error("Invalid liquidity amount in recovery storage.");
  tokenFee(1n, { rate: BigInt(value.fee.rate), parts: BigInt(value.fee.parts) });
  liquiditySteps(config, value);
  return value;
}
export function workflowIdentity(order: SwapOrder, block: bigint, action: LiquidityAction): Hex {
  return keccak256(new TextEncoder().encode(`${order.hash}:${action}:${block}:${randomSalt()}`));
}
export function approvalStep(config: SwapConfig, token: SwapToken, amount: bigint): LiquidityStep {
  return {
    id: `approve-${token}-${amount}`,
    kind: "approval",
    label:
      amount === 0n
        ? `Reset Aqua ${token.toUpperCase()} allowance`
        : `Approve finite Aqua ${token.toUpperCase()} allowance`,
    token,
    amount,
    to: config.tokens[token],
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [config.registry, amount],
    }),
  };
}
export function allowanceTargets(
  workflow: LiquidityWorkflow,
  operations: SwapOperation[],
): TokenAmounts {
  const targets = readAmounts(workflow.baseAllocations),
    increments = readAmounts(workflow.increments);
  if (workflow.action === "create") return readAmounts(workflow.targets);
  if (workflow.action === "remove") return emptyAmounts();
  for (const token of assets) {
    const pushed = operations.some(
      (op) =>
        op.workflowId === workflow.id && op.stepId === `push-${token}` && op.status === "confirmed",
    );
    targets[token] += increments[token] + (pushed ? 0n : increments[token]);
    if (targets[token] >= 1n << 256n) throw new Error("Allowance exceeds uint256.");
  }
  return targets;
}
