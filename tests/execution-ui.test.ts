import { expect, test, type Page } from "@playwright/test";

const panel = (page: Page) => page.getByRole("region", { name: "Execution via Aqua" });
const recommendation = (page: Page) => page.getByRole("region", { name: "Agent recommendation" });
const compare = (page: Page) =>
  panel(page).locator("summary").filter({ hasText: "Compare options" });

async function mockDraws(page: Page, values: number[]) {
  await page.addInitScript((draws) => {
    const telemetry = window as typeof window & { executionRandomCalls: number };
    telemetry.executionRandomCalls = 0;
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint8Array<ArrayBuffer>) => {
        if (array instanceof Uint8Array && array.length === 1) {
          const value = draws[telemetry.executionRandomCalls++];
          if (value === undefined) throw new Error("Unexpected random draw");
          array[0] = value;
          return array;
        }
        return original(array);
      },
    });
  }, values);
}

test("execution compares the full amount, recalculates in place, and clears stale values", async ({
  page,
}) => {
  await page.goto("/?view=strategy");
  await expect(recommendation(page)).toContainText("Constant-product AMM");
  await expect(recommendation(page)).toContainText("0.390039");
  await expect(recommendation(page)).toContainText("50.38");
  await expect(
    page.getByText("Aqua execution · Constant-product AMM", { exact: true }),
  ).toBeVisible();
  await compare(page).click();
  const alternative = panel(page).getByRole("article", { name: "Concentrated-liquidity AMM" });
  await expect(alternative).toContainText("0.000625 XAUH less");
  await expect(alternative).toContainText("0.15 USDT · 0.3%");
  await panel(page).locator("summary").filter({ hasText: "Comparison details" }).click();
  await expect(panel(page)).toContainText("Not included");
  const amount = page.getByLabel("Purchase amount", { exact: true });
  await amount.fill("200");
  await expect(amount).toBeFocused();
  await expect(recommendation(page)).toContainText("Concentrated-liquidity AMM");
  await expect(recommendation(page)).toContainText("1.557191");
  await expect(recommendation(page)).toContainText("200.38");
  await expect(recommendation(page)).toContainText("for 200 USDT");
  await expect(alternative).toBeVisible();
  await amount.fill("250");
  await expect(recommendation(page)).toHaveCount(0);
  await expect(
    panel(page).getByRole("heading", { name: "No option fits these settings" }),
  ).toBeVisible();
  await expect(panel(page)).toContainText("Total exceeds your per-purchase limit");
  await expect(page.getByText("Aqua execution · Review settings", { exact: true })).toBeVisible();
  await amount.fill("");
  await expect(
    panel(page).getByRole("heading", { name: "Enter valid settings to compare options" }),
  ).toBeVisible();
  await expect(amount).toHaveAttribute("aria-invalid", "true");
  await expect(amount).toHaveAccessibleDescription(/Purchase amount: Enter a positive value/);
  await expect(panel(page).getByText("250.38", { exact: false })).toHaveCount(0);
  await expect(panel(page).getByText("Estimated XAUH", { exact: true })).toHaveCount(0);
  await amount.fill("50");
  await expect(amount).not.toHaveAttribute("aria-invalid", "true");
  await expect(recommendation(page)).toContainText("0.390039");
});

test("each manual and Quantis choice shares a result and repetitions do not save", async ({
  page,
}) => {
  await mockDraws(page, [0, 1, 2, 3, 3]);
  await page.goto("/?view=strategy");
  const names = ["Target price buy", "Weekly DCA", "Reserve buy", "Dip buy"];
  for (const name of names) {
    await page.getByRole("radio", { name, exact: true }).check();
    const manual = await recommendation(page).innerText();
    await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
    await expect(page.getByRole("radio", { name, exact: true })).toBeChecked();
    await expect(recommendation(page)).toHaveText(manual, { useInnerText: true });
  }
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toContainText(
    "Selected again.",
  );
  await expect(page.getByRole("region", { name: "Saved strategy status" })).toContainText(
    "Saved: Target price buy",
  );
  await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
    "Unsaved changes",
  );
  const before = await recommendation(page).innerText();
  await compare(page).click();
  await page.getByRole("button", { name: "About Quantis" }).click();
  await page.keyboard.press("Escape");
  await expect(recommendation(page)).toHaveText(before, { useInnerText: true });
  expect(
    await page.evaluate(
      () => (window as typeof window & { executionRandomCalls: number }).executionRandomCalls,
    ),
  ).toBe(5);
});

