import { expect, test, type Page } from "@playwright/test";

const lightSheetTheme = {
  background: "rgb(255, 255, 255)",
  foreground: "rgb(7, 19, 48)",
  token: "#ffffff",
  theme: "light",
} as const;

const darkSheetTheme = {
  background: "rgb(17, 23, 34)",
  foreground: "rgb(247, 249, 252)",
  token: "#111722",
  theme: "dark",
} as const;

async function expectOpaqueSheet(
  page: Page,
  expected: typeof lightSheetTheme | typeof darkSheetTheme = lightSheetTheme,
) {
  const sheet = page.getByTestId("bottom-sheet");
  await expect(sheet).toBeVisible();

  const styles = await sheet.evaluate((element) => {
    const sheetStyle = window.getComputedStyle(element);
    const overlay = document.querySelector<HTMLElement>("[data-testid='sheet-overlay']");
    const screen = document.documentElement;
    const themeColor = (property: string) =>
      sheetStyle
        .getPropertyValue(property)
        .trim()
        .toLowerCase()
        .replace(/^#([\da-f])([\da-f])([\da-f])$/, "#$1$1$2$2$3$3");

    return {
      background: sheetStyle.backgroundColor,
      foreground: sheetStyle.color,
      opacity: sheetStyle.opacity,
      themeBackgroundToken: themeColor("--tg-bg"),
      themeForegroundToken: themeColor("--tg-text"),
      screenTheme: screen.dataset.theme,
      overlay: overlay ? window.getComputedStyle(overlay).backgroundColor : null,
    };
  });

  expect(styles).toEqual({
    background: expected.background,
    foreground: expected.foreground,
    opacity: "1",
    themeBackgroundToken: expected.token,
    themeForegroundToken: expected.theme === "light" ? "#071330" : "#f7f9fc",
    screenTheme: expected.theme,
    overlay: "rgba(7, 19, 48, 0.44)",
  });
}

async function openWallets(page: Page) {
  await page.getByTestId("tab-wallets").click();
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible();
}

async function connectWallet(page: Page) {
  await page.getByTestId("connect-wallet").click();
  await expect(page.getByRole("heading", { name: "Connect your Ethereum wallet" })).toBeVisible();
  await page.getByTestId("verify-wallet").click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/?theme=light");
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-theme", "light");
});

test("four-tab navigation keeps the product architecture visible", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "No purchase yet today" })).toBeVisible();

  await page.getByTestId("tab-chat").click();
  await expect(page.getByRole("heading", { name: "Agent chat" })).toBeVisible();

  await openWallets(page);
  await expect(page.getByRole("heading", { name: "Agent wallet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "External wallet" })).toBeVisible();

  await page.getByTestId("tab-activity").click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByTestId("activity-filter-all")).toHaveClass(/is-active/);

  await page.getByTestId("tab-home").click();
  await expect(page.getByRole("heading", { name: "No purchase yet today" })).toBeVisible();
});

test("onboarding explains one agent wallet and keeps external-wallet connection optional", async ({
  page,
}) => {
  await page.getByTestId("settings-trigger").click();
  await page.getByRole("button", { name: "Restart onboarding" }).click();
  await expect(page.getByRole("heading", { name: "One agent across bot and TMA" })).toBeVisible();

  await page.getByTestId("onboarding-next").click();
  await expect(
    page.getByRole("heading", { name: "One protected wallet on Ethereum" }),
  ).toBeVisible();
  await expect(page.getByText(/protected agent wallet holds USDT/)).toBeVisible();

  await page.getByTestId("onboarding-next").click();
  await expect(
    page.getByRole("heading", { name: "Connect without giving up control" }),
  ).toBeVisible();
  await expect(page.getByTestId("onboarding-connect-wallet")).toBeVisible();
  await page.getByTestId("onboarding-next").click();

  await expect(page.getByRole("heading", { name: "Choose a trading strategy" })).toBeVisible();
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByRole("heading", { name: "No purchase yet today" })).toBeVisible();
});

