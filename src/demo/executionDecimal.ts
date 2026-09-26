export const decimalScale = 1_000_000n;
export const maximumDecimal = 1_000_000_000_000n * decimalScale;

export function parseDecimal(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d{1,13}(?:\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const parsed = BigInt(whole) * decimalScale + BigInt(fraction.padEnd(6, "0"));
  return parsed <= maximumDecimal ? parsed : null;
}

export function divideUp(numerator: bigint, denominator: bigint): bigint {
  return numerator / denominator + (numerator % denominator > 0n ? 1n : 0n);
}

export function formatDecimal(value: bigint, minimumDecimals = 0, maximumDecimals = 6): string {
  const divisor = 10n ** BigInt(6 - maximumDecimals);
  const absolute = value < 0n ? -value : value;
  const rounded = ((absolute + divisor / 2n) / divisor) * divisor;
  const whole = rounded / decimalScale;
  const fraction = (rounded % decimalScale).toString().padStart(6, "0");
  const decimals = fraction
    .slice(0, maximumDecimals)
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return `${value < 0n && rounded !== 0n ? "−" : ""}${whole}${decimals ? `.${decimals}` : ""}`;
}
