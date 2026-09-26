import { expect, test } from "@playwright/test";
import type { StrategyEditorDraft } from "../src/types";
import { compareExecution } from "../src/demo/execution";
import { executionContext, executionOffers } from "../src/demo/executionFixtures";
import { initialStrategyConfiguration } from "../src/demo/fixtures";

function configuration(amount = "50"): StrategyEditorDraft {
  const draft = structuredClone(initialStrategyConfiguration) as StrategyEditorDraft;
  draft.drafts[draft.selectedStrategy].amount = amount;
  return draft;
}

test("independent reference amounts include fees and change the preferred offer with size", () => {
  const small = compareExecution(configuration());
  expect(small.status).toBe("ready");
  expect(small.recommendation?.offer.family).toBe("constant-product");
  expect(small.estimates.map((estimate) => estimate.reasons)).toEqual([[], []]);
  expect(small.estimates.map((estimate) => estimate.quote)).toMatchObject([
    {
      output: 390_039n,
      total: 50_380_000n,
      swapFee: 25_000n,
      paymentFee: 380_000n,
      effectivePrice: 129_166_571n,
    },
    {
      output: 389_414n,
      total: 50_380_000n,
      swapFee: 150_000n,
      paymentFee: 380_000n,
      effectivePrice: 129_373_880n,
    },
  ]);
  expect(small.explanation).toBe(
    "Highest estimated XAUH for 50 USDT among options within your limits.",
  );
  const large = compareExecution(configuration("200"));
  expect(large.recommendation?.offer.family).toBe("concentrated-liquidity");
  expect(large.estimates.map((estimate) => estimate.quote)).toMatchObject([
    { output: 1_557_191n, effectivePrice: 128_680_426n, total: 200_380_000n },
    { output: 1_555_499n, effectivePrice: 128_820_398n, total: 200_380_000n },
  ]);
});

test("payment fee consumes every budget and no amount is silently clipped", () => {
  const draft = configuration("250");
  const blocked = compareExecution(draft);
  expect(blocked.status).toBe("unavailable");
  expect(blocked.recommendation).toBeUndefined();
  for (const estimate of blocked.estimates) {
    expect(estimate.reasons).toContain("Total exceeds your per-purchase limit");
    expect(estimate.quote?.amount).toBe(250_000_000n);
    expect(estimate.quote?.total).toBe(250_380_000n);
  }
  draft.limits.purchase = "250.38";
  expect(compareExecution(draft).status).toBe("ready");
  draft.limits.purchase = "250.379999";
  expect(compareExecution(draft).status).toBe("unavailable");
});

test("remaining budgets account for prior spending and allow their exact boundary", () => {
  const draft = configuration();
  draft.limits.daily = "70.38";
  draft.limits.monthly = "150.38";
  const context = { ...executionContext, spentToday: 20_000_000n, spentThisMonth: 100_000_000n };
  expect(compareExecution(draft, executionOffers, context).status).toBe("ready");
  const spent = compareExecution(draft, executionOffers, {
    ...context,
    spentToday: 20_000_001n,
    spentThisMonth: 100_000_001n,
  });
  expect(spent.status).toBe("unavailable");
  expect(spent.estimates[0].reasons).toEqual(
    expect.arrayContaining([
      "Total exceeds your remaining daily budget",
      "Total exceeds your remaining monthly budget",
    ]),
  );
  draft.limits.daily = "0";
  expect(compareExecution(draft).status).toBe("unavailable");
});

test("reserve buy uses the larger reserve including the payment fee", () => {
  const draft = configuration();
  draft.selectedStrategy = "reserve-buy";
  draft.drafts["reserve-buy"].reserve = "775.02";
  draft.limits.reserve = "200";
  expect(compareExecution(draft).status).toBe("ready");
  expect(compareExecution(draft).condition).toContain("775.02 USDT");
  draft.drafts["reserve-buy"].reserve = "775.020001";
  expect(compareExecution(draft).estimates[0].reasons).toContain(
    "Balance would fall below your reserve",
  );
  draft.drafts["reserve-buy"].reserve = "100";
  draft.limits.reserve = "775.020001";
  expect(compareExecution(draft).status).toBe("unavailable");
  draft.limits.reserve = "0";
  draft.drafts["reserve-buy"].reserve = "0";
  expect(compareExecution(draft).status).toBe("ready");
  expect(
    compareExecution(draft, executionOffers, { ...executionContext, balance: 50_379_999n })
      .estimates[0].reasons,
  ).toContain("Insufficient USDT for the full amount and payment fee");
});

