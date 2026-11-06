import { expect, test, type Page } from "@playwright/test";
import { config, installSwapWallet, maker, SwapWallet } from "./swap-wallet.cjs";
import { parseSwapOrder } from "../src/live/swapConfig";

async function confirm(page: Page, label: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting for confirmation" })).toBeVisible();
  await page.getByRole("button", { name: "Check confirmation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Waiting for confirmation" })).toHaveCount(0);
}
async function create(page: Page, oneSided = false) {
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  if (oneSided) await page.getByRole("radio", { name: "Custom range", exact: true }).check();
  await page.getByLabel("XAUH amount", { exact: true }).fill("1");
  await page.getByLabel("USDT amount", { exact: true }).fill(oneSided ? "0" : "125");
  await page.getByRole("button", { name: "Review position", exact: true }).click();
  const encoded = await page.getByLabel("Saved encoded order", { exact: true }).inputValue();
  await confirm(page, "Prepare position");
  await confirm(page, "Create position");
  await expect(page.getByRole("heading", { name: "Position created" })).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  return parseSwapOrder(encoded);
}

test("liquidity lifecycle is wallet-confirmed and preserves allocation when reserves are lowered", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  wallet.account = maker;
  await installSwapWallet(page, wallet);
  await page.goto("/?view=strategy");
  await page.getByRole("button", { name: "Liquidity positions", exact: true }).click();
  const order = await create(page);
  const card = page.locator("article.liquidity-position").filter({ hasText: order.hash });
  await card.getByRole("button", { name: "Add liquidity", exact: true }).click();
  await page.getByLabel("XAUH increment", { exact: true }).fill("1");
  await page.getByLabel("USDT increment", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Review addition", exact: true }).click();
  await confirm(page, "Add XAUH");
  await confirm(page, "Add USDT");
  await confirm(page, "Confirm changes");
  await expect(page.locator(".liquidity-actual-fee")).toContainText("0.0002 XAUH");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await card.getByText("Manage", { exact: true }).click();
  await card.getByRole("button", { name: "Change ratio", exact: true }).click();
  await page.getByLabel("XAUH desired reserve total").fill("1");
  await page.getByLabel("USDT desired reserve total").fill("100");
  await page.getByRole("button", { name: "Review changes", exact: true }).click();
  await confirm(page, "Confirm changes");
  expect(wallet.positions.get(order.hash)?.allocations.get(config.tokens.xauh.toLowerCase())).toBe(
    2n * 10n ** 18n,
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const menu = card.locator(".liquidity-manage");
  if ((await menu.getAttribute("open")) === null)
    await card.getByText("Manage", { exact: true }).click();
  await card.getByRole("button", { name: "Close position", exact: true }).click();
  await page.getByRole("button", { name: "Review removal" }).click();
  await confirm(page, "Close position");
  await expect(card.getByText("closed", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Add liquidity", exact: true })).toHaveCount(0);
});

test("reload resumes after one push and never duplicates the confirmed increment", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  wallet.account = maker;
  await installSwapWallet(page, wallet);
  await page.goto("/?view=liquidity");
  const order = await create(page, true);
  await page
    .locator("article.liquidity-position")
    .filter({ hasText: order.hash })
    .getByRole("button", { name: "Add liquidity", exact: true })
    .click();
  await page.getByLabel("XAUH increment", { exact: true }).fill("1");
  await page.getByLabel("USDT increment", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Review addition", exact: true }).click();
  await confirm(page, "Add XAUH");
  const count = wallet.sends.length;
  await page.reload();
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add USDT", exact: true })).toBeVisible();
  await confirm(page, "Add USDT");
  await confirm(page, "Confirm changes");
  expect(wallet.sends.length - count).toBe(2);
  expect(wallet.positions.get(order.hash)?.allocations.get(config.tokens.xauh.toLowerCase())).toBe(
    2n * 10n ** 18n,
  );
});

test("anonymous creation inputs, keyboard navigation and return focus remain accessible", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  await installSwapWallet(page, wallet);
  await page.goto("/?view=strategy");
  const entry = page.getByRole("button", { name: "Liquidity positions", exact: true });
  await entry.focus();
  await entry.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Liquidity positions", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeVisible();
  await page.getByLabel("XAUH amount", { exact: true }).fill("1");
  await page.getByLabel("USDT amount", { exact: true }).fill("125");
  await expect(page.locator("output")).toHaveText("125 USDT/XAUH");
  const custom = page.getByRole("radio", { name: "Custom range", exact: true });
  await custom.focus();
  await custom.press("Space");
  await custom.press("Tab");
  await expect(page.getByLabel("Minimum price (USDT/XAUH)")).toBeFocused();
  const fee = page.locator(".liquidity-fee-editor > summary");
  await fee.focus();
  await fee.press("Enter");
  await fee.press("Tab");
  await expect(page.getByLabel("Swap fee (whole bps)")).toBeFocused();
  await page.getByRole("button", { name: "Back to trading strategy" }).click();
  await expect(entry).toBeFocused();
  expect(wallet.sends).toHaveLength(0);
});

for (const theme of ["light", "dark"])
  for (const width of [320, 768, 1440]) {
    test(`liquidity ${theme} layout fits ${width}px`, async ({ page }) => {
      const wallet = new SwapWallet();
      wallet.account = maker;
      await installSwapWallet(page, wallet);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/?view=liquidity&theme=${theme}`);
      await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
      await expect(page.getByLabel("Shared wallet funds", { exact: true })).toBeVisible();
      await page.getByRole("radio", { name: "Custom range", exact: true }).check();
      await expect(page.getByLabel("Minimum price (USDT/XAUH)")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await expect(
        page.getByRole("button", { name: "Refresh positions", exact: true }),
      ).toBeEnabled();
    });
  }
