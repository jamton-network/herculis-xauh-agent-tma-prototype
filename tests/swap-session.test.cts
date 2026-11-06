import { expect, test } from "@playwright/test";
import { decodeFunctionData, erc20Abi } from "viem";
import { SwapSession } from "../src/live/swapSession";
import { feeBreakdown, minReceipt, parseAmount, routerAbi } from "../src/live/swapModel";
import { config, maker, SwapWallet } from "./swap-wallet.cjs";

test.beforeAll(() => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      async request(_name: string, _options: unknown, action: (lock: object) => Promise<void>) {
        await action({});
      },
    },
  });
});
function harness() {
  const wallet = new SwapWallet(),
    saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };
  const provider = {
    async request(call: { method: string; params?: unknown }) {
      const result = await wallet.handle(call as { method: string; params?: unknown[] });
      if (result && typeof result === "object" && "mockError" in result)
        throw Object.assign(new Error("Synthetic error"), { code: result.mockError });
      return result;
    },
  };
  return {
    wallet,
    saved,
    storage,
    provider,
    session: new SwapSession(config, provider, storage, provider),
  };
}

test("transfer fee accounting handles both sell transfers and does not subtract buy fees twice", () => {
  const fee = { rate: 200n, parts: 1_000_000n };
  expect(feeBreakdown("instant-sell", 100n * 10n ** 18n, 1n, fee)).toEqual([
    20_000_000_000_000_000n,
    19_996_000_000_000_000n,
  ]);
  expect(feeBreakdown("instant-buy", 100_000_000n, 9_998n, fee)).toEqual([2n]);
  expect(minReceipt(1001n, "50")).toBe(995n);
  for (const value of ["-1", "1e3", "0", "1.0000001"])
    expect(() => parseAmount(value, 6)).toThrow();
  for (const value of ["-1", "501", "1.5", "Infinity"])
    expect(() => minReceipt(1001n, value)).toThrow();
});

for (const direction of ["instant-buy", "instant-sell"] as const)
  for (const family of ["constant-product", "concentrated-liquidity"] as const) {
    test(`${direction} executes the manually selected ${family} with exact approvals and net settlement`, async () => {
      const h = harness();
      await h.session.connect();
      expect(h.session.state.readiness, h.session.state.message).toBeDefined();
      await h.session.quote(direction, "1", "50");
      expect(
        h.session.state.estimates.every((item) => item.quote),
        h.session.state.message,
      ).toBe(true);
      const quote = h.session.state.estimates.find((item) => item.family === family)!.quote!;
      expect(quote.output).toBeGreaterThan(0n);
      await h.session.approve(family, false, direction === "instant-buy" ? "usdt" : "xauh");
      expect(h.session.state.operations.at(-1)?.status, h.session.state.message).toBe("pending");
      expect(decodeFunctionData({ abi: erc20Abi, data: h.wallet.sends[0].data }).args).toEqual([
        config.router,
        quote.input,
      ]);
      await h.session.reconcile();
      expect(h.session.state.operations.at(-1)?.status, h.session.state.message).toBe("confirmed");
      expect(h.session.state.estimates).toEqual([]);
      await h.session.quote(direction, "1", "50");
      await h.session.swap(family);
      expect(h.wallet.sends).toHaveLength(2);
      const call = decodeFunctionData({ abi: routerAbi, data: h.wallet.sends[1].data });
      expect(call.functionName).toBe("swap");
      if (call.functionName !== "swap") throw new Error("Unexpected call");
      expect(call.args[0].data.startsWith("0x12")).toBe(family === "concentrated-liquidity");
      await h.session.reconcile();
      expect(h.session.state.operations.at(-1)?.status, h.session.state.message).toBe("confirmed");
      expect(h.session.state.operations.at(-1)?.evidence).toContain(
        "net wallet receipt meets the minimum",
      );
    });
  }

test("a settled history can be checked without expiring a fresh swap quote", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  await h.session.reconcile();
  await h.session.approve("constant-product", true, "usdt");
  await h.session.reconcile();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  await h.session.reconcile();
  await h.session.quote("instant-buy", "1", "50");
  const request = h.provider.request;
  const realNow = Date.now;
  const start = realNow();
  let elapsed = 0;
  let inFlight = 0;
  h.provider.request = async (call) => {
    if (call.method !== "eth_getTransactionReceipt") return request(call);
    if (!inFlight) elapsed += 40_000;
    inFlight++;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return await request(call);
    } finally {
      inFlight--;
    }
  };
  Date.now = () => start + elapsed;
  try {
    await h.session.swap("constant-product");
    expect(h.wallet.sends, h.session.state.message).toHaveLength(4);
    expect(h.session.state.operations.at(-1)?.status).toBe("pending");
  } finally {
    Date.now = realNow;
    h.provider.request = request;
  }
});

