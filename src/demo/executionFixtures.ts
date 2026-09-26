import type { ExecutionContext, ExecutionOffer } from "../types";

export const executionContext: ExecutionContext = {
  balance: 825_400_000n,
  spentToday: 0n,
  spentThisMonth: 0n,
  paymentFee: 380_000n,
  referencePrice: 130_000_000n,
  usdPerUsdt: 1_000_000n,
};

export const executionOffers: readonly ExecutionOffer[] = [
  {
    id: "constant-product-usdt-xauh",
    name: "Constant-product AMM",
    family: "constant-product",
    tokenIn: "USDT",
    tokenOut: "XAUH",
    network: "Ethereum",
    settlement: "Aqua",
    feePpm: 500n,
    reserveIn: 50_000_000_000n,
    reserveOut: 390_625_000n,
    availableOut: 390_625_000n,
    maxInput: 50_000_000_000n,
  },
  {
    id: "concentrated-usdt-xauh",
    name: "Concentrated-liquidity AMM",
    family: "concentrated-liquidity",
    tokenIn: "USDT",
    tokenOut: "XAUH",
    network: "Ethereum",
    settlement: "Aqua",
    feePpm: 3_000n,
    reserveIn: 500_000_000_000n,
    reserveOut: 3_906_250_000n,
    availableOut: 3_048_186n,
    maxInput: 10_000_000_000n,
    priceRange: { min: 126_000_000n, max: 128_200_000n },
  },
];
