import { expect, test, type Page } from "@playwright/test";
import { installSwapConfig } from "./swap-wallet.cjs";

test.beforeEach(async ({ page }) => installSwapConfig(page));

async function mockDraws(page: Page, values: number[]) {
  await page.addInitScript((draws) => {
    const telemetry = window as typeof window & { demoRandomCalls: number };
    telemetry.demoRandomCalls = 0;
    const original = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      value: (array: Uint8Array<ArrayBuffer>) => {
        if (array instanceof Uint8Array && array.length === 1) {
          const value = draws[telemetry.demoRandomCalls++];
          if (value === undefined) throw new Error("Unexpected random draw");
          array[0] = value;
          return array;
        }
        return original(array);
      },
    });
  }, values);
}

async function expectDrawCount(page: Page, count: number) {
  expect(
    await page.evaluate(
      () => (window as typeof window & { demoRandomCalls: number }).demoRandomCalls,
    ),
  ).toBe(count);
}

test("Quantis information loads its local image on demand and supports keyboard and pointer dismissal", async ({
  page,
}) => {
  await mockDraws(page, []);
  const imageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/assets/quantis-device.webp")) imageRequests.push(request.url());
  });
  await page.goto("/?view=strategy");
  const about = page.getByRole("button", { name: "About Quantis" });
  const dialog = page.getByRole("dialog", { name: "About Quantis" });
  const close = dialog.getByRole("button", { name: "Dismiss dialog" });
  const product = dialog.getByRole("link", {
    name: "Quantis USB product details (opens in a new tab)",
  });
  const overview = dialog.getByRole("link", {
    name: "About quantum random number generation (opens in a new tab)",
  });
  await expect(dialog).toHaveCount(0);
  expect(imageRequests).toHaveLength(0);
  await about.focus();
  const imageResponse = page.waitForResponse((response) =>
    response.url().endsWith("/assets/quantis-device.webp"),
  );
  await about.press("Enter");
  await expect(dialog).toHaveAccessibleDescription(
    "Quantis is a hardware quantum random number generator from ID Quantique. It uses quantum processes to generate random numbers.",
  );
  await expect(close).toBeFocused();
  const response = await imageResponse;
  expect(response.ok()).toBe(true);
  expect((await response.body()).byteLength).toBeLessThanOrEqual(150_000);
  const image = dialog.getByRole("img", {
    name: "Black Quantis random number generator with an ID Quantique label.",
  });
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight]),
    )
    .toEqual([1110, 580]);
  await expect(dialog.getByText("Quantis device by ID Quantique.")).toBeVisible();
  await expect(product).toHaveAttribute(
    "href",
    "https://coredevx.com/site/en/idq-quantis-qrng-usb/",
  );
  await expect(overview).toHaveAttribute(
    "href",
    "https://www.idquantique.com/random-number-generation/overview/",
  );
  for (const link of [product, overview]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(overview).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(about).toBeFocused();
  await about.press("Space");
  await expect(dialog).toBeVisible();
  await close.click();
  await expect(about).toBeFocused();
  await about.click();
  await expect(dialog).toBeVisible();
  await page.getByTestId("sheet-overlay").click({ position: { x: 4, y: 4 } });
  await expect(dialog).toHaveCount(0);
  await expect(about).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Choose randomly with Quantis" })).toBeFocused();
  await expectDrawCount(page, 0);
  await expect(page.getByRole("status", { name: "Random strategy result" })).toBeEmpty();
});

test("Quantis draws only instant strategies and permits repeats without wallet activity", async ({
  page,
}) => {
  await mockDraws(page, [0, 1, 255, 254]);
  await page.goto("/?view=strategy");
  const choose = page.getByRole("button", { name: "Choose randomly with Quantis" });
  for (const [index, name] of [
    "Instant buy",
    "Instant sell",
    "Instant sell",
    "Instant buy",
  ].entries()) {
    await choose.click();
    await expect(page.getByRole("radio", { name, exact: true })).toBeChecked();
    await expect(page.getByRole("status", { name: "Random strategy result" })).toContainText(
      `Draw ${index + 1}: ${name}.`,
    );
  }
  await expect(page.getByText(/each have a 50% chance/)).toBeVisible();
  for (const name of ["Target price buy", "Weekly DCA", "Reserve buy", "Dip buy"])
    await expect(page.getByRole("radio", { name, exact: true })).toBeDisabled();
  await expectDrawCount(page, 4);
});

test("keyboard selection skips Soon rules and clears the random announcement", async ({ page }) => {
  await mockDraws(page, [0]);
  await page.goto("/?view=strategy");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  const buy = page.getByRole("radio", { name: "Instant buy", exact: true });
  await buy.focus();
  await buy.press("ArrowDown");
  await expect(page.getByRole("radio", { name: "Instant sell", exact: true })).toBeChecked();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toBeEmpty();
  await page.keyboard.press("ArrowDown");
  await expect(buy).toBeChecked();
  await expectDrawCount(page, 1);
});

test("unavailable randomness preserves manual choices", async ({ page }) => {
  await mockDraws(page, []);
  await page.goto("/?view=strategy");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toContainText(
    "unavailable",
  );
  await page.getByRole("radio", { name: "Instant sell", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Instant sell", exact: true })).toBeChecked();
});
