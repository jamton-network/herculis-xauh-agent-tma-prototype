import type { StrategyId } from "../types";

const choices: readonly StrategyId[] = ["target-price", "weekly-dca", "reserve-buy", "dip-buy"];

export function chooseDemoStrategy(): StrategyId {
  const [value] = crypto.getRandomValues(new Uint8Array(1));
  return choices[value % 4];
}
