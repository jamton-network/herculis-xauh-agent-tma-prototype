import { expect, test } from "@playwright/test";
import { installSwapWallet, SwapWallet } from "./swap-wallet.cjs";

async function connect(page: Parameters<typeof installSwapWallet>[0], wallet: SwapWallet) {
  await installSwapWallet(page, wallet);
  await page.goto("/?view=strategy");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Wallet connected on Sepolia" }),
  ).toBeVisible();
}

for (const sell of [false, true])
  test(`${sell ? "sell" : "buy"} can select the alternative and execute with visible token fees`, async ({
    page,
  }) => {
    const wallet = new SwapWallet();
    await connect(page, wallet);
    if (sell) await page.getByRole("radio", { name: "Instant sell", exact: true }).check();
    await page.getByLabel(sell ? "XAUH to sell" : "USDT to spend", { exact: true }).fill("1");
    await page.getByRole("button", { name: "Get live quotes", exact: true }).click();
    const recommendation = page.getByRole("status", { name: "Execution recommendation" });
    await expect(recommendation).toContainText("Constant-product AMM");
    const alternative = page.getByRole("article", { name: "Concentrated-liquidity AMM" });
    await page.getByRole("radio", { name: "Concentrated-liquidity AMM", exact: true }).check();
    await expect(alternative).toContainText("Selected");
    await expect(page.getByRole("article", { name: "Constant-product AMM" })).toContainText(
      "Best net receipt",
    );
    await expect(alternative).toContainText("XAUH transfer fee");
    if (sell) {
      await expect(alternative).toContainText("0.0002 XAUH");
      await expect(alternative).toContainText("0.00019996 XAUH");
    }
    await page
      .getByRole("button", {
        name: sell ? "Approve exact XAUH" : "Approve exact USDT",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Reconcile transaction", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Exact allowance confirmed" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: sell ? "Sell XAUH" : "Buy XAUH", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Get live quotes", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Fresh quotes ready" })).toBeVisible();
    await page.getByRole("button", { name: sell ? "Sell XAUH" : "Buy XAUH", exact: true }).click();
    await page.getByRole("button", { name: "Reconcile transaction", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Swap confirmed" })).toBeVisible();
    expect(wallet.sends).toHaveLength(2);
  });

test("account changes, edits and direction changes clear stale quotes without sending", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  await connect(page, wallet);
  await page.getByLabel("USDT to spend").fill("1");
  await page.getByRole("button", { name: "Get live quotes" }).click();
  await expect(page.getByRole("status", { name: "Execution recommendation" })).toContainText(
    "Best net receipt",
  );
  await page.getByLabel("USDT to spend").fill("2");
  await expect(page.getByRole("status", { name: "Execution recommendation" })).toContainText(
    "Enter an amount",
  );
  await page.getByRole("button", { name: "Get live quotes" }).click();
  await page.getByRole("radio", { name: "Instant sell", exact: true }).check();
  await expect(page.getByLabel("XAUH to sell")).toHaveValue("1");
  await expect(page.getByRole("button", { name: "Sell XAUH", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Instant buy", exact: true }).check();
  await expect(page.getByLabel("USDT to spend")).toHaveValue("2");
  await page.evaluate(() =>
    (window as unknown as { ethereum: { emit(event: string): void } }).ethereum.emit(
      "accountsChanged",
    ),
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Wallet connected on Sepolia" }),
  ).toBeVisible();
  expect(wallet.sends).toHaveLength(0);
});

test("wrong network offers an explicit switch that refreshes Sepolia readiness", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  wallet.chainId = 1;
  await connectWrong();
  async function connectWrong() {
    await installSwapWallet(page, wallet);
    await page.goto("/?view=strategy");
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Switch to Sepolia", exact: true }),
    ).toBeVisible();
    expect(wallet.sends).toHaveLength(0);
    await page.getByRole("button", { name: "Switch to Sepolia", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sepolia selected" })).toBeVisible();
    expect(wallet.chainId).toBe(11155111);
  }
});

test("Wallets and Aqua share the real connection and disconnect keeps price previews available", async ({
  page,
}) => {
  const wallet = new SwapWallet();
  await installSwapWallet(page, wallet);
  await page.goto("/?tab=wallets");
  await page.getByTestId("connect-aqua-wallet").click();
  const card = page.getByRole("region", { name: "External wallet", exact: true });
  await expect(card).toContainText(wallet.account);
  await expect(card).toContainText("Sepolia (11155111)");
  await page.getByTestId("tab-home").click();
  await page.getByTestId("review-strategy").click();
  await expect(page.getByRole("link", { name: wallet.account, exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: "Aqua quotes" })).toContainText(
    "Fresh quotes ready",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByTestId("tab-wallets").click();
  await expect(card).toContainText(wallet.account);
  await card.getByRole("button", { name: "Disconnect wallet", exact: true }).click();
  await expect(card).toContainText("Not connected");
  await page.getByTestId("tab-home").click();
  await page.getByTestId("review-strategy").click();
  await expect(page.getByRole("status", { name: "Aqua quotes" })).toContainText(
    "Fresh quotes ready",
  );
  await expect(page.getByRole("button", { name: "Buy XAUH", exact: true })).toBeDisabled();
  expect(wallet.sends).toHaveLength(0);
});
