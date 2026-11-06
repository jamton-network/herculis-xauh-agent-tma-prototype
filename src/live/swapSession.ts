import {
  createPublicClient,
  custom,
  http,
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  isHex,
  keccak256,
  numberToHex,
  zeroAddress,
  type Address,
  type EIP1193RequestFn,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import type { ExecutionFamily } from "../types";
export type BrowserProvider = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
};
import {
  feeTokenAbi,
  forkReadAbi,
  type SwapConfig,
  type SwapDirection,
  type SwapToken,
} from "./swapConfig";
import {
  feeBreakdown,
  inputToken,
  isUnresolved,
  minReceipt,
  operationIdentity,
  parseAmount,
  receiptSummary,
  registryAbi,
  routerAbi,
  sameAddress,
  swapPayload,
  tokenFee,
  type FeeRate,
  type SwapEstimate,
  type SwapOperation,
  type SwapQuote,
} from "./swapModel";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export type SwapReadiness = {
  block: bigint;
  timestamp: bigint;
  decimals: Record<SwapToken, number>;
  balances: Record<SwapToken, bigint>;
  allowances: Record<SwapToken, bigint>;
  eth: bigint;
  fee: FeeRate;
};
export type SwapState = {
  busy: boolean;
  quoting: boolean;
  quoteMessage: string;
  quoteContext?: Pick<SwapReadiness, "block" | "timestamp" | "decimals" | "fee">;
  account?: Address;
  chainId: number;
  message: string;
  readiness?: SwapReadiness;
  estimates: SwapEstimate[];
  operations: SwapOperation[];
  storageError?: string;
};

