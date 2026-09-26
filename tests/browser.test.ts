import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`${theme} screens fill the browser and remain usable across viewport sizes`, async ({
    page,
  }) => {
    for (const width of [320, 375, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of [
        "tab=home",
        "tab=chat",
        "tab=wallets",
        "tab=activity",
        "view=strategy",
      ]) {
        await page.goto(`/?theme=${theme}&${route}`);
        await expect(page.getByTestId("app-shell")).toHaveAttribute("data-theme", theme);
        const settings = page.getByRole("button", { name: "Open demo settings" });
        await expect(settings).toBeInViewport();
        const settingsBounds = await settings.boundingBox();
        expect(settingsBounds!.width).toBe(44);
        expect(settingsBounds!.height).toBe(44);
        const layout = await page.evaluate(() => {
          const app = document.querySelector<HTMLElement>(".app-shell")!;
          const content = document.querySelector<HTMLElement>("main")!;
          const scroll = document.querySelector<HTMLElement>(".app-scroll")!;
          const header = document.querySelector<HTMLElement>(".brand-header")!;
          const title = document.querySelector<HTMLElement>(".brand-title-wrap")!;
          return {
            width: app.getBoundingClientRect().width,
            height: app.getBoundingClientRect().height,
            contentWidth: content.getBoundingClientRect().width,
            overflow: Math.max(
              app.scrollWidth - app.clientWidth,
              content.scrollWidth - content.clientWidth,
              header.scrollWidth - header.clientWidth,
            ),
            scrollTop: scroll.getBoundingClientRect().top,
            headerBottom: header.getBoundingClientRect().bottom,
            titleRight: title.getBoundingClientRect().right,
          };
        });
        expect(layout.width).toBe(width);
        expect(layout.height).toBe(844);
        expect(layout.contentWidth).toBeLessThanOrEqual(1120);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        expect(layout.scrollTop).toBeGreaterThanOrEqual(layout.headerBottom);
        expect(settingsBounds!.x).toBeGreaterThan(layout.titleRight);
        if (!route.startsWith("view")) {
          const nav = await page.getByRole("navigation").boundingBox();
          expect(nav!.y + nav!.height).toBeCloseTo(844, 0);
        }
      }
      await page.goto(`/?theme=${theme}#onboarding`);
      await expect(
        page.getByRole("heading", { name: "One agent across bot and TMA" }),
      ).toBeVisible();
      const onboardingOverflow = await page
        .locator("main")
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(onboardingOverflow).toBeLessThanOrEqual(1);
    }
  });
}

test("native chat input and scroll stay usable when the visible viewport shrinks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/?tab=chat");
  const input = page.getByRole("textbox", { name: "Message the agent" });
  await input.fill("Explain the demo strategy");
  await expect(input).toBeFocused();
  await page.setViewportSize({ width: 375, height: 480 });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("Explain the demo strategy");
  const composer = await page.getByTestId("chat-composer").boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(nav!.y);
  await input.press("Enter");
  await expect(page.getByText("Explain the demo strategy", { exact: true })).toBeVisible();
  await expect(page.getByText(/This is a simulated reply/)).toBeVisible();
  await expect(input).toHaveValue("");
  await expect(page.getByTestId("send-message")).toBeDisabled();
  await expect
    .poll(() => page.locator(".chat-scroll").evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(page.getByRole("button", { name: "Open trading strategy" })).toBeVisible();
});

test("dialogs provide descriptions, trap focus, and restore focus after dismissal", async ({
  page,
}) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open demo settings" });
  const dialog = page.getByRole("dialog");
  await page.keyboard.press("Tab");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await page.locator(".brand-coin").click();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(dialog).toHaveAccessibleName("Demo settings");
  await expect(dialog).toHaveAccessibleDescription(
    "Choose a theme and explore the simulated experience.",
  );
  for (let index = 0; index < 14; index++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  for (const key of ["Enter", "Space"]) {
    await trigger.press(key);
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "Dismiss dialog" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("system theme changes update both the app and open dialogs", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?tab=wallets");
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("connect-wallet").click();
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(17, 23, 34)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.getByTestId("app-shell")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("dialog")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("clipboard failure reports the failure without claiming success", async ({ page }) => {
  await page.goto("/?tab=wallets");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Clipboard denied")) },
    });
  });
  await page.getByRole("button", { name: "Copy TON agent wallet address" }).click();
  await expect(page.getByRole("status")).toContainText("Could not copy the demo address");
});

test("demo interactions make no external requests", async ({ page }) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?tab=wallets");
  await page.getByTestId("connect-wallet").click();
  await page.getByTestId("verify-wallet").click();
  await page.getByTestId("top-up-wallet").click();
  await page.getByTestId("review-top-up").click();
  await page.getByTestId("confirm-top-up").click();
  await page.getByTestId("complete-top-up").click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByTestId("tab-chat").click();
  await page.getByRole("textbox").fill("Test a demo reply");
  await page.getByTestId("send-message").click();
  await expect(page.getByText(/This is a simulated reply/)).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("browser preview viewport mismatch does not truncate the full-page app", async ({ page }) => {
  await page.addInitScript(() => {
    const viewport = new EventTarget();
    Object.assign(viewport, { width: 640, height: 450, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const shell = await page.getByTestId("app-shell").boundingBox();
  const nav = await page.getByRole("navigation").boundingBox();
  expect(shell!.height).toBe(900);
  expect(nav!.y + nav!.height).toBe(900);
});