test("a failed receipt audit waits for in-flight checks before releasing the transaction lock", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  await h.session.reconcile();
  await h.session.approve("constant-product", true, "usdt");
  await h.session.reconcile();
  await h.session.quote("instant-buy", "1", "50");
  const [first, second] = h.session.state.operations;
  h.wallet.receipts.get(first.hash!)!.blockHash = `0x${"b".repeat(64)}`;
  const request = h.provider.request;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let waiting = false;
  h.provider.request = async (call) => {
    if (
      call.method === "eth_getTransactionReceipt" &&
      (call.params as unknown[])[0] === second.hash
    ) {
      waiting = true;
      await gate;
    }
    return request(call);
  };
  const swap = h.session.swap("constant-product");
  try {
    await expect.poll(() => waiting, { timeout: 2500 }).toBe(true);
    expect(h.session.state.busy).toBe(true);
    await h.session.approve("constant-product", true, "usdt");
    expect(h.wallet.sends).toHaveLength(2);
  } finally {
    release();
    await swap;
    h.provider.request = request;
  }
  expect(h.session.state.busy).toBe(false);
  expect(h.session.state.operations.find((op) => op.id === first.id)?.status).toBe("needs-review");
  expect(h.wallet.sends).toHaveLength(2);
});

test("connected wallet context stays current when provider events are missing", async () => {
  const h = harness();
  await h.session.connect();
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const timers = new Map<number, () => unknown>();
  const fakeWindow = Object.assign(new EventTarget(), {
    setInterval(handler: () => unknown, delay: number) {
      timers.set(delay, handler);
      return delay;
    },
    clearInterval(delay: number) {
      timers.delete(delay);
    },
  });
  const fakeDocument = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  let stop: (() => void) | undefined;
  try {
    stop = h.session.listen();
    await expect.poll(() => h.session.state.discovering).toBe(false);
    await h.session.quote("instant-buy", "1", "50");
    expect(h.session.state.estimates.some((item) => item.quote)).toBe(true);
    const check = timers.get(5000);
    expect(check).toBeDefined();
    const originalAccount = h.wallet.account;
    h.wallet.account = maker;
    await check!();
    await expect.poll(() => h.session.state.account).toBe(maker);
    await expect.poll(() => h.session.state.busy).toBe(false);
    expect(h.session.state.estimates).toEqual([]);
    expect(h.wallet.sends).toHaveLength(0);
    fakeDocument.hidden = true;
    h.wallet.account = originalAccount;
    const hiddenCalls = h.wallet.rpcMethods.length;
    await check!();
    expect(h.wallet.rpcMethods).toHaveLength(hiddenCalls);
    expect(h.session.state.account).toBe(maker);
    fakeDocument.hidden = false;
    fakeWindow.dispatchEvent(new Event("focus"));
    await expect.poll(() => h.session.state.account).toBe(originalAccount);
    await expect.poll(() => h.session.state.busy).toBe(false);
    h.session.disconnect();
    const disconnectedCalls = h.wallet.rpcMethods.length;
    await check!();
    expect(h.wallet.rpcMethods).toHaveLength(disconnectedCalls);
  } finally {
    stop?.();
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
});

test("wrong chain, changed quotes, unsupported liquidity and failed simulation send no transaction", async () => {
  const h = harness();
  h.wallet.chainId = 1;
  await h.session.connect();
  expect(h.session.state.message).toContain("Sepolia");
  expect(h.session.state.readiness).toBeUndefined();
  h.wallet.chainId = config.chainId;
  await h.session.connect();
  h.wallet.closed = true;
  await h.session.quote("instant-buy", "1", "50");
  expect(h.session.state.estimates.every((item) => !item.quote)).toBe(true);
  h.wallet.closed = false;
  await h.session.quote("instant-buy", "1", "50");
  h.session.invalidateQuotes();
  await h.session.approve("constant-product", false, "usdt");
  expect(h.wallet.sends).toHaveLength(0);
  await h.session.quote("instant-buy", "1", "50");
  h.wallet.allowances.set(
    h.wallet.key(config.tokens.usdt, h.wallet.account, config.router),
    1_000_000n,
  );
  h.wallet.simulationFails = true;
  await h.session.swap("constant-product");
  expect(h.wallet.sends).toHaveLength(0);
});

test("an ambiguous wallet response survives reload and recovers without resubmission", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  h.wallet.next = "ambiguous";
  await h.session.approve("constant-product", false, "usdt");
  expect(h.session.state.operations[0].status).toBe("ambiguous");
  const restored = new SwapSession(config, h.provider, h.storage, h.provider);
  await restored.connect();
  await restored.quote("instant-buy", "1", "50");
  await restored.approve("constant-product", true, "usdt");
  expect(h.wallet.sends).toHaveLength(1);
  await restored.reconcile();
  expect(restored.state.operations[0].status, restored.state.message).toBe("confirmed");
  expect(h.wallet.sends).toHaveLength(1);
});

