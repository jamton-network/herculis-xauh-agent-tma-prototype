import type {
  ExecutionComparison,
  ExecutionContext,
  ExecutionEstimate,
  ExecutionOffer,
  StrategyEditorDraft,
} from "../types";
import {
  decimalScale,
  divideUp,
  formatDecimal,
  maximumDecimal,
  parseDecimal,
} from "./executionDecimal";
import { executionContext, executionOffers } from "./executionFixtures";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hundredPercent = 100n * decimalScale;

export function compareExecution(
  configuration: StrategyEditorDraft,
  offers: readonly ExecutionOffer[] = executionOffers,
  context: ExecutionContext = executionContext,
): ExecutionComparison {
  const invalidFields: string[] = [];
  const read = (value: string, label: string, positive = false) => {
    const parsed = parseDecimal(value);
    if (parsed === null || (positive && parsed === 0n)) {
      invalidFields.push(label);
      return 0n;
    }
    return parsed;
  };
  const { selectedStrategy, drafts, limits } = configuration;
  const selected = drafts[selectedStrategy];
  const amount = read(selected.amount, "Purchase amount", true);
  const purchase = read(limits.purchase, "Maximum per purchase");
  const daily = read(limits.daily, "Daily budget");
  const monthly = read(limits.monthly, "Monthly budget");
  const reserve = read(limits.reserve, "Minimum balance");
  const markup = read(limits.markup, "Maximum price markup");
  let target = 0n;
  let requiredReserve = reserve;
  let condition = "";

  if (selectedStrategy === "target-price") {
    target = read(selected.targetPrice, "Buy at or below", true);
    condition = `Effective price at or below ${formatDecimal(target)} USD/XAUH · Minimum interval: 24 hours`;
  } else if (selectedStrategy === "weekly-dca") {
    const day = weekdays.find((value) => value.toLowerCase() === selected.day.trim().toLowerCase());
    if (!day) invalidFields.push("Day");
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(selected.time.trim())) invalidFields.push("Local time");
    condition = `${day ?? ""} at ${selected.time.trim()} local time · Once per weekly window`;
  } else if (selectedStrategy === "reserve-buy") {
    const strategyReserve = read(selected.reserve, "Keep at least");
    requiredReserve = strategyReserve > reserve ? strategyReserve : reserve;
    condition = `Keep at least ${formatDecimal(requiredReserve)} USDT after the purchase · Minimum interval: 24 hours`;
  } else {
    const percent = read(selected.dipPercent, "Drop from recent high", true);
    if (percent >= hundredPercent) invalidFields.push("Drop from recent high");
    const days = read(selected.lookbackDays, "Recent-high window", true);
    if (days % decimalScale !== 0n) invalidFields.push("Recent-high window");
    condition = `After a ${formatDecimal(percent)}% drop from the high over ${formatDecimal(days)} days · Once every 7 days`;
  }

  if (invalidFields.length) {
    return {
      status: "invalid",
      invalidFields: [...new Set(invalidFields)],
      condition: "",
      estimates: [],
      explanation: "Enter valid settings to compare options",
      context,
    };
  }

  const contextValid =
    Object.values(context).every((value) => value >= 0n && value <= maximumDecimal) &&
    context.referencePrice > 0n &&
    context.usdPerUsdt > 0n;
  const total = amount + context.paymentFee;
  const commonReasons: string[] = [];
  if (!contextValid) commonReasons.push("Comparison data is unavailable");
  if (total > maximumDecimal) commonReasons.push("Total exceeds the comparison range");
  if (total > purchase) commonReasons.push("Total exceeds your per-purchase limit");
  if (total > daily - context.spentToday)
    commonReasons.push("Total exceeds your remaining daily budget");
  if (total > monthly - context.spentThisMonth)
    commonReasons.push("Total exceeds your remaining monthly budget");
  if (total > context.balance)
    commonReasons.push("Insufficient USDT for the full amount and payment fee");
  if (context.balance - total < requiredReserve)
    commonReasons.push("Balance would fall below your reserve");

  const estimates = offers.map((offer): ExecutionEstimate => {
    const reasons = [...commonReasons];
    const result: ExecutionEstimate = { offer, reasons };
    if (
      offer.tokenIn !== "USDT" ||
      offer.tokenOut !== "XAUH" ||
      offer.network !== "Ethereum" ||
      offer.settlement !== "Aqua"
    ) {
      reasons.push("Not an Aqua USDT → XAUH option on Ethereum");
      return result;
    }
    const values = [
      offer.reserveIn,
      offer.reserveOut,
      offer.availableOut,
      offer.maxInput,
      offer.feePpm,
    ];
    const range = offer.priceRange;
    if (
      !contextValid ||
      values.some((value) => value < 0n || value > maximumDecimal) ||
      offer.reserveIn === 0n ||
      offer.reserveOut === 0n ||
      offer.feePpm >= decimalScale ||
      offer.availableOut > offer.reserveOut ||
      (offer.family === "concentrated-liquidity" &&
        (!range || range.min <= 0n || range.max <= range.min || range.max > maximumDecimal))
    ) {
      reasons.push("Comparison data is unavailable for this option");
      return result;
    }

    const swapFee = divideUp(amount * offer.feePpm, decimalScale);
    const netInput = amount - swapFee;
    const output = (offer.reserveOut * netInput) / (offer.reserveIn + netInput);
    if (output === 0n) {
      reasons.push("Amount is too small to receive XAUH");
      return result;
    }
    if (amount > offer.maxInput || output > offer.availableOut) {
      reasons.push("Insufficient liquidity for the full amount");
    }
    if (offer.family === "concentrated-liquidity" && range) {
      const startNumerator = offer.reserveIn * decimalScale;
      const endNumerator = (offer.reserveIn + netInput) * decimalScale;
      const endReserve = offer.reserveOut - output;
      if (
        startNumerator < range.min * offer.reserveOut ||
        startNumerator > range.max * offer.reserveOut ||
        endNumerator < range.min * endReserve ||
        endNumerator > range.max * endReserve
      ) {
        reasons.push("Outside the available price range");
      }
    }
    const usdCost = total * context.usdPerUsdt;
    if (selectedStrategy === "target-price" && usdCost > target * output) {
      reasons.push("Effective price exceeds your target");
    }
    if (usdCost * hundredPercent > output * context.referencePrice * (hundredPercent + markup)) {
      reasons.push("Price exceeds your markup limit");
    }
    const effectivePrice = divideUp(total * decimalScale, output);
    if (effectivePrice > maximumDecimal) {
      reasons.push("Effective price exceeds the comparison range");
      return result;
    }
    result.quote = {
      amount,
      swapFee,
      paymentFee: context.paymentFee,
      total,
      output,
      effectivePrice,
      priceVsReference: divideUp(
        (usdCost - output * context.referencePrice) * hundredPercent,
        output * context.referencePrice,
      ),
    };
    return result;
  });

  estimates.sort((left, right) => {
    const eligibleLeft = left.reasons.length === 0;
    const eligibleRight = right.reasons.length === 0;
    if (eligibleLeft !== eligibleRight) return eligibleLeft ? -1 : 1;
    const leftOutput = left.quote?.output ?? 0n;
    const rightOutput = right.quote?.output ?? 0n;
    if (leftOutput !== rightOutput) return leftOutput > rightOutput ? -1 : 1;
    return left.offer.id < right.offer.id ? -1 : left.offer.id > right.offer.id ? 1 : 0;
  });
  const eligible = estimates.filter((estimate) => estimate.reasons.length === 0 && estimate.quote);
  const recommendation = eligible[0];
  const explanation = !recommendation
    ? "No option fits these settings"
    : eligible.length === 1
      ? "The only option within your limits."
      : eligible[1].quote?.output === recommendation.quote?.output
        ? "Equivalent estimated output"
        : `Highest estimated XAUH for ${formatDecimal(amount)} USDT among options within your limits.`;

  return {
    status: recommendation ? "ready" : "unavailable",
    invalidFields: [],
    condition,
    estimates,
    recommendation,
    explanation,
    context,
  };
}