function isRejection(error: unknown): boolean {
  let current = error;
  for (let i = 0; i < 8 && current && typeof current === "object"; i++) {
    if ("code" in current && current.code === 4001) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export class SwapSession {
  private listeners = new Set<() => void>();
  private generation = 0;
  private quoteRequest = 0;
  private walletEnabled = false;
  private walletRefreshQueued = false;
  private client;
  private previewClient;
  readonly storageKey: string;
  state: SwapState;

  constructor(
    readonly config: SwapConfig,
    private provider: BrowserProvider | undefined,
    private storage: Storage,
    publicProvider?: BrowserProvider,
  ) {
    this.storageKey = `aqua-swap-${config.chainId}-${config.router.toLowerCase()}`;
    this.client = createPublicClient({
      chain: sepolia,
      cacheTime: 0,
      transport: custom(
        {
          request: ((args) => {
            if (!this.provider) throw new Error("Install an Ethereum browser wallet to continue.");
            return this.provider.request(args);
          }) as EIP1193RequestFn,
        },
        { retryCount: 0 },
      ),
    });
    this.previewClient = createPublicClient({
      chain: sepolia,
      cacheTime: 0,
      transport: publicProvider
        ? custom(
            { request: publicProvider.request.bind(publicProvider) as EIP1193RequestFn },
            { retryCount: 0 },
          )
        : http(config.rpcUrl, { retryCount: 1, timeout: 10_000 }),
    });
    let operations: SwapOperation[] = [];
    let storageError: string | undefined;
    try {
      operations = this.readOperations();
    } catch {
      storageError =
        "Transaction recovery storage is unavailable or invalid. Writes are blocked; preserve this browser’s saved data.";
    }
    this.state = {
      busy: false,
      quoting: false,
      quoteMessage: "Enter an amount to preview live quotes.",
      chainId: 0,
      estimates: [],
      operations,
      storageError,
      message: "Connect your browser wallet to trade on Sepolia.",
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<SwapState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  invalidateQuotes = () => {
    this.generation++;
    this.quoteRequest++;
    this.update({ estimates: [], quoting: false, quoteMessage: "Waiting for updated quotes…" });
  };
  private contextChanged = () => {
    this.invalidateQuotes();
    this.update({
      account: undefined,
      chainId: 0,
      readiness: undefined,
      message: this.walletEnabled
        ? "Wallet context changed. Refreshing the connection…"
        : "Connect your browser wallet to trade on Sepolia. Quotes are available without connecting.",
    });
    if (!this.walletEnabled) return;
    if (this.state.busy) this.walletRefreshQueued = true;
    else void this.restore();
  };

  restore() {
    if (!this.provider || !this.walletEnabled) return Promise.resolve();
    return this.run(async () => {
      try {
        await this.refreshInternal();
        this.update({ message: "Wallet connected on Sepolia." });
      } catch (error) {
        if (!this.state.account) {
          this.update({
            message:
              "Connect your browser wallet to trade on Sepolia. Quotes are available without connecting.",
          });
          return;
        }
        throw error;
      }
    });
  }

  disconnect() {
    if (this.state.busy) return;
    this.walletEnabled = false;
    this.invalidateQuotes();
    this.update({
      account: undefined,
      chainId: 0,
      readiness: undefined,
      message: "Wallet disconnected from this app. Saved transactions remain recoverable.",
    });
  }

  listen() {
    for (const event of ["accountsChanged", "chainChanged", "disconnect"])
      this.provider?.on?.(event, this.contextChanged);
    const changed = (event: StorageEvent) => {
      if (event.key !== this.storageKey) return;
      this.contextChanged();
      try {
        this.update({ operations: this.readOperations() });
      } catch {
        this.update({ storageError: "Recovery data changed unexpectedly. Writes are blocked." });
      }
    };
    window.addEventListener("storage", changed);
    let active = true,
      polling = false;
    const pollWallet = async () => {
      const provider = this.provider;
      if (!active || polling || !provider || !this.walletEnabled || document.hidden) return;
      polling = true;
      const generation = this.generation;
      try {
        const [chain, accounts] = await Promise.all([
          provider.request({ method: "eth_chainId" }),
          provider.request({ method: "eth_accounts" }),
        ]);
        if (!active || !this.walletEnabled || generation !== this.generation) return;
        const chainId = typeof chain === "string" ? Number(BigInt(chain)) : 0;
        const account =
          Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0])
            ? getAddress(accounts[0])
            : undefined;
        if (chainId !== this.state.chainId || account !== this.state.account) this.contextChanged();
      } catch {
        if (active && this.walletEnabled && generation === this.generation) this.contextChanged();
      } finally {
        polling = false;
      }
    };
    const visible = () => void pollWallet();
    const walletTimer = window.setInterval(pollWallet, 5000);
    window.addEventListener("focus", pollWallet);
    document.addEventListener("visibilitychange", visible);
    return () => {
      active = false;
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        this.provider?.removeListener?.(event, this.contextChanged);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", pollWallet);
      window.clearInterval(walletTimer);
      document.removeEventListener("visibilitychange", visible);
      this.invalidateQuotes();
    };
  }

  private readOperations(): SwapOperation[] {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return [];
    const saved = JSON.parse(raw);
    if (
      saved.version !== 1 ||
      saved.registry !== this.config.registry ||
      !Array.isArray(saved.operations)
    )
      throw new Error("Invalid recovery data.");
    for (const operation of saved.operations as SwapOperation[]) {
      if (
        !isAddress(operation.account) ||
        !isAddress(operation.to) ||
        !isHex(operation.data) ||
        !Number.isSafeInteger(operation.nonce) ||
        operation.nonce < 0 ||
        BigInt(operation.startBlock) < 0n ||
        BigInt(operation.scanBlock) < BigInt(operation.startBlock) ||
        !["approval", "swap"].includes(operation.kind) ||
        ![
          "awaiting-wallet",
          "ambiguous",
          "pending",
          "confirmed",
          "rejected",
          "reverted",
          "replaced",
          "needs-review",
        ].includes(operation.status) ||
        (operation.hash && !/^0x[\da-f]{64}$/i.test(operation.hash)) ||
        (operation.receiptBlockHash && !/^0x[\da-f]{64}$/i.test(operation.receiptBlockHash)) ||
        operationIdentity(this.config, operation) !== operation.id
      )
        throw new Error("Invalid recovery operation.");
    }
    if (
      new Set(saved.operations.map((operation: SwapOperation) => operation.id)).size !==
      saved.operations.length
    )
      throw new Error("Duplicate recovery operation.");
    return saved.operations;
  }

  private save(operations: SwapOperation[]) {
    if (this.state.storageError) throw new Error(this.state.storageError);
    try {
      const raw = JSON.stringify({ version: 1, registry: this.config.registry, operations });
      this.storage.setItem(this.storageKey, raw);
      if (this.storage.getItem(this.storageKey) !== raw) throw new Error("Storage write failed.");
    } catch {
      this.update({ storageError: "Transaction recovery could not be saved. Writes are blocked." });
      throw new Error("Recovery storage failed. Reconcile any wallet request before continuing.");
    }
    this.update({ operations });
  }
  private replace(operation: SwapOperation) {
    this.save(this.state.operations.map((item) => (item.id === operation.id ? operation : item)));
  }
  private async run(action: () => Promise<void>) {
    if (this.state.busy) return;
    this.quoteRequest++;
    this.update({ busy: true, quoting: false });
    try {
      await action();
    } catch (error) {
      this.update({
        message: isRejection(error)
          ? "Wallet request rejected. Nothing was retried automatically."
          : error instanceof Error
            ? error.message
            : "Wallet request failed. Refresh and reconcile before continuing.",
      });
    } finally {
      this.update({ busy: false });
      if (this.walletRefreshQueued) {
        this.walletRefreshQueued = false;
        void this.restore();
      }
    }
  }
  private async exclusive(action: () => Promise<void>) {
    if (this.state.storageError) throw new Error(this.state.storageError);
    if (!navigator.locks)
      throw new Error("Use a browser with Web Locks to protect transaction recovery.");
    await navigator.locks.request(this.storageKey, { ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error("Another tab is handling a transaction. Reconcile there first.");
      this.update({ operations: this.readOperations() });
      await action();
    });
  }
  private async identity() {
    if (!this.provider) throw new Error("Install an Ethereum browser wallet to continue.");
    const chain = await this.provider.request({ method: "eth_chainId" });
    const accounts = await this.provider.request({ method: "eth_accounts" });
    const chainId = typeof chain === "string" ? Number(BigInt(chain)) : 0;
    const account =
      Array.isArray(accounts) && typeof accounts[0] === "string" && isAddress(accounts[0])
        ? getAddress(accounts[0])
        : undefined;
    if (this.state.chainId !== chainId || this.state.account !== account) {
      this.invalidateQuotes();
      this.update({ chainId, account, readiness: undefined });
    }
    if (chainId !== this.config.chainId)
      throw new Error("Switch your wallet to Sepolia to continue.");
    if (!account) throw new Error("Connect an account in your browser wallet.");
    return account;
  }
  connect() {
    return this.run(async () => {
      if (!this.provider) throw new Error("Install an Ethereum browser wallet to continue.");
      await this.provider.request({ method: "eth_requestAccounts" });
      this.walletEnabled = true;
      await this.refreshInternal();
      this.update({
        message: "Wallet connected on Sepolia. Quotes refresh automatically.",
      });
    });
  }
  switchNetwork() {
    return this.run(async () => {
      if (!this.provider) throw new Error("Install an Ethereum browser wallet to continue.");
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: numberToHex(this.config.chainId) }],
      });
      await this.refreshInternal();
      this.update({ message: "Sepolia selected. Quotes refresh automatically." });
    });
  }
  refresh() {
    return this.run(async () => {
      this.invalidateQuotes();
      await this.refreshInternal();
      this.update({ message: "Wallet balances and allowances refreshed from Sepolia." });
    });
  }

  private async inspect(
    client: Pick<typeof this.client, "getBlock" | "getCode" | "readContract" | "getChainId">,
    completedBlock = false,
  ) {
    if ((await client.getChainId()) !== this.config.chainId)
      throw new Error("The quote RPC must use Sepolia.");
    const head = await client.getBlock();
    const block =
      completedBlock && head.number > 0n
        ? await client.getBlock({ blockNumber: head.number - 1n })
        : head;
    const contracts = {
      router: this.config.router,
      registry: this.config.registry,
      ...this.config.tokens,
    };
    await Promise.all(
      (["router", "registry", "xauh", "usdt"] as const).map(async (name) => {
        const code = await client.getCode({ address: contracts[name], blockNumber: block.number });
        if (!code || keccak256(code) !== this.config.codeHashes[name])
          throw new Error("Contract code verification failed. Transactions are blocked.");
      }),
    );
    const binding = await client.readContract({
      address: this.config.router,
      abi: forkReadAbi,
      functionName: "AQUA",
      blockNumber: block.number,
    });
    if (!sameAddress(binding, this.config.registry))
      throw new Error("Router registry verification failed.");
    const [xauhDecimals, usdtDecimals, rate, parts] = await Promise.all([
      client.readContract({
        address: this.config.tokens.xauh,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber: block.number,
      }),
      client.readContract({
        address: this.config.tokens.usdt,
        abi: erc20Abi,
        functionName: "decimals",
        blockNumber: block.number,
      }),
      client.readContract({
        address: this.config.tokens.xauh,
        abi: feeTokenAbi,
        functionName: "FEE_RATE",
        blockNumber: block.number,
      }),
      client.readContract({
        address: this.config.tokens.xauh,
        abi: feeTokenAbi,
        functionName: "FEE_PARTS",
        blockNumber: block.number,
      }),
    ]);
    if (xauhDecimals > 36 || usdtDecimals > 36) throw new Error("Unsupported token decimals.");
    const decimals = { xauh: xauhDecimals, usdt: usdtDecimals };
    tokenFee(1n, { rate, parts });
    return { block, decimals, fee: { rate, parts } };
  }

  private async refreshInternal() {
    this.update({ readiness: undefined });
    const account = await this.identity();
    const generation = this.generation;
    const { block, decimals, fee } = await this.inspect(this.client);
    const balances = {} as Record<SwapToken, bigint>,
      allowances = {} as Record<SwapToken, bigint>;
    await Promise.all(
      (["xauh", "usdt"] as const).map(async (token) => {
        [balances[token], allowances[token]] = await Promise.all([
          this.client.readContract({
            address: this.config.tokens[token],
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
            blockNumber: block.number,
          }),
          this.client.readContract({
            address: this.config.tokens[token],
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, this.config.router],
            blockNumber: block.number,
          }),
        ]);
      }),
    );
    const eth = await this.client.getBalance({ address: account, blockNumber: block.number });
    await this.identity();
    if (generation !== this.generation)
      throw new Error("Wallet changed while reading. Refresh again.");
    this.update({
      readiness: {
        block: block.number,
        timestamp: block.timestamp,
        decimals,
        balances,
        allowances,
        eth,
        fee,
      },
    });
  }

  async quote(direction: SwapDirection, text: string, slippage: string) {
    if (this.state.busy || this.state.quoting) return;
    this.invalidateQuotes();
    const generation = this.generation,
      request = ++this.quoteRequest,
      account = this.state.account;
    this.update({ quoting: true, quoteMessage: "Updating live quotes…" });
    const current = () =>
      request === this.quoteRequest && generation === this.generation && !this.state.busy;
    try {
      parseAmount(text, 36);
      minReceipt(10_000n, slippage);
      const { block, decimals, fee } = await this.inspect(this.previewClient, true);
      if (!current()) return;
      const input = parseAmount(text, decimals[inputToken(direction)]);
      const deadline = block.timestamp + 90n,
        expiresAt = Number(deadline) * 1000;
      const estimates = await Promise.all(
        this.config.orders.map(async (order): Promise<SwapEstimate> => {
          try {
            if (sameAddress(order.maker, account))
              throw new Error("Use a different wallet from the liquidity provider.");
            const initialized = await this.previewClient.readContract({
              address: this.config.router,
              abi: forkReadAbi,
              functionName: "feeOnTransferInitialized",
              args: [order.hash],
              blockNumber: block.number,
            });
            if (!initialized) throw new Error("This liquidity position is not initialized.");
            for (const asset of ["xauh", "usdt"] as const) {
              const [, count] = await this.previewClient.readContract({
                address: this.config.registry,
                abi: registryAbi,
                functionName: "rawBalances",
                args: [order.maker, this.config.router, order.hash, this.config.tokens[asset]],
                blockNumber: block.number,
              });
              if (count !== 2) throw new Error("This liquidity position is closed or unavailable.");
            }
            const result = await this.previewClient.call({
              account: account ?? zeroAddress,
              ...swapPayload(this.config, { order, direction, input, minimum: 1n, deadline }, true),
              blockNumber: block.number,
            });
            if (!result.data) throw new Error("Router returned no quote.");
            const [amountIn, output, hash] = decodeFunctionResult({
              abi: routerAbi,
              functionName: "quote",
              data: result.data,
            });
            if (amountIn !== input || output <= 0n || hash !== order.hash)
              throw new Error("Router quote does not match the selected position.");
            const firstInputFee = direction === "instant-sell" ? tokenFee(input, fee) : 0n;
            const swapFee =
              ((input - firstInputFee) * order.feeUnits + 999_999_999n) / 1_000_000_000n;
            return {
              family: order.family,
              quote: {
                order,
                direction,
                account,
                input,
                output,
                minimum: minReceipt(output, slippage),
                transferFees: feeBreakdown(direction, input, output, fee),
                swapFee,
                feeRate: fee,
                block: block.number,
                deadline,
                expiresAt,
                generation,
              },
            };
          } catch (error) {
            return {
              family: order.family,
              error: error instanceof Error ? error.message : "Quote unavailable.",
            };
          }
        }),
      );
      if (!current()) return;
      if (Date.now() >= expiresAt)
        throw new Error("Quotes expired while loading. Refreshing again shortly.");
      this.update({
        estimates,
        quoteContext: { block: block.number, timestamp: block.timestamp, decimals, fee },
        quoteMessage: estimates.some((item) => item.quote)
          ? "Fresh quotes ready. Auto-refreshes every 15 seconds."
          : "No liquidity option is currently available.",
      });
    } catch (error) {
      if (current())
        this.update({
          estimates: [],
          quoteMessage:
            error instanceof Error
              ? error.message
              : "Live quotes could not load. Retrying shortly.",
        });
    } finally {
      if (request === this.quoteRequest) this.update({ quoting: false });
    }
  }

  private selected(family: ExecutionFamily): SwapQuote {
    const quote = this.state.estimates.find((item) => item.family === family)?.quote;
    if (
      !quote ||
      quote.generation !== this.generation ||
      !sameAddress(quote.account, this.state.account) ||
      Date.now() >= quote.expiresAt
    )
      throw new Error("Request a fresh quote before continuing.");
    return quote;
  }
  approve(family: ExecutionFamily, reset: boolean, token: SwapToken) {
    return this.write("approval", async () => {
      const ready = this.state.readiness!;
      const current = ready.allowances[token];
      const quote = reset ? undefined : this.selected(family);
      if (quote && inputToken(quote.direction) !== token)
        throw new Error("Input token changed. Request fresh quotes.");
      const amount = reset ? 0n : quote!.input;
      if (current !== 0n && amount !== 0n) throw new Error("Reset the existing allowance first.");
      if (amount > ready.balances[token]) throw new Error("Insufficient token balance.");
      return {
        to: this.config.tokens[token],
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [this.config.router, amount],
        }),
      };
    });
  }
  swap(family: ExecutionFamily) {
    return this.write("swap", async () => {
      const quote = this.selected(family),
        ready = this.state.readiness!,
        token = inputToken(quote.direction);
      if (
        ready.timestamp >= quote.deadline ||
        ready.balances[token] < quote.input ||
        ready.allowances[token] !== quote.input
      )
        throw new Error(
          "Balance, allowance or quote changed. Reset the allowance if needed and request a fresh quote.",
        );
      if (quote.feeRate.rate !== ready.fee.rate || quote.feeRate.parts !== ready.fee.parts)
        throw new Error("Token fees changed. Request fresh quotes.");
      return {
        ...swapPayload(this.config, quote),
        feeRate: { rate: quote.feeRate.rate.toString(), parts: quote.feeRate.parts.toString() },
      };
    });
  }

  private write(
    kind: SwapOperation["kind"],
    prepare: () => Promise<{ to: Address; data: Hex; feeRate?: SwapOperation["feeRate"] }>,
  ) {
    return this.run(async () =>
      this.exclusive(async () => {
        if (this.state.operations.some(isUnresolved))
          throw new Error("Reconcile the unresolved transaction before another wallet action.");
        await this.checkConfirmed();
        await this.refreshInternal();
        const generation = this.generation,
          account = this.state.account!;
        if (this.state.readiness!.eth <= 0n)
          throw new Error("Your wallet needs Sepolia ETH for network fees.");
        const payload = await prepare();
        await this.client.call({ account, to: payload.to, data: payload.data });
        const gas = await this.client.estimateGas({ account, to: payload.to, data: payload.data });
        const nonce = await this.client.getTransactionCount({
          address: account,
          blockTag: "pending",
        });
        await this.identity();
        if (generation !== this.generation || !sameAddress(account, this.state.account))
          throw new Error("Wallet or swap settings changed before confirmation.");
        const currentBlock = await this.client.getBlock();
        await this.identity();
        if (generation !== this.generation || !sameAddress(account, this.state.account))
          throw new Error("Wallet or swap settings changed before confirmation.");
        if (kind === "swap") {
          const call = decodeFunctionData({ abi: routerAbi, data: payload.data });
          if (call.functionName !== "swap") throw new Error("Invalid swap call.");
          const selected = this.state.estimates.find(
            (item) =>
              item.quote &&
              item.quote.input === call.args[3] &&
              item.quote.order.maker.toLowerCase() === call.args[0].maker.toLowerCase(),
          )?.quote;
          if (
            !selected ||
            Date.now() >= selected.expiresAt ||
            currentBlock.timestamp >= selected.deadline
          )
            throw new Error("Quote expired before wallet confirmation. Request a fresh quote.");
        }
        const operation: SwapOperation = {
          ...payload,
          kind,
          account,
          nonce,
          startBlock: currentBlock.number.toString(),
          scanBlock: currentBlock.number.toString(),
          status: "awaiting-wallet",
          id: operationIdentity(this.config, { account, nonce, ...payload }),
        };
        const existing = this.state.operations.find((item) => item.id === operation.id);
        if (existing && existing.status !== "rejected")
          throw new Error("This transaction identity was already submitted. Reconcile it first.");
        if (existing) this.replace(operation);
        else this.save([...this.state.operations, operation]);
        this.invalidateQuotes();
        try {
          const hash = await this.provider!.request({
            method: "eth_sendTransaction",
            params: [
              {
                from: account,
                to: payload.to,
                data: payload.data,
                value: "0x0",
                chainId: numberToHex(this.config.chainId),
                nonce: numberToHex(nonce),
                gas: numberToHex(gas + gas / 5n),
              },
            ],
          });
          if (typeof hash !== "string" || !/^0x[\da-f]{64}$/i.test(hash))
            throw new Error("Wallet returned no transaction hash.");
          this.replace({ ...operation, status: "pending", hash: hash as Hex });
          this.update({
            message: "Transaction submitted. Reconcile to check its receipt and token movements.",
          });
        } catch (error) {
          this.replace({ ...operation, status: isRejection(error) ? "rejected" : "ambiguous" });
          throw error;
        }
      }),
    );
  }

  private async checkConfirmed() {
    const operations = this.state.operations.filter(
      (item) => item.hash && ["confirmed", "reverted", "replaced"].includes(item.status),
    );
    if (!operations.length) return;
    const head = await this.client.getBlockNumber();
    const blocks = new Map<bigint, Promise<Hex | null>>();
    for (let offset = 0; offset < operations.length; offset += 4) {
      const results = await Promise.allSettled(
        operations.slice(offset, offset + 4).map(async (operation) => {
          const receipt = await this.client
            .getTransactionReceipt({ hash: operation.hash! })
            .catch(() => undefined);
          if (!receipt) {
            this.replace({ ...operation, status: "needs-review" });
            throw new Error(
              "A previous receipt is no longer available. Reconcile it before continuing.",
            );
          }
          let block = blocks.get(receipt.blockNumber);
          if (!block) {
            block = this.client
              .getBlock({ blockNumber: receipt.blockNumber })
              .then((value) => value.hash);
            blocks.set(receipt.blockNumber, block);
          }
          if (
            receipt.blockHash !== (await block) ||
            head - receipt.blockNumber + 1n < 2n ||
            (operation.receiptBlockHash && operation.receiptBlockHash !== receipt.blockHash)
          ) {
            this.replace({ ...operation, status: "needs-review" });
            throw new Error("A previous receipt changed. Reconcile it before continuing.");
          }
        }),
      );
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw failure.reason;
    }
  }

  reconcile(hashText = "") {
    return this.run(async () =>
      this.exclusive(async () => {
        const account = await this.identity();
        let operation = this.state.operations.find(isUnresolved);
        if (!operation) {
          this.update({ message: "No unresolved transaction." });
          return;
        }
        if (!sameAddress(account, operation.account))
          throw new Error("Switch to the wallet account that submitted this transaction.");
        if (hashText) {
          if (!/^0x[\da-f]{64}$/i.test(hashText))
            throw new Error("Enter a complete transaction hash.");
          const tx = await this.client.getTransaction({ hash: hashText as Hex });
          if (!sameAddress(tx.from, operation.account) || tx.nonce !== operation.nonce)
            throw new Error("Transaction sender or nonce does not match.");
          operation = { ...operation, hash: hashText as Hex };
          this.replace(operation);
        }
        if (!operation.hash) {
          const latest = await this.client.getBlockNumber(),
            start = BigInt(operation.scanBlock);
          const end = start + 39n < latest ? start + 39n : latest;
          for (let number = start; number <= end; number++) {
            const block = await this.client.getBlock({
              blockNumber: number,
              includeTransactions: true,
            });
            const tx = block.transactions.find(
              (item) =>
                sameAddress(item.from, operation!.account) && item.nonce === operation!.nonce,
            );
            if (tx) {
              operation = { ...operation, hash: tx.hash };
              this.replace(operation);
              break;
            }
          }
          if (!operation.hash) {
            this.replace({ ...operation, scanBlock: (end < latest ? end + 1n : end).toString() });
            this.update({
              message:
                "No mined transaction found in this scan. Attach its hash or resolve the nonce in your wallet, then reconcile. Nothing is resent.",
            });
            return;
          }
        }
        const receipt = await this.client
          .getTransactionReceipt({ hash: operation.hash })
          .catch(() => undefined);
        if (!receipt) {
          this.update({
            message: "Receipt not available yet. The transaction remains unresolved.",
          });
          return;
        }
        const [transaction, block, latest] = await Promise.all([
          this.client.getTransaction({ hash: operation.hash }),
          this.client.getBlock({ blockNumber: receipt.blockNumber }),
          this.client.getBlockNumber(),
        ]);
        if (
          receipt.transactionHash !== operation.hash ||
          transaction.hash !== operation.hash ||
          !sameAddress(transaction.from, operation.account) ||
          transaction.nonce !== operation.nonce
        )
          throw new Error("Transaction identity does not match the saved request.");
        if (receipt.blockHash !== block.hash || latest - receipt.blockNumber + 1n < 2n) {
          this.update({
            message: "Waiting for two canonical block confirmations. Reconcile again shortly.",
          });
          return;
        }
        if (
          !sameAddress(transaction.to ?? undefined, operation.to) ||
          transaction.input !== operation.data ||
          transaction.value !== 0n
        ) {
          this.replace({
            ...operation,
            status: "replaced",
            evidence:
              "This nonce was mined with a different transaction. The requested action is not confirmed.",
          });
        } else if (receipt.status === "reverted") {
          this.replace({
            ...operation,
            status: "reverted",
            evidence: "Transaction reverted. No successful swap is recorded.",
          });
        } else {
          try {
            const evidence = receiptSummary(this.config, operation, receipt);
            this.replace({
              ...operation,
              status: "confirmed",
              evidence,
              receiptBlockHash: receipt.blockHash,
            });
          } catch {
            this.replace({
              ...operation,
              status: "needs-review",
              evidence:
                "Receipt succeeded but settlement evidence did not match. Further writes remain blocked.",
            });
          }
        }
        this.invalidateQuotes();
        this.update({
          message:
            this.state.operations.find((item) => item.id === operation!.id)?.evidence ??
            "Transaction checked.",
        });
        await this.refreshInternal();
      }),
    );
  }
}
