import type { SwapDirection } from "../live/swapConfig";

const choices: readonly SwapDirection[] = ["instant-buy", "instant-sell"];

export function chooseDemoStrategy(): SwapDirection {
  const [value] = crypto.getRandomValues(new Uint8Array(1));
  return choices[value % choices.length];
}