test("wallet ownership states and a confirmed USDT top-up are interactive", async ({ page }) => {
  await openWallets(page);
  await page.getByTestId("connect-wallet").click();
  await expectOpaqueSheet(page);
  await page.getByRole("button", { name: "Wrong network" }).click();
  await expect(page.getByRole("heading", { name: "Ethereum Mainnet required" })).toBeVisible();
  await expect(
    page.getByText("Switch the wallet to Ethereum Mainnet and try again."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Verification failure" }).click();
  await expect(page.getByRole("heading", { name: "Wallet check failed" })).toBeVisible();
  await page.getByTestId("verify-wallet").click();

  await page.getByTestId("top-up-wallet").click();
  await expectOpaqueSheet(page);
  await expect(page.getByRole("heading", { name: "Top up agent wallet" })).toBeVisible();
  await page.getByLabel("Top-up amount").fill("500");
  await page.getByTestId("review-top-up").click();
  await expect(page.getByRole("heading", { name: "Approve 500 USDT" })).toBeVisible();
  await page.getByTestId("confirm-top-up").click();
  await expect(page.getByRole("heading", { name: "Top-up submitted" })).toBeVisible();
  await page.getByTestId("complete-top-up").click();
  await expect(page.getByRole("heading", { name: "500 USDT credited" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("toast")).toContainText("Top-up credited");
});

test("ETH top-up credits only after confirmation and recovers from rejection or submission failure", async ({
  page,
}) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("top-up-wallet").click();
  await page.getByRole("button", { name: "ETH", exact: true }).click();
  await expect(page.getByLabel("Top-up amount")).toHaveValue("0.5");
  await page.getByTestId("review-top-up").click();
  await page.getByRole("button", { name: "Rejection" }).click();
  await expect(page.getByRole("heading", { name: "Request rejected" })).toBeVisible();
  await expect(page.getByText("No transfer was signed or broadcast.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "0.5 ETH credited" })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Ethereum Mainnet", { exact: true })).toBeVisible();
  await page.getByTestId("review-top-up").click();
  await page.getByRole("button", { name: "Failed submission" }).click();
  await expect(page.getByRole("heading", { name: "Submission failed" })).toBeVisible();
  await expect(page.getByText(/No credit was recorded/)).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByTestId("review-top-up").click();
  await page.getByTestId("confirm-top-up").click();
  await expect(page.getByRole("heading", { name: "Top-up submitted" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "0.5 ETH credited" })).toHaveCount(0);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "0.5 ETH credited" })).toBeVisible();
});

test("XAUH withdrawal requires review, explicit confirmation, and Ethereum confirmation", async ({
  page,
}) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();
  await expect(
    page.getByRole("group", { name: "Withdrawal asset" }).getByRole("button"),
  ).toHaveCount(3);
  await expectOpaqueSheet(page);
  await expect(page.getByRole("heading", { name: "Withdraw", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "XAUH", exact: true })).toHaveClass(/is-active/);
  await page.getByLabel("Withdrawal amount").fill("2.5");
  await page.getByTestId("review-withdrawal").click();
  await expect(page.getByText(/This transfer is irreversible/)).toBeVisible();
  await expect(page.getByText("≈ 0.045 ETH", { exact: true })).toBeVisible();
  await page.getByTestId("confirm-withdrawal").click();
  await expect(page.getByRole("heading", { name: "Withdrawal submitted" })).toBeVisible();
  await page.getByTestId("complete-withdrawal").click();
  await expect(page.getByRole("heading", { name: "Withdrawal completed" })).toBeVisible();
  await expect(page.getByText(/2.5 XAUH reached your verified external wallet/)).toBeVisible();
});

