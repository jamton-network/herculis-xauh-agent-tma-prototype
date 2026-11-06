import { installSwapConfig } from "./swap-wallet.cjs";
import { expect, test as base } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import config from "../vite.config";

const recoveryKey = "live-aqua-mainnet-v1";
const test = base.extend<{}, { developmentUrl: string }>({
  developmentUrl: [
    async ({ browserName: _browserName }, runWithServer) => {
      const cacheDir = await mkdtemp(join(tmpdir(), "aqua-browser-cache-"));
      const server = await createServer({
        ...config,
        configFile: false,
        cacheDir,
        server: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
      });
      try {
        await server.listen();
        await runWithServer(server.resolvedUrls!.local[0]);
      } finally {
        await server.close();
        await rm(cacheDir, { recursive: true, force: true });
      }
    },
    { scope: "worker" },
  ],
});

for (const route of ["view=strategy", "view=aqua", "view=strategy&section=liquidity"]) {
  test(`Aqua swap loads from ${route} without automatic wallet access`, async ({
    page,
    developmentUrl,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installSwapConfig(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, "ethereum", {
        value: {
          request() {
            throw new Error("Unexpected automatic wallet request");
          },
        },
      });
    });
    await page.goto(`${developmentUrl}?${route}`);
    await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
    await expect(page.getByRole("radio", { name: "Instant buy", exact: true })).toBeChecked();
    await expect(page.getByRole("tablist", { name: "Strategy workspace" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("a failed swap module preserves the selector and existing recovery data", async ({
  page,
  developmentUrl,
}) => {
  const saved = JSON.stringify({ version: 1, operations: [] });
  await page.route("**/src/components/AquaSwapPanel.tsx*", (route) => route.abort());
  await page.goto(`${developmentUrl}?view=strategy`);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: recoveryKey,
    value: saved,
  });
  await expect(page.getByRole("alert")).toContainText("Aqua swap couldn’t load");
  await page.getByRole("radio", { name: "Instant sell", exact: true }).check();
  await expect(page.getByRole("radio", { name: "Instant sell", exact: true })).toBeChecked();
  expect(await page.evaluate((key) => localStorage.getItem(key), recoveryKey)).toBe(saved);
});