test("target filters by the exact effective cost and can leave one or no alternatives", () => {
  const draft = configuration();
  draft.drafts["target-price"].targetPrice = "129.166571";
  const one = compareExecution(draft);
  expect(one.recommendation?.offer.family).toBe("constant-product");
  expect(one.explanation).toBe("The only option within your limits.");
  expect(one.estimates[1].reasons).toContain("Effective price exceeds your target");
  draft.drafts["target-price"].targetPrice = "129.166570";
  expect(compareExecution(draft).status).toBe("unavailable");
  draft.selectedStrategy = "weekly-dca";
  expect(compareExecution(draft).estimates.every((estimate) => !estimate.reasons.length)).toBe(
    true,
  );
});

test("markup keeps negative values and compares the unrounded cost in USD", () => {
  const draft = configuration();
  draft.limits.markup = "0";
  const favorable = compareExecution(draft);
  expect(favorable.status).toBe("ready");
  expect(favorable.recommendation!.quote!.priceVsReference).toBeLessThan(0n);
  draft.limits.markup = "1";
  const context = { ...executionContext, referencePrice: 128_000_000n };
  const one = compareExecution(draft, executionOffers, context);
  expect(one.status).toBe("ready");
  expect(one.explanation).toBe("The only option within your limits.");
  draft.limits.markup = "0.5";
  expect(
    compareExecution(draft, executionOffers, context).estimates.every((estimate) =>
      estimate.reasons.includes("Price exceeds your markup limit"),
    ),
  ).toBe(true);
  expect(
    compareExecution(draft, executionOffers, { ...executionContext, usdPerUsdt: 2_000_000n })
      .status,
  ).toBe("unavailable");
});

test("liquidity caps reject the full input without partial fills", () => {
  const offers = structuredClone(executionOffers);
  offers[0].maxInput = 49_999_999n;
  offers[1].availableOut = 389_413n;
  const result = compareExecution(configuration(), offers);
  expect(result.status).toBe("unavailable");
  expect(
    result.estimates.every((estimate) =>
      estimate.reasons.includes("Insufficient liquidity for the full amount"),
    ),
  ).toBe(true);
  expect(result.estimates.map((estimate) => estimate.quote?.amount)).toEqual([
    50_000_000n,
    50_000_000n,
  ]);
  offers[0].maxInput = 50_000_000n;
  offers[1].availableOut = 389_414n;
  expect(
    compareExecution(configuration(), offers).estimates.every(
      (estimate) => !estimate.reasons.length,
    ),
  ).toBe(true);
});

test("concentrated liquidity checks both endpoint prices and actual output reserves", () => {
  const draft = configuration("500");
  draft.limits.purchase = "1000";
  draft.limits.daily = "1000";
  const result = compareExecution(draft);
  expect(result.recommendation?.offer.family).toBe("constant-product");
  expect(result.estimates[1].reasons).toEqual(
    expect.arrayContaining([
      "Outside the available price range",
      "Insufficient liquidity for the full amount",
    ]),
  );
  const offers = structuredClone(executionOffers);
  offers[1].priceRange = { min: 128_000_001n, max: 129_000_000n };
  expect(compareExecution(configuration(), offers).estimates[1].reasons).toContain(
    "Outside the available price range",
  );
  offers[1].priceRange.min = 128_000_000n;
  expect(compareExecution(configuration(), offers).estimates[1].reasons).not.toContain(
    "Outside the available price range",
  );
  offers[1].priceRange.max = 128_000_000n;
  expect(compareExecution(configuration(), offers).estimates[1].quote).toBeUndefined();
});

test("a concentrated trade may end exactly at the upper price bound", () => {
  const offer = {
    ...executionOffers[1],
    reserveIn: 100_000_000n,
    reserveOut: 100_000_000n,
    availableOut: 100_000_000n,
    feePpm: 0n,
    priceRange: { min: 1_000_000n, max: 1_562_500n },
  };
  const boundary = compareExecution(configuration("25"), [offer]);
  expect(boundary.status).toBe("ready");
  expect(boundary.recommendation?.quote?.output).toBe(20_000_000n);
  offer.priceRange.max = 1_562_499n;
  const outside = compareExecution(configuration("25"), [offer]);
  expect(outside.status).toBe("unavailable");
  expect(outside.estimates[0].reasons).toContain("Outside the available price range");
});

test("unsupported offers, missing range, and invalid context do not masquerade as quotes", () => {
  for (const change of [
    { tokenIn: "ETH" },
    { tokenOut: "USDT" },
    { network: "Other" },
    { settlement: "Signature" },
  ]) {
    const offer = { ...executionOffers[0], ...change };
    const result = compareExecution(configuration(), [offer]);
    expect(result.status).toBe("unavailable");
    expect(result.estimates[0].quote).toBeUndefined();
  }
  for (const change of [
    { reserveIn: 0n },
    { feePpm: -1n },
    { feePpm: 1_000_000n },
    { availableOut: -1n },
  ]) {
    expect(compareExecution(configuration(), [{ ...executionOffers[0], ...change }]).status).toBe(
      "unavailable",
    );
  }
  expect(
    compareExecution(configuration(), [{ ...executionOffers[1], priceRange: undefined }]).status,
  ).toBe("unavailable");
  expect(
    compareExecution(configuration(), executionOffers, { ...executionContext, referencePrice: 0n })
      .status,
  ).toBe("unavailable");
  expect(compareExecution(configuration(), []).recommendation).toBeUndefined();
});