test("rule conditions and shared limits respond without inventing price changes", async ({
  page,
}) => {
  await page.goto("/?view=strategy");
  await page.getByRole("radio", { name: "Weekly DCA" }).check();
  await page.getByLabel("Day", { exact: true }).fill("Monday");
  await page.getByLabel("Local time", { exact: true }).fill("09:15");
  await expect(panel(page)).toContainText("Monday at 09:15 local time");
  await expect(recommendation(page)).toContainText("0.390039");
  await page.getByRole("radio", { name: "Dip buy" }).check();
  await page.getByLabel("Drop from recent high", { exact: true }).fill("4");
  await page.getByLabel("Recent-high window", { exact: true }).fill("14");
  await expect(panel(page)).toContainText("4% drop from the high over 14 days");
  await expect(recommendation(page)).toContainText("0.390039");
  await page.getByRole("radio", { name: "Reserve buy" }).check();
  await page.getByLabel("Keep at least", { exact: true }).fill("775.02");
  await expect(panel(page)).toContainText("Keep at least 775.02 USDT after the purchase");
  await expect(recommendation(page)).toBeVisible();
  await page.getByLabel("Minimum balance", { exact: true }).fill("776");
  await expect(panel(page)).toContainText("Balance would fall below your reserve");
  await expect(recommendation(page)).toHaveCount(0);
  await page.getByLabel("Minimum balance", { exact: true }).fill("0");
  await page.getByLabel("Daily budget", { exact: true }).fill("50");
  await expect(panel(page)).toContainText("Total exceeds your remaining daily budget");
  await page.getByLabel("Daily budget", { exact: true }).fill("500");
  await page.getByRole("radio", { name: "Target price buy" }).check();
  await page.getByLabel("Buy at or below", { exact: true }).fill("129.2");
  await expect(recommendation(page)).toContainText("The only option within your limits.");
  await compare(page).click();
  await expect(
    panel(page).getByRole("article", { name: "Concentrated-liquidity AMM" }),
  ).toContainText("Effective price exceeds your target");
});

