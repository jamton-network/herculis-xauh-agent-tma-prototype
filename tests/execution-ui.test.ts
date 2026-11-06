import { expect, test } from "@playwright/test";
import { installSwapConfig } from "./swap-wallet.cjs";

test.beforeEach(async ({ page }) => installSwapConfig(page));

test("both Aqua options are selectable and live quotes load without connecting", async ({
  page,
}) => {
  await page.goto("/?view=strategy");
  const group = page.getByRole("radiogroup", { name: "Aqua execution strategy" });
  await expect(group.getByRole("radio")).toHaveCount(2);
  await group.getByRole("radio", { name: "Concentrated-liquidity AMM", exact: true }).check();
  await expect(
    group.getByRole("radio", { name: "Concentrated-liquidity AMM", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("status", { name: "Execution recommendation" })).toContainText(
    "Best net receipt",
  );
  await expect(page.getByRole("button", { name: "Buy XAUH", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
  await expect(page.getByText("Payment fee", { exact: true })).toHaveCount(0);
});

for (const theme of ["light", "dark"])
  test(`${theme} instant swap stays responsive across mobile, tablet and desktop`, async ({
    page,
  }) => {
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/?view=strategy&theme=${theme}`);
      await page.getByRole("radio", { name: "Instant sell", exact: true }).check();
      await page.getByRole("radio", { name: "Concentrated-liquidity AMM", exact: true }).check();
      await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
      const overflow = await page
        .locator("main")
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await expect(page.getByRole("button", { name: "Sell XAUH", exact: true })).toBeVisible();
    }
  });

test("public quotes debounce edits, refresh automatically and pause while hidden", async ({
  page,
}) => {
  const { SwapWallet } = await import("./swap-wallet.cjs");
  const reader = new SwapWallet();
  await installSwapConfig(page, reader);
  await page.clock.install();
  await page.goto("/?view=strategy");
  await expect(page.getByRole("status", { name: "Aqua quotes" })).toContainText(
    "Fresh quotes ready",
  );
  expect(reader.sends).toHaveLength(0);
  await page.getByLabel("USDT to spend", { exact: true }).fill("2");
  await expect(page.getByRole("article", { name: "Constant-product AMM" })).toContainText(
    "1.998 XAUH",
  );
  const initial = reader.quoteFamilies.length;
  await page.clock.fastForward(16_000);
  await expect.poll(() => reader.quoteFamilies.length).toBeGreaterThan(initial);
  await expect(page.getByRole("status", { name: "Aqua quotes" })).toContainText(
    "Fresh quotes ready",
  );
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const paused = reader.quoteFamilies.length;
  await page.clock.fastForward(31_000);
  expect(reader.quoteFamilies).toHaveLength(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reader.quoteFamilies.length).toBeGreaterThan(paused);
  expect(reader.sends).toHaveLength(0);
});

test("focus outline surrounds the complete amount and unit field", async ({ page }) => {
  await page.goto("/?view=strategy");
  const input = page.getByLabel("USDT to spend", { exact: true });
  await input.focus();
  await expect(input).toHaveCSS("outline-style", "none");
  await expect(input.locator("..")).toHaveCSS("outline-style", "solid");
  await expect(input).toHaveCSS("border-radius", "0px");
});