test("ties use a stable identifier and never claim a better economic result", () => {
  const same = { ...executionOffers[0], id: "a" };
  const duplicate = { ...executionOffers[0], id: "b" };
  for (const offers of [
    [same, duplicate],
    [duplicate, same],
  ]) {
    const result = compareExecution(configuration(), offers);
    expect(result.recommendation?.offer.id).toBe("a");
    expect(result.explanation).toBe("Equivalent estimated output");
  }
});

test("tiny amounts round fees up and output down without dividing by zero", () => {
  const result = compareExecution(configuration("0.000001"));
  expect(result.status).toBe("unavailable");
  expect(
    result.estimates.every((estimate) =>
      estimate.reasons.includes("Amount is too small to receive XAUH"),
    ),
  ).toBe(true);
  const fractional = compareExecution(configuration("1.000001"));
  expect(
    fractional.estimates.find((estimate) => estimate.offer.family === "constant-product")?.quote
      ?.swapFee,
  ).toBe(501n);
});

test("invalid active settings remove all calculated amounts, inactive fields do not", () => {
  for (const value of [
    "",
    " ",
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e6",
    "1.0000001",
    "1000000000001",
    "9".repeat(300),
  ]) {
    const result = compareExecution(configuration(value));
    expect(result.status, value).toBe("invalid");
    expect(result.estimates).toEqual([]);
    expect(result.invalidFields).toContain("Purchase amount");
  }
  const draft = configuration();
  draft.drafts["dip-buy"].amount = "broken";
  expect(compareExecution(draft).status).toBe("ready");
  draft.limits.markup = "-1";
  expect(compareExecution(draft).invalidFields).toEqual(["Maximum price markup"]);
});

test("all rules share pricing while the condition responds to relevant settings", () => {
  const draft = configuration();
  const expected = compareExecution(draft).recommendation?.quote?.output;
  for (const strategy of ["target-price", "weekly-dca", "reserve-buy", "dip-buy"] as const) {
    draft.selectedStrategy = strategy;
    expect(compareExecution(draft).recommendation?.quote?.output).toBe(expected);
  }
  draft.drafts["dip-buy"].dipPercent = "4";
  draft.drafts["dip-buy"].lookbackDays = "14";
  expect(compareExecution(draft).condition).toContain("4% drop from the high over 14 days");
  expect(compareExecution(draft).recommendation?.quote?.output).toBe(expected);
  for (const [key, value] of [
    ["dipPercent", "100"],
    ["dipPercent", "0"],
    ["lookbackDays", "1.5"],
    ["lookbackDays", "0"],
  ] as const) {
    const invalid = structuredClone(draft);
    invalid.drafts["dip-buy"][key] = value;
    expect(compareExecution(invalid).status).toBe("invalid");
  }
  draft.selectedStrategy = "weekly-dca";
  draft.drafts["weekly-dca"].day = "monday";
  draft.drafts["weekly-dca"].time = "09:15";
  expect(compareExecution(draft).condition).toContain("Monday at 09:15 local time");
  expect(compareExecution(draft).recommendation?.quote?.output).toBe(expected);
  draft.drafts["weekly-dca"].day = "someday";
  draft.drafts["weekly-dca"].time = "24:00";
  expect(compareExecution(draft).invalidFields).toEqual(["Day", "Local time"]);
});

test("larger trades receive more XAUH but worse curve rates before the fixed payment fee", () => {
  const amounts = [10n, 50n, 100n, 200n];
  for (const offer of executionOffers) {
    let priorAmount = 0n;
    let priorOutput = 0n;
    for (const amount of amounts) {
      const quote = compareExecution(configuration(amount.toString()), [offer]).estimates[0].quote!;
      expect(quote.output).toBeGreaterThan(priorOutput);
      if (priorAmount) expect(quote.output * priorAmount).toBeLessThanOrEqual(priorOutput * amount);
      priorAmount = amount;
      priorOutput = quote.output;
    }
  }
});

test("calculation does not mutate the configuration, context, or offers", () => {
  const draft = configuration();
  const offers = structuredClone(executionOffers);
  const context = { ...executionContext };
  const before = structuredClone({ draft, offers, context });
  compareExecution(draft, offers, context);
  expect({ draft, offers, context }).toEqual(before);
});
