import { expect, test, type Page } from "@playwright/test";

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

async function reopenStrategy(page: Page) {
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByTestId("review-strategy").click();
}

async function restartOnboarding(page: Page) {
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Restart onboarding" }).click();
  for (let step = 0; step < 4; step++) await page.getByTestId("onboarding-next").click();
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
  await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
    "All changes saved",
  );
});

for (const paused of [false, true]) {
  test(`Quantis information preserves every draft and saved settings while ${paused ? "paused" : "active"}`, async ({
    page,
  }) => {
    await mockDraws(page, [1, 2]);
    await page.goto("/?view=strategy");
    if (paused) await page.getByRole("button", { name: "Pause strategy" }).click();
    const fields = [
      ["target-price", { "Purchase amount": "61", "Buy at or below": "125" }],
      ["weekly-dca", { "Purchase amount": "72", Day: "Monday", "Local time": "09:15" }],
      ["reserve-buy", { "Purchase amount": "83", "Keep at least": "310" }],
      [
        "dip-buy",
        { "Purchase amount": "94", "Drop from recent high": "4", "Recent-high window": "14" },
      ],
    ] as const;
    const limits = {
      "Maximum per purchase": "350",
      "Daily budget": "700",
      "Monthly budget": "3000",
      "Minimum balance": "220",
      "Maximum price markup": "1.2",
    };
    for (const [id, values] of fields) {
      await page.getByTestId(`strategy-${id}`).check();
      for (const [label, value] of Object.entries(values)) await page.getByLabel(label).fill(value);
    }
    for (const [label, value] of Object.entries(limits)) await page.getByLabel(label).fill(value);
    const draw = page.getByRole("button", { name: "Choose randomly with Quantis" });
    const result = page.getByRole("status", { name: "Random strategy result" });
    await draw.click();
    await page.getByRole("button", { name: "About Quantis" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("strategy-weekly-dca")).toBeChecked();
    await expect(result).toHaveText("Draw 1: Weekly DCA.");
    await expectDrawCount(page, 1);
    await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
      "Unsaved changes",
    );
    await expect(
      page.getByRole("heading", { name: paused ? "Strategy is paused" : "Strategy is active" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Saved strategy status" })).toContainText(
      "Saved: Target price buy",
    );
    for (const [id, values] of fields) {
      await page.getByTestId(`strategy-${id}`).check();
      for (const [label, value] of Object.entries(values))
        await expect(page.getByLabel(label)).toHaveValue(value);
    }
    for (const [label, value] of Object.entries(limits))
      await expect(page.getByLabel(label)).toHaveValue(value);
    await draw.click();
    await expect(result).toHaveText("Draw 2: Reserve buy.");
    await expectDrawCount(page, 2);
    await reopenStrategy(page);
    await expect(page.getByTestId("strategy-target-price")).toBeChecked();
    await expect(page.getByLabel("Purchase amount")).toHaveValue("50");
    await expect(page.getByLabel("Daily budget")).toHaveValue("500");
    await expect(
      page.getByRole("heading", { name: paused ? "Strategy is paused" : "Strategy is active" }),
    ).toBeVisible();
    await expectDrawCount(page, 2);
  });
}

test("Quantis demo draws all four choices, permits repeats, and never saves the result implicitly", async ({
  page,
}) => {
  await mockDraws(page, [0, 1, 2, 3, 255]);
  await page.goto("/?view=strategy");
  const draw = page.getByRole("button", { name: "Choose randomly with Quantis" });
  const result = page.getByRole("status", { name: "Random strategy result" });
  await expect(page.getByText("Explore a strategy picked at random.")).toBeVisible();
  await expectDrawCount(page, 0);
  const choices = [
    ["target-price", "Target price buy", "Buy at or below"],
    ["weekly-dca", "Weekly DCA", "Day"],
    ["reserve-buy", "Reserve buy", "Keep at least"],
    ["dip-buy", "Dip buy", "Drop from recent high"],
    ["dip-buy", "Dip buy", "Drop from recent high"],
  ];
  for (const [index, [id, title, field]] of choices.entries()) {
    await draw.click();
    await expect(page.getByTestId(`strategy-${id}`)).toBeChecked();
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(result).toContainText(`Draw ${index + 1}: ${title}.`);
    await expect(page.getByLabel(field)).toBeVisible();
    await expect(draw).toBeFocused();
    await expectDrawCount(page, index + 1);
  }
  await expect(result).toContainText("Selected again.");
  await expect(page.getByRole("region", { name: "Saved strategy status" })).toContainText(
    "Saved: Target price buy",
  );
  await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
    "Unsaved changes",
  );
  await reopenStrategy(page);
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await expect(result).toBeEmpty();
  await expectDrawCount(page, 5);
});

test("all strategy parameters and shared limits survive draws, Save, and reopening while Back discards edits", async ({
  page,
}) => {
  await mockDraws(page, [1, 2]);
  await page.goto("/?view=strategy");
  const fields = [
    ["target-price", { "Purchase amount": "61", "Buy at or below": "125" }],
    ["weekly-dca", { "Purchase amount": "72", Day: "Monday", "Local time": "09:15" }],
    ["reserve-buy", { "Purchase amount": "83", "Keep at least": "310" }],
    [
      "dip-buy",
      { "Purchase amount": "94", "Drop from recent high": "4", "Recent-high window": "14" },
    ],
  ] as const;
  const limits = {
    "Maximum per purchase": "350",
    "Daily budget": "700",
    "Monthly budget": "3000",
    "Minimum balance": "220",
    "Maximum price markup": "1.2",
  };
  for (const [id, values] of fields) {
    await page.getByTestId(`strategy-${id}`).check();
    for (const [label, value] of Object.entries(values)) await page.getByLabel(label).fill(value);
  }
  for (const [label, value] of Object.entries(limits)) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await expect(page.getByTestId("strategy-weekly-dca")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("72");
  await page.getByRole("button", { name: "Save strategy" }).click();
  await expect(page.getByRole("status", { name: "Strategy changes" })).toHaveText(
    "All changes saved",
  );
  await page.getByLabel("Purchase amount").fill("999");
  await page.getByLabel("Daily budget").fill("9999");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText(/monitoring Weekly DCA.*Maximum price markup: 1.2%/)).toBeVisible();
  await page.getByTestId("review-strategy").click();
  await expect(page.getByTestId("strategy-weekly-dca")).toBeChecked();
  for (const [id, values] of fields) {
    await page.getByTestId(`strategy-${id}`).check();
    for (const [label, value] of Object.entries(values))
      await expect(page.getByLabel(label)).toHaveValue(value);
  }
  for (const [label, value] of Object.entries(limits))
    await expect(page.getByLabel(label)).toHaveValue(value);
  await expectDrawCount(page, 2);
});

test("unrelated actions never draw and Pause or Resume only affects the saved strategy", async ({
  page,
}) => {
  await mockDraws(page, [1]);
  await page.goto("/?view=strategy");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await page.getByLabel("Purchase amount").fill("88");
  await page.getByLabel("Daily budget").fill("640");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "dark", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 700 });
  await page.getByRole("button", { name: "Pause strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Saved strategy status" })).toContainText(
    "Saved: Target price buy",
  );
  await expect(page.getByLabel("Purchase amount")).toHaveValue("88");
  await page.getByRole("button", { name: "Remove strategy", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Remove strategy", exact: true })).toBeFocused();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toContainText(
    "Draw 1: Weekly DCA.",
  );
  await page.getByRole("button", { name: "Resume strategy" }).click();
  await expect(page.getByRole("region", { name: "Saved strategy status" })).toContainText(
    "Saved: Target price buy",
  );
  await reopenStrategy(page);
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("50");
  await expect(page.getByLabel("Daily budget")).toHaveValue("500");
  await page.getByTestId("strategy-weekly-dca").check();
  await page.getByRole("button", { name: "Pause strategy" }).click();
  await page.getByRole("button", { name: "Save strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await reopenStrategy(page);
  await expect(page.getByTestId("strategy-weekly-dca")).toBeChecked();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await expectDrawCount(page, 1);
});

test("removal preserves saved parameters and limits, requires explicit resume after recreation, and reload resets the demo", async ({
  page,
}) => {
  await mockDraws(page, [2]);
  await page.goto("/?view=strategy");
  await page.getByTestId("strategy-weekly-dca").check();
  await page.getByLabel("Purchase amount").fill("75");
  await page.getByLabel("Daily budget").fill("650");
  await page.getByRole("button", { name: "Save strategy" }).click();
  await page.getByLabel("Purchase amount").fill("999");
  await page.getByLabel("Daily budget").fill("9999");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  const remove = page.getByRole("button", { name: "Remove strategy", exact: true });
  await remove.click();
  await expect(page.getByRole("dialog")).toHaveAccessibleDescription(
    /Remove Weekly DCA.*Unsaved edits will be discarded/,
  );
  await page.getByRole("button", { name: "Keep strategy" }).click();
  await expect(remove).toBeFocused();
  await expect(page.getByTestId("strategy-reserve-buy")).toBeChecked();
  await expect(page.getByLabel("Daily budget")).toHaveValue("9999");
  await remove.click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove strategy", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "No strategy saved" })).toBeVisible();
  await expect(page.getByTestId("review-strategy")).toBeFocused();
  await page.getByTestId("agent-status-trigger").click();
  await expect(page.getByRole("button", { name: /Monitoring Continuously/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Insufficient funds Funding/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await restartOnboarding(page);
  await expect(page.getByRole("heading", { name: "No strategy saved" })).toBeVisible();
  await page.getByTestId("review-strategy").click();
  await expect(page.getByRole("button", { name: "Resume strategy" })).toBeDisabled();
  await expect(remove).toBeDisabled();
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await page.getByTestId("strategy-weekly-dca").check();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("75");
  await expect(page.getByLabel("Daily budget")).toHaveValue("650");
  await page.getByRole("button", { name: "Save strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is paused" })).toBeVisible();
  await page.getByRole("button", { name: "Resume strategy" }).click();
  await expect(page.getByRole("heading", { name: "Strategy is active" })).toBeVisible();
  await expectDrawCount(page, 1);
  await page.reload();
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("50");
  await expect(page.getByLabel("Daily budget")).toHaveValue("500");
  await expectDrawCount(page, 0);
});

test("Save and onboarding preserve insufficient or paused mode and onboarding discards the editor draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByTestId("agent-status-trigger").click();
  await page.getByRole("button", { name: /Insufficient funds Funding/ }).click();
  await page.getByTestId("review-strategy").click();
  await page.getByTestId("strategy-dip-buy").check();
  await page.getByRole("button", { name: "Save strategy" }).click();
  await expect(page.getByRole("heading", { name: "Funding action needed" })).toBeVisible();
  await page.getByLabel("Purchase amount").fill("999");
  await restartOnboarding(page);
  await expect(page.getByRole("heading", { name: "Funding is below reserve" })).toBeVisible();
  await page.getByTestId("review-strategy").click();
  await expect(page.getByTestId("strategy-dip-buy")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("50");
  await page.getByRole("button", { name: "Pause strategy" }).click();
  await restartOnboarding(page);
  await expect(page.getByRole("heading", { name: "Autonomous buying is paused" })).toBeVisible();
});

test("keyboard selection clears the random result and removal from Chat restores focus", async ({
  page,
}) => {
  await mockDraws(page, [1]);
  await page.goto("/?tab=chat");
  const entry = page.getByRole("button", { name: "Open trading strategy" });
  await entry.click();
  const draw = page.getByRole("button", { name: "Choose randomly with Quantis" });
  await draw.focus();
  await draw.press("Enter");
  const weekly = page.getByRole("radio", { name: "Weekly DCA" });
  await page.keyboard.press("Tab");
  await expect(weekly).toBeFocused();
  await weekly.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Reserve buy" })).toBeChecked();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toBeEmpty();
  await page.getByRole("button", { name: "Remove strategy", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove strategy", exact: true })
    .click();
  await expect(entry).toBeFocused();
  await entry.press("Enter");
  await expect(page.getByRole("heading", { name: "No strategy saved" })).toBeVisible();
  await expectDrawCount(page, 1);
});

test("unavailable browser randomness keeps the draft and allows manual selection", async ({
  page,
}) => {
  await mockDraws(page, []);
  await page.goto("/?view=strategy");
  await page.getByLabel("Purchase amount").fill("70");
  await page.getByRole("button", { name: "Choose randomly with Quantis" }).click();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toHaveText(
    "Random choice is unavailable. Choose a strategy manually.",
  );
  await expect(page.getByTestId("strategy-target-price")).toBeChecked();
  await expect(page.getByLabel("Purchase amount")).toHaveValue("70");
  await page.getByRole("radio", { name: "Weekly DCA" }).check();
  await expect(page.getByRole("status", { name: "Random strategy result" })).toBeEmpty();
});