test("USDT and ETH Max withdrawals apply fee-aware limits", async ({ page }) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();

  await page.getByRole("button", { name: "USDT", exact: true }).click();
  await page.getByTestId("withdrawal-max").click();
  await expect(page.getByLabel("Withdrawal amount")).toHaveValue("825.40");
  await expect(page.getByText("0 USDT · ≈ 0.375 ETH", { exact: true })).toBeVisible();
  await page.getByTestId("review-withdrawal").click();
  await expect(
    page.getByTestId("bottom-sheet").getByText("825.40 USDT", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText(/fee is paid from the agent wallet in ETH/)).toBeVisible();
  await page.getByTestId("confirm-withdrawal").click();
  await page.getByTestId("complete-withdrawal").click();
  await expect(page.getByText(/825.40 USDT reached your verified external wallet/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByTestId("withdraw-wallet").click();
  await page.getByRole("button", { name: "ETH", exact: true }).click();
  await page.getByLabel("Withdrawal amount").fill("0.405");
  await expect(page.getByTestId("review-withdrawal")).toBeDisabled();
  await expect(page.getByText(/Maximum fixed amount: 0.404 ETH/)).toBeVisible();

  await page.getByTestId("withdrawal-max").click();
  await expect(page.getByLabel("Withdrawal amount")).toHaveValue("0.42");
  await expect(page.getByText("≈ 0.414 ETH", { exact: true })).toBeVisible();
  await expect(page.getByText("≈ 0 ETH", { exact: true })).toBeVisible();
  for (const width of [375, 393, 430]) {
    await page.setViewportSize({ width, height: 852 });
    const overflow = await page
      .getByTestId("bottom-sheet")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await expect(page.getByTestId("withdrawal-max")).toHaveCSS("min-height", "44px");
  await page.getByTestId("review-withdrawal").click();
  await expect(page.getByText(/may need to top up ETH before another withdrawal/)).toBeVisible();
  await page.getByTestId("confirm-withdrawal").click();
  await page.getByTestId("complete-withdrawal").click();
  await expect(page.getByText(/0.414 ETH reached your verified external wallet/)).toBeVisible();
});

test("withdrawal fee, stale-preview, failure, and unclear states remain recoverable", async ({
  page,
}) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();

  await page.getByRole("button", { name: "Changed fee" }).click();
  await expect(page.getByRole("heading", { name: "Review required" })).toBeVisible();
  await expect(page.getByText("Nothing was sent.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Review updated amount" }).click();

  await page.getByTestId("review-withdrawal").click();
  await page.getByTestId("confirm-withdrawal").click();
  await page.getByRole("button", { name: "Failure" }).click();
  await expect(page.getByRole("heading", { name: "Withdrawal failed" })).toBeVisible();
  await expect(page.getByText(/No asset was delivered/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByTestId("withdraw-wallet").click();
  await page.getByTestId("review-withdrawal").click();
  await page.getByTestId("confirm-withdrawal").click();
  await page.getByRole("button", { name: "Unclear result" }).click();
  await expect(page.getByRole("heading", { name: "Withdrawal needs review" })).toBeVisible();
  await expect(page.getByText(/will not retry/)).toBeVisible();
});

test("full token withdrawal is blocked when the agent wallet cannot pay ETH fees", async ({
  page,
}) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();
  await page.getByRole("button", { name: "USDT", exact: true }).click();
  await page.getByTestId("withdrawal-max").click();
  await page.getByRole("button", { name: "Insufficient ETH" }).click();
  await expect(page.getByRole("heading", { name: "ETH balance is too low" })).toBeVisible();
  await page.getByRole("button", { name: "Top up ETH" }).click();
  await expect(page.getByRole("heading", { name: "Top up agent wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ETH", exact: true })).toHaveClass(/is-active/);
});

test("representative multi-asset withdrawal flow emits no browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();
  await page.getByRole("button", { name: "ETH", exact: true }).click();
  await page.getByTestId("withdrawal-max").click();
  await page.getByTestId("review-withdrawal").click();
  await page.getByTestId("confirm-withdrawal").click();
  await page.getByTestId("complete-withdrawal").click();
  expect(errors).toEqual([]);
});

test("four trading strategies preserve drafts and support save, pause, resume, and removal", async ({
  page,
}) => {
  await page.getByTestId("review-strategy").click();
  await expect(page.getByRole("heading", { name: "Trading strategy" })).toBeVisible();
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("50");
  await expect(page.getByLabel("Buy at or below")).toHaveValue("130");
  await expect(page.getByText("24 hours", { exact: true })).toBeVisible();

  await page.getByTestId("strategy-weekly-dca").click();
  await expect(page.getByLabel("Day")).toHaveValue("Friday");
  await expect(page.getByLabel("Local time")).toHaveValue("10:00");
  await page.getByLabel("Purchase amount").fill("75");

  await page.getByTestId("strategy-reserve-buy").click();
  await expect(page.getByLabel("Keep at least")).toHaveValue("200");
  await page.getByTestId("strategy-dip-buy").click();
  await expect(page.getByLabel("Drop from recent high")).toHaveValue("2");
  await expect(page.getByLabel("Recent-high window")).toHaveValue("7");
  await expect(page.getByText("Once every 7 days")).toBeVisible();

  await page.getByTestId("strategy-weekly-dca").click();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("75");
  await expect(page.getByLabel("Maximum per purchase")).toHaveValue("250");
  await expect(page.getByLabel("Daily budget")).toHaveValue("500");
  await expect(page.getByLabel("Monthly budget")).toHaveValue("2000");
  await expect(page.getByLabel("Minimum balance")).toHaveValue("200");
  await expect(page.getByLabel("Maximum price markup")).toHaveValue("0.8");
  await page.getByRole("button", { name: "Save strategy" }).click();
  await expect(page.getByTestId("toast")).toContainText("Trading strategy saved");

  await page.getByRole("button", { name: "Pause strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is active" })).toBeVisible();
  await page.getByRole("button", { name: "Remove strategy" }).click();
  await expectOpaqueSheet(page);
  await page.getByRole("button", { name: "Remove strategy", exact: true }).last().click();
  await expect(page.getByRole("heading", { name: "No strategy saved" })).toBeVisible();
});

test("activity separates purchases and transfers and preserves delivery pending", async ({
  page,
}) => {
  await page.getByTestId("tab-activity").click();
  await page.getByTestId("activity-filter-transfers").click();
  await expect(page.getByText("USDT top-up credited", { exact: true })).toBeVisible();
  await expect(page.getByText("ETH withdrawal completed", { exact: true })).toBeVisible();
  await expect(page.getByText("USDT withdrawal completed", { exact: true })).toBeVisible();
  await expect(page.getByText("Purchase held", { exact: true })).toHaveCount(0);

  await page.getByTestId("activity-filter-purchases").click();
  const pendingPurchase = page.getByRole("button", { name: /Delivery pending Yesterday/ });
  await expect(pendingPurchase).toBeVisible();
  await pendingPurchase.click();
  await expectOpaqueSheet(page);
  await expect(
    page.getByText("Payment is confirmed. XAUH delivery is still in progress."),
  ).toBeVisible();
  await expect(page.getByText("0.38 USDT")).toBeVisible();
  await expect(page.getByText("Payment fee")).toBeVisible();
});

test("wallets copy synthetic addresses and show equal top-up controls", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openWallets(page);
  const agentAddress = page.getByRole("button", { name: "Copy Ethereum agent wallet address" });
  const agentValue = (await agentAddress.innerText()).trim();
  expect(agentValue).toMatch(/^0x[0-9a-f]{40}$/);
  await page.setViewportSize({ width: 320, height: 852 });
  await agentAddress.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(agentValue);

  await connectWallet(page);
  const externalAddress = page.getByRole("button", { name: "Copy external wallet address" });
  const externalValue = (await externalAddress.innerText()).trim();
  expect(externalValue).toMatch(/^0x[0-9a-f]{40}$/);
  expect(externalValue).not.toBe(agentValue);
  await externalAddress.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(externalValue);

  for (const width of [320, 375, 393, 427]) {
    await page.setViewportSize({ width, height: 852 });
    for (const address of [agentAddress, externalAddress]) {
      const overflow = await address.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  }

  await page.getByTestId("top-up-wallet").click();
  const tabs = page.locator(".segmented-control--two button");
  await expect(tabs).toHaveCount(2);
  const [usdtBox, ethBox] = await Promise.all([
    tabs.nth(0).boundingBox(),
    tabs.nth(1).boundingBox(),
  ]);
  expect(Math.abs((usdtBox?.width ?? 0) - (ethBox?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(page.getByText(`External wallet · ${externalValue}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Agent wallet · ${agentValue}`, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("withdraw-wallet").click();
  await expect(page.getByText(`Verified · ${externalValue}`, { exact: true })).toBeVisible();
  await page.getByTestId("review-withdrawal").click();
  await expect(page.getByText(externalValue, { exact: true }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByTestId("tab-activity").click();
  await page.getByRole("button", { name: /ETH withdrawal completed/ }).click();
  await expect(page.getByRole("dialog").getByText(externalValue, { exact: true })).toBeVisible();
  await page.reload();
  await openWallets(page);
  await expect(agentAddress).toHaveText(agentValue);
  await connectWallet(page);
  await expect(externalAddress).toHaveText(externalValue);
});

test("home shows the reference rate and agent-state controls", async ({ page }) => {
  await expect(page.getByText("≈ $1,604.93 · $130/XAUH")).toBeVisible();
  await page.getByTestId("agent-status-trigger").click();
  await expectOpaqueSheet(page);
  await expect(page.locator(".state-options button > svg")).toHaveCount(0);
  await expect(page.getByText("Monitoring", { exact: true })).toBeVisible();
});

test("dark theme preserves readable foregrounds and chat-card spacing", async ({ page }) => {
  await page.goto("/?theme=dark&tab=home");
  await page.getByTestId("agent-status-trigger").click();
  await expectOpaqueSheet(page, darkSheetTheme);

  const agentStateColors = await page
    .locator(".state-options button.is-active")
    .evaluate((button) => {
      const title = button.querySelector("strong")!;
      const description = button.querySelector("small")!;
      return {
        button: getComputedStyle(button).color,
        title: getComputedStyle(title).color,
        description: getComputedStyle(description).color,
      };
    });
  expect(agentStateColors).toEqual({
    button: "rgb(247, 249, 252)",
    title: "rgb(247, 249, 252)",
    description: "rgb(187, 197, 213)",
  });

  await page.goto("/?theme=dark&view=strategy");
  await expect(page.locator(".strategy-screen .risk-note p")).toHaveCSS(
    "color",
    "rgb(187, 197, 213)",
  );

  await page.goto("/?theme=dark&tab=chat");
  await expect(page.locator(".message--agent p").first()).toHaveCSS("color", "rgb(247, 249, 252)");
  await expect(page.locator(".decision-card")).toHaveCSS("margin-bottom", "24px");

  await page.goto("/?theme=dark&tab=wallets");
  await expect(page.locator(".wallets-screen .risk-note p")).toHaveCSS(
    "color",
    "rgb(187, 197, 213)",
  );
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();
  await page.getByRole("button", { name: "ETH", exact: true }).click();
  await page.getByTestId("withdrawal-max").click();
  await expectOpaqueSheet(page, darkSheetTheme);
  await expect(page.getByTestId("bottom-sheet").locator(".risk-note p")).toHaveCSS(
    "color",
    "rgb(187, 197, 213)",
  );
});

test("strategy deep link opens the editor", async ({ page }) => {
  await page.goto("/?theme=light&view=strategy");
  await expect(page.getByRole("heading", { name: "Trading strategy" })).toBeVisible();
});

test("theme controls, focus visibility, and representative widths remain usable", async ({
  page,
}) => {
  await page.getByTestId("settings-trigger").click();
  await expectOpaqueSheet(page);
  await page.getByRole("button", { name: "dark" }).click();
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-theme", "dark");
  await expectOpaqueSheet(page, darkSheetTheme);

  for (const width of [375, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByTestId("app-shell")).toBeVisible();
    const overflow = await page
      .getByTestId("app-shell")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }

  await page.keyboard.press("Escape");
  await page.getByTestId("tab-chat").focus();
  await expect(page.getByTestId("tab-chat")).toBeFocused();
});

test("Ethereum onboarding connection persists and disconnect restores transfer gating", async ({
  page,
}) => {
  await page.getByTestId("settings-trigger").click();
  await page.getByRole("button", { name: "Restart onboarding" }).click();
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-next").click();
  await page.getByRole("button", { name: "Connect Ethereum wallet" }).click();
  await expect(page.getByTestId("onboarding-connect-wallet")).toHaveText(
    "External wallet verified",
  );
  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-next").click();
  await openWallets(page);
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByText("Ethereum", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disconnect wallet" }).click();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  for (const action of ["top-up-wallet", "withdraw-wallet"]) {
    await page.getByTestId(action).click();
    await expect(page.getByRole("dialog")).toHaveAccessibleName("Connect your Ethereum wallet");
    await page.keyboard.press("Escape");
  }
  await connectWallet(page);
});

test("fixed ETH withdrawals reserve gas and preserve the reviewed recipient amount", async ({
  page,
}) => {
  await openWallets(page);
  await connectWallet(page);
  await page.getByTestId("withdraw-wallet").click();
  await page.getByRole("button", { name: "ETH", exact: true }).click();
  for (const invalidAmount of ["0", "-0.1", "invalid", "0.405"]) {
    await page.getByLabel("Withdrawal amount").fill(invalidAmount);
    await expect(page.getByTestId("review-withdrawal")).toBeDisabled();
  }
  await page.getByLabel("Withdrawal amount").fill("0.404");
  await expect(page.getByTestId("review-withdrawal")).toBeEnabled();
  await expect(page.getByText("≈ 0.01 ETH", { exact: true })).toBeVisible();
  await page.getByTestId("review-withdrawal").click();
  await expect(page.getByText("0.404 ETH", { exact: true })).toHaveCount(2);
  await expect(page.getByText("≈ 0.006 ETH", { exact: true })).toBeVisible();
  await page.getByTestId("confirm-withdrawal").click();
  await expect(page.getByText(/Waiting for the Ethereum transfer result/)).toBeVisible();
  await page.getByTestId("complete-withdrawal").click();
  await expect(page.getByText(/0.404 ETH reached your verified external wallet/)).toBeVisible();
});

for (const [title, fee] of [
  ["USDT top-up credited", null],
  ["ETH withdrawal completed", "0.006 ETH"],
  ["USDT withdrawal completed", "0.045 ETH"],
] as const) {
  test(`${title} activity uses Ethereum network and ETH fees`, async ({ page }) => {
    await page.getByTestId("tab-activity").click();
    await page.getByRole("button", { name: new RegExp(title) }).click();
    await expect(page.getByText("Ethereum Mainnet", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed on Ethereum", { exact: true })).toBeVisible();
    if (fee) await expect(page.getByText(fee, { exact: true })).toBeVisible();
  });
}