test("saved execution survives pause and removal preserves parameters until reload", async ({
  page,
}) => {
  await page.goto("/?view=strategy");
  const amount = page.getByLabel("Purchase amount", { exact: true });
  await amount.fill("200");
  await page.getByRole("button", { name: "Save strategy", exact: true }).click();
  await page.getByRole("button", { name: "Pause strategy", exact: true }).click();
  await amount.fill("50");
  await expect(recommendation(page)).toContainText("Constant-product AMM");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByTestId("review-strategy").click();
  await expect(amount).toHaveValue("200");
  await expect(recommendation(page)).toContainText("Concentrated-liquidity AMM");
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await page.getByRole("button", { name: "Remove strategy", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove strategy", exact: true })
    .click();
  await page.getByTestId("review-strategy").click();
  await expect(amount).toHaveValue("200");
  await expect(recommendation(page)).toContainText("Concentrated-liquidity AMM");
  await expect(page.getByRole("heading", { name: "No strategy saved" })).toBeVisible();
  await page.getByRole("button", { name: "Save strategy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume strategy", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Strategy is active" })).toBeVisible();
  await page.reload();
  await expect(amount).toHaveValue("50");
  await expect(recommendation(page)).toContainText("Constant-product AMM");
});

test("blocked and invalid settings can be saved without retaining a previous recommendation", async ({
  page,
}) => {
  await page.goto("/?view=strategy");
  for (const value of ["250", ""]) {
    await page.getByLabel("Purchase amount", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Save strategy", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByTestId("review-strategy").click();
    await expect(page.getByLabel("Purchase amount", { exact: true })).toHaveValue(value);
    await expect(recommendation(page)).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
      "All changes saved",
    );
  }
});

test("keyboard disclosure preserves the draft and only announces a changed recommendation", async ({
  page,
}) => {
  await mockDraws(page, []);
  await page.goto("/?view=strategy");
  const status = page.getByRole("status", { name: "Execution recommendation" });
  const initialStatus = await status.innerText();
  await page.getByLabel("Purchase amount", { exact: true }).fill("51");
  await expect(status).toHaveText(initialStatus);
  await compare(page).focus();
  await page.keyboard.press("Enter");
  await expect(panel(page).getByRole("article", { name: "Constant-product AMM" })).toBeVisible();
  await page.keyboard.press("Tab");
  const details = panel(page).locator("summary").filter({ hasText: "Comparison details" });
  await expect(details).toBeFocused();
  await page.keyboard.press("Space");
  await expect(panel(page).getByText("Network fee", { exact: true })).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(compare(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    panel(page).getByRole("article", { name: "Constant-product AMM" }),
  ).not.toBeVisible();
  await expect(page.getByLabel("Purchase amount", { exact: true })).toHaveValue("51");
  await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
    "Unsaved changes",
  );
  await page.getByLabel("Purchase amount", { exact: true }).fill("200");
  await expect(status).toHaveText("Recommended execution: Concentrated-liquidity AMM");
  expect(
    await page.evaluate(
      () => (window as typeof window & { executionRandomCalls: number }).executionRandomCalls,
    ),
  ).toBe(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`execution remains readable and reachable at responsive sizes in ${theme}`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const cases = [320, 375, 430, 768, 1440].map((width) => ({ width, height: 844, scale: 1 }));
    cases.push({ width: 320, height: 480, scale: 1 }, { width: 320, height: 480, scale: 2 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const size of cases) {
      await page.setViewportSize(size);
      await page.goto(`/?view=strategy&theme=${theme}`);
      await page.getByLabel("Purchase amount", { exact: true }).fill("200");
      await compare(page).click();
      await panel(page).locator("summary").filter({ hasText: "Comparison details" }).click();
      if (size.scale === 2) {
        await page.locator("body").evaluate((element) => {
          const elements = [element, ...element.querySelectorAll<HTMLElement>("*")];
          const sizes = elements.map(
            (child) => [child, parseFloat(getComputedStyle(child).fontSize)] as const,
          );
          for (const [child, size] of sizes) child.style.fontSize = `${size * 2}px`;
        });
      }
      await expect(recommendation(page)).toContainText("1.557191");
      const overflows = await panel(page).evaluate((element) =>
        [element, ...element.querySelectorAll<HTMLElement>("*")]
          .filter(
            (child) =>
              child.getClientRects().length &&
              getComputedStyle(child).position !== "absolute" &&
              child.scrollWidth > child.clientWidth + 2,
          )
          .map((child) => child.tagName + "." + child.className),
      );
      expect(overflows, `${theme} ${JSON.stringify(size)}`).toEqual([]);
      expect(
        await page.locator(".app-scroll").evaluate((element) => element.scrollWidth),
      ).toBeLessThanOrEqual(size.width);
      const selectedOverflow = await page
        .locator(".strategy-option-copy")
        .evaluateAll((elements) =>
          elements.some((element) => element.scrollWidth > element.clientWidth + 1),
        );
      expect(selectedOverflow).toBe(false);
      await page.getByRole("button", { name: "Save strategy", exact: true }).click();
      await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
        "All changes saved",
      );
      await page.getByRole("button", { name: "About Quantis" }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: "About Quantis" })).toBeFocused();
    }
  });
}