for (const mode of ["reject", "revert", "missing-events"] as const) {
  test(`${mode} never becomes a successful transaction or triggers a retry`, async () => {
    const h = harness();
    await h.session.connect();
    await h.session.quote("instant-buy", "1", "50");
    h.wallet.next = mode;
    await h.session.approve("constant-product", false, "usdt");
    if (mode !== "reject") await h.session.reconcile();
    expect(h.session.state.operations[0].status).toBe(
      mode === "reject" ? "rejected" : mode === "revert" ? "reverted" : "needs-review",
    );
    expect(h.wallet.sends).toHaveLength(1);
  });
}

test("successful swap receipts with incorrect wallet transfers remain blocked for review", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  await h.session.reconcile();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.swap("constant-product");
  const operation = h.session.state.operations.at(-1)!;
  const receipt = h.wallet.receipts.get(operation.hash!)!;
  const logs = receipt.logs as { address: string; data: string }[];
  const output = logs.find(
    (log) => log.address.toLowerCase() === config.tokens.xauh.toLowerCase(),
  )!;
  output.data = `0x${"0".repeat(63)}1`;
  await h.session.reconcile();
  expect(h.session.state.operations.at(-1)?.status).toBe("needs-review");
  await h.session.approve("constant-product", true, "usdt");
  expect(h.wallet.sends).toHaveLength(2);
});

test("wallet-free quotes use public reads and never become executable authorization", async () => {
  const h = harness();
  const session = new SwapSession(config, undefined, h.storage, h.provider);
  await session.quote("instant-buy", "1", "50");
  expect(
    session.state.estimates.every((item) => item.quote),
    session.state.quoteMessage,
  ).toBe(true);
  expect(session.state.estimates.every((item) => item.quote?.account === undefined)).toBe(true);
  expect(session.state.quoteContext?.decimals).toEqual({ xauh: 18, usdt: 6 });
  expect(session.state.account).toBeUndefined();
  expect(h.wallet.rpcMethods).not.toContain("eth_requestAccounts");
  expect(h.wallet.rpcMethods).not.toContain("eth_accounts");
  await session.approve("constant-product", false, "usdt");
  expect(h.wallet.sends).toHaveLength(0);
});

test("insufficient wallet funds do not hide quotes and cannot authorize approval", async () => {
  const h = harness();
  h.wallet.balances.set(h.wallet.key(config.tokens.usdt, h.wallet.account), 0n);
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  expect(
    h.session.state.estimates.every((item) => item.quote),
    h.session.state.quoteMessage,
  ).toBe(true);
  await h.session.approve("constant-product", false, "usdt");
  expect(h.session.state.message).toContain("Insufficient");
  expect(h.wallet.sends).toHaveLength(0);
});

test("disconnect cancels in-flight quotes and preserves submitted transaction recovery", async () => {
  const h = harness();
  await h.session.connect();
  await h.session.quote("instant-buy", "1", "50");
  await h.session.approve("constant-product", false, "usdt");
  const saved = h.saved.get(h.session.storageKey);
  h.session.disconnect();
  expect(h.session.state.account).toBeUndefined();
  expect(h.session.state.estimates).toEqual([]);
  expect(h.saved.get(h.session.storageKey)).toBe(saved);
  expect(h.session.state.operations.at(-1)?.status).toBe("pending");
  await h.session.restore();
  expect(h.session.state.account).toBeUndefined();
  expect(h.wallet.sends).toHaveLength(1);
});

test("an obsolete public quote response cannot restore cleared results", async () => {
  const h = harness();
  let release!: () => void;
  let waiting = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reader = {
    async request(call: { method: string; params?: unknown }) {
      if (call.method === "eth_getCode") {
        waiting = true;
        await gate;
      }
      return h.provider.request(call);
    },
  };
  const session = new SwapSession(config, undefined, h.storage, reader);
  const pending = session.quote("instant-buy", "1", "50");
  for (let i = 0; i < 50 && !waiting; i++) await new Promise((resolve) => setTimeout(resolve, 1));
  expect(waiting).toBe(true);
  session.invalidateQuotes();
  release();
  await pending;
  expect(session.state.estimates).toEqual([]);
  expect(session.state.quoting).toBe(false);
  expect(h.wallet.sends).toHaveLength(0);
});
