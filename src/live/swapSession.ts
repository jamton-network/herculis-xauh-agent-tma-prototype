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
  parseSwapOrder,
  type SwapOrder,
  type SwapConfig,
  type SwapDirection,
  type SwapToken,
} from "./swapConfig";
import {
  feeBreakdown,
  inputToken,
  outputToken,
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

import {
  allowanceTargets,
  approvalStep,
  assets,
  createLiquidityOrder,
  emptyAmounts,
  liquiditySteps,
  randomSalt,
  readAmounts,
  storeAmounts,
  validateWorkflow,
  workflowConfirmed,
  workflowIdentity,
  type LiquidityAction,
  type LiquidityPosition,
  type LiquidityStep,
  type LiquidityWorkflow,
  type TokenAmounts,
} from "./liquidityModel";
import {
  catalogKey,
  catalogOrders,
  discoverPositions,
  readCatalog,
  readPosition,
  type DiscoveryCache,
} from "./liquidityDiscovery";
import { actualXauhPushFee } from "./liquidityReceipt";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export type SwapReadiness = {
  block: bigint;
  timestamp: bigint;
  decimals: Record<SwapToken, number>;
  balances: Record<SwapToken, bigint>;
  allowances: Record<SwapToken, bigint>;
  aquaAllowances: Record<SwapToken, bigint>;
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
  workflow?: LiquidityWorkflow;
  positions: LiquidityPosition[];
  catalogVersion: number;
  discovering: boolean;
  discoveryMessage: string;
  discoveryComplete: boolean;
  tokenDecimals?: Record<SwapToken, number>;
  problem?: string;
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
  private journalWorkflow?: LiquidityWorkflow;
  private catalog: DiscoveryCache;
  private orders: SwapOrder[];
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
    try {
      this.catalog = readCatalog(storage.getItem(catalogKey(config)), config);
    } catch {
      this.catalog = readCatalog(null, config);
    }
    this.orders = catalogOrders(config, this.catalog);
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
      workflow: this.journalWorkflow,
      positions: [],
      catalogVersion: 0,
      discovering: false,
      discoveryMessage: "Position discovery has not completed.",
      discoveryComplete: false,
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
        const operations = this.readOperations();
        this.update({ operations, workflow: this.journalWorkflow });
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
    const discover = () => {
      if (!document.hidden && !this.state.busy && !this.state.operations.some(isUnresolved))
        void this.refreshPositions();
    };
    const visible = () => {
      discover();
      void pollWallet();
    };
    const discoveryTimer = window.setInterval(discover, 30_000);
    const walletTimer = window.setInterval(pollWallet, 5000);
    window.addEventListener("focus", pollWallet);
    document.addEventListener("visibilitychange", visible);
    discover();
    return () => {
      active = false;
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        this.provider?.removeListener?.(event, this.contextChanged);
      window.removeEventListener("storage", changed);
      window.removeEventListener("focus", pollWallet);
      window.clearInterval(discoveryTimer);
      window.clearInterval(walletTimer);
      document.removeEventListener("visibilitychange", visible);
      this.invalidateQuotes();
    };
  }

  private readOperations(): SwapOperation[] {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      this.journalWorkflow = undefined;
      return [];
    }
    const saved = JSON.parse(raw);
    if (
      ![1, 2].includes(saved.version) ||
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
        !["approval", "swap", "initialize", "ship", "push", "update-reserves", "dock"].includes(
          operation.kind,
        ) ||
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
        (operation.actualFee !== undefined &&
          (!/^\d+$/.test(operation.actualFee) || BigInt(operation.actualFee) >= 1n << 248n)) ||
        (operation.workflowId &&
          (!/^0x[\da-f]{64}$/i.test(operation.workflowId) ||
            !operation.stepId ||
            !operation.order ||
            !sameAddress(parseSwapOrder(operation.order).maker, operation.account))) ||
        (operation.kind !== "swap" && operation.kind !== "approval" && !operation.workflowId) ||
        operationIdentity(this.config, operation) !== operation.id
      )
        throw new Error("Invalid recovery operation.");
    }
    if (
      new Set(saved.operations.map((operation: SwapOperation) => operation.id)).size !==
      saved.operations.length
    )
      throw new Error("Duplicate recovery operation.");
    this.journalWorkflow =
      saved.version === 2 && saved.workflow
        ? validateWorkflow(this.config, saved.workflow)
        : undefined;
    return saved.operations;
  }

  private save(
    operations: SwapOperation[],
    workflow: LiquidityWorkflow | null | undefined = this.state.workflow,
  ) {
    if (this.state.storageError) throw new Error(this.state.storageError);
    try {
      const raw = JSON.stringify({
        version: 2,
        registry: this.config.registry,
        operations,
        workflow: workflow ?? null,
      });
      this.storage.setItem(this.storageKey, raw);
      if (this.storage.getItem(this.storageKey) !== raw) throw new Error("Storage write failed.");
    } catch {
      this.update({ storageError: "Transaction recovery could not be saved. Writes are blocked." });
      throw new Error("Recovery storage failed. Reconcile any wallet request before continuing.");
    }
    this.journalWorkflow = workflow ?? undefined;
    this.update({ operations, workflow: workflow ?? undefined });
  }
  private replace(operation: SwapOperation) {
    this.save(this.state.operations.map((item) => (item.id === operation.id ? operation : item)));
  }
  private async run(action: () => Promise<void>) {
    if (this.state.busy) return;
    this.quoteRequest++;
    this.update({ busy: true, quoting: false, problem: undefined });
    try {
      await action();
    } catch (error) {
      this.update({
        problem: isRejection(error)
          ? "Cancelled in your wallet. You can try this step again."
          : error instanceof Error
            ? error.message
            : "The action could not be completed.",
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
      const operations = this.readOperations();
      this.update({ operations, workflow: this.journalWorkflow });
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
      allowances = {} as Record<SwapToken, bigint>,
      aquaAllowances = {} as Record<SwapToken, bigint>;
    await Promise.all(
      (["xauh", "usdt"] as const).map(async (token) => {
        [balances[token], allowances[token], aquaAllowances[token]] = await Promise.all([
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
          this.client.readContract({
            address: this.config.tokens[token],
            abi: erc20Abi,
            functionName: "allowance",
            args: [account, this.config.registry],
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
        aquaAllowances,
        eth,
        fee,
      },
      tokenDecimals: decimals,
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
      const estimates: SwapEstimate[] = [];
      for (let offset = 0; offset < this.orders.length; offset += 4) {
        estimates.push(
          ...(await Promise.all(
            this.orders.slice(offset, offset + 4).map(async (order): Promise<SwapEstimate> => {
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
                const allocations = {} as TokenAmounts;
                for (const asset of ["xauh", "usdt"] as const) {
                  const [allocation, count] = await this.previewClient.readContract({
                    address: this.config.registry,
                    abi: registryAbi,
                    functionName: "rawBalances",
                    args: [order.maker, this.config.router, order.hash, this.config.tokens[asset]],
                    blockNumber: block.number,
                  });
                  if (count !== 2)
                    throw new Error("This liquidity position is closed or unavailable.");
                  allocations[asset] = allocation;
                }
                const result = await this.previewClient.call({
                  account: account ?? zeroAddress,
                  ...swapPayload(
                    this.config,
                    { order, direction, input, minimum: 1n, deadline },
                    true,
                  ),
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
                const outToken = outputToken(direction);
                const debit =
                  direction === "instant-buy"
                    ? (output * fee.parts) / (fee.parts - fee.rate)
                    : output;
                const [makerBalance, makerAllowance] = await Promise.all([
                  this.previewClient.readContract({
                    address: this.config.tokens[outToken],
                    abi: erc20Abi,
                    functionName: "balanceOf",
                    args: [order.maker],
                    blockNumber: block.number,
                  }),
                  this.previewClient.readContract({
                    address: this.config.tokens[outToken],
                    abi: erc20Abi,
                    functionName: "allowance",
                    args: [order.maker, this.config.registry],
                    blockNumber: block.number,
                  }),
                ]);
                if (makerBalance < debit || makerAllowance < debit || allocations[outToken] < debit)
                  throw new Error("Insufficient available liquidity for this quote.");
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
          )),
        );
        if (!current()) return;
      }
      if (!current()) return;
      if (Date.now() >= expiresAt)
        throw new Error("Quotes expired while loading. Refreshing again shortly.");
      const bestEstimates = (["constant-product", "concentrated-liquidity"] as const).map(
        (family) => {
          const candidates = estimates.filter((item) => item.family === family);
          return candidates.reduce<SwapEstimate>(
            (best, item) =>
              item.quote && (!best.quote || item.quote.output > best.quote.output) ? item : best,
            {
              family,
              error:
                candidates.find((item) => item.error)?.error ??
                "No eligible position in this AMM family.",
            },
          );
        },
      );
      this.update({
        estimates: bestEstimates,
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

  async refreshPositions(discover = true) {
    if (this.state.discovering) return;
    this.update({ discovering: true });
    try {
      const { block, decimals } = await this.inspect(this.previewClient, true);
      this.update({ tokenDecimals: decimals });
      if (discover) {
        const result = await discoverPositions(
          this.previewClient,
          this.config,
          this.catalog,
          block.number,
        );
        this.catalog = result.cache;
        try {
          this.storage.setItem(catalogKey(this.config), JSON.stringify(this.catalog));
        } catch {
          result.message +=
            " Discovery cache could not be saved; encoded-order import remains available.";
        }
        this.update({ discoveryComplete: result.complete, discoveryMessage: result.message });
      }
      const orders = catalogOrders(
        this.config,
        this.catalog,
        this.state.workflow ? [this.state.workflow.encoded] : [],
      );
      const changed =
        orders.map((order) => order.hash).join() !== this.orders.map((order) => order.hash).join();
      this.orders = orders;
      const positions: LiquidityPosition[] = [];
      for (let i = 0; i < orders.length; i += 4)
        positions.push(
          ...(await Promise.all(
            orders
              .slice(i, i + 4)
              .map((order) => readPosition(this.previewClient, this.config, order, block.number)),
          )),
        );
      this.update({ positions, catalogVersion: this.state.catalogVersion + (changed ? 1 : 0) });
      if (changed) this.invalidateQuotes();
    } catch {
      this.update({
        discoveryComplete: false,
        discoveryMessage:
          "Discovery is incomplete. Retry the scan or import an encoded order. Cached positions still require current on-chain verification.",
      });
    } finally {
      this.update({ discovering: false });
    }
  }

  async importPosition(encoded: string) {
    try {
      this.update({ problem: undefined });
      const order = parseSwapOrder(encoded.trim());
      const { block } = await this.inspect(this.previewClient, true);
      const position = await readPosition(this.previewClient, this.config, order, block.number);
      if (["unavailable", "draft"].includes(position.status))
        throw new Error("This order is not a supported initialized XAUH/USDT position.");
      this.catalog.entries.push({ encoded: order.encoded });
      this.storage.setItem(catalogKey(this.config), JSON.stringify(this.catalog));
      await this.refreshPositions(false);
      this.update({ message: "Encoded order imported and verified against current chain state." });
    } catch (error) {
      this.update({
        message: error instanceof Error ? error.message : "Order import failed.",
        problem: error instanceof Error ? error.message : "Order import failed.",
      });
    }
  }

  workflowIncomplete() {
    const workflow = this.state.workflow;
    return Boolean(
      workflow &&
      liquiditySteps(this.config, workflow).some(
        (step) => !workflowConfirmed(workflow, step, this.state.operations),
      ),
    );
  }

  reviewLiquidity(input: {
    action: LiquidityAction;
    amounts: TokenAmounts;
    order?: Hex;
    family?: ExecutionFamily;
    feeBps?: string;
    minimum?: string;
    maximum?: string;
  }) {
    return this.run(async () =>
      this.exclusive(async () => {
        if (this.state.operations.some(isUnresolved))
          throw new Error("Reconcile the unresolved transaction first.");
        if (this.workflowIncomplete())
          throw new Error("Resume or discard the saved liquidity workflow first.");
        await this.checkConfirmed();
        await this.refreshInternal();
        const ready = this.state.readiness!,
          account = this.state.account!;
        let order: SwapOrder;
        if (input.action === "create") {
          let attempts = 0;
          do {
            order = createLiquidityOrder(
              this.config,
              account,
              input.family ?? "constant-product",
              input.amounts,
              ready.decimals,
              input.feeBps ?? "0",
              input.minimum ?? "0",
              input.maximum ?? "0",
              randomSalt(),
            );
            if (++attempts > 8) throw new Error("A unique order salt could not be generated.");
          } while (
            this.orders.some((known) => known.hash === order.hash) ||
            this.state.operations.some((operation) => operation.order === order.encoded)
          );
        } else {
          order = parseSwapOrder(input.order);
        }
        if (!sameAddress(order.maker, account))
          throw new Error("Only the position maker can manage this order.");
        const position = await readPosition(this.client, this.config, order, ready.block);
        if (position.error || position.status === "closed")
          throw new Error(
            position.error ?? "Closed orders cannot be reused. Create a new position.",
          );
        if (input.action === "create" ? position.status !== "draft" : position.status !== "active")
          throw new Error("Position lifecycle changed. Refresh its current state.");
        if (assets.some((token) => input.amounts[token] < 0n || input.amounts[token] >= 1n << 248n))
          throw new Error("Invalid reserve amount.");
        const targets = emptyAmounts(),
          increments = emptyAmounts();
        for (const token of assets) {
          targets[token] =
            input.action === "add"
              ? position.reserves[token] + input.amounts[token]
              : input.amounts[token];
          increments[token] =
            input.action === "create" || input.action === "remove"
              ? 0n
              : input.action === "add"
                ? input.amounts[token]
                : targets[token] > position.allocations[token]
                  ? targets[token] - position.allocations[token]
                  : 0n;
        }
        if (
          input.action !== "remove" &&
          (targets.xauh + targets.usdt <= 0n ||
            (order.family === "constant-product" && (targets.xauh === 0n || targets.usdt === 0n)) ||
            assets.some((token) => targets[token] >= 1n << 248n))
        )
          throw new Error("Resulting reserves are invalid for this pricing type.");
        if (input.action === "add" && increments.xauh + increments.usdt === 0n)
          throw new Error("Enter at least one positive increment.");
        if (
          input.action === "ratio" &&
          assets.every((token) => targets[token] === position.reserves[token])
        )
          throw new Error("Reserve totals have not changed.");
        const workflow: LiquidityWorkflow = {
          id: workflowIdentity(order, ready.block, input.action),
          action: input.action,
          encoded: order.encoded,
          maker: account,
          baseReserves: storeAmounts(position.reserves),
          baseAllocations: storeAmounts(position.allocations),
          increments: storeAmounts(increments),
          targets: storeAmounts(targets),
          reviewedBlock: ready.block.toString(),
          fee: { rate: ready.fee.rate.toString(), parts: ready.fee.parts.toString() },
        };
        this.validateLiquidityFunds(workflow, ready, position);
        await this.identity();
        if (!sameAddress(account, this.state.account))
          throw new Error("Maker wallet changed during review.");
        this.save(this.state.operations, workflow);
        await this.refreshPositions(false);
        this.update({
          message:
            "Liquidity review saved. Every approval and contract call requires its own explicit confirmation.",
        });
      }),
    );
  }

  private validateLiquidityFunds(
    workflow: LiquidityWorkflow,
    ready: SwapReadiness,
    position: LiquidityPosition,
  ) {
    if (workflow.action === "remove") return;
    const targets = readAmounts(workflow.targets),
      increments = readAmounts(workflow.increments);
    const required = workflow.action === "create" ? targets : { ...position.allocations };
    for (const token of assets) {
      const pushed = this.state.operations.some(
        (operation) =>
          operation.workflowId === workflow.id &&
          operation.stepId === `push-${token}` &&
          operation.status === "confirmed",
      );
      const remaining = pushed ? 0n : increments[token];
      if (workflow.action !== "create") required[token] += remaining;
      if (required[token] >= 1n << 248n)
        throw new Error("The resulting Aqua allocation exceeds uint248.");
      const fee = token === "xauh" ? tokenFee(remaining, ready.fee) : 0n;
      if (ready.balances[token] < required[token] + fee)
        throw new Error(
          `Insufficient shared wallet ${token.toUpperCase()} for the allocation and push transfer fee.`,
        );
      if (targets[token] > required[token])
        throw new Error("Reviewed targets exceed the resulting Aqua allocation.");
    }
  }

  liquidityNext(): LiquidityStep | undefined {
    const workflow = this.state.workflow,
      ready = this.state.readiness;
    if (!workflow || !this.workflowIncomplete()) return undefined;
    if (ready && workflow.action !== "remove") {
      const allowances = allowanceTargets(workflow, this.state.operations);
      for (const token of assets)
        if (ready.aquaAllowances[token] < allowances[token])
          return approvalStep(
            this.config,
            token,
            ready.aquaAllowances[token] === 0n ? allowances[token] : 0n,
          );
    }
    return liquiditySteps(this.config, workflow).find(
      (step) => !workflowConfirmed(workflow, step, this.state.operations),
    );
  }

  executeLiquidityStep(expectedId: string) {
    const requested = this.liquidityNext();
    if (!requested || requested.id !== expectedId) return Promise.resolve();
    return this.write(requested.kind, async () => {
      const workflow = this.state.workflow,
        ready = this.state.readiness!;
      if (!workflow || !sameAddress(workflow.maker, this.state.account))
        throw new Error("Reconnect the maker wallet to resume this workflow.");
      const step = this.liquidityNext();
      if (!step || step.id !== requested.id || step.data !== requested.data)
        throw new Error("Liquidity state or allowance changed. Review the next action again.");
      const order = parseSwapOrder(workflow.encoded);
      const position = await readPosition(this.client, this.config, order, ready.block);
      if (position.error || position.status === "closed")
        throw new Error(position.error ?? "This order is closed permanently.");
      if (
        workflow.fee.rate !== ready.fee.rate.toString() ||
        workflow.fee.parts !== ready.fee.parts.toString()
      )
        throw new Error("Transfer fees changed. Review the liquidity targets again.");
      const targets = readAmounts(workflow.targets);
      if (workflow.action === "create") {
        const initialized = this.state.operations.some(
          (operation) =>
            operation.workflowId === workflow.id &&
            operation.kind === "initialize" &&
            operation.status === "confirmed",
        );
        if (
          position.status !== (initialized ? "initialized" : "draft") ||
          (initialized && assets.some((token) => position.reserves[token] !== targets[token]))
        )
          throw new Error(
            "Creation state changed. Reconcile all confirmed steps before continuing.",
          );
      } else {
        if (position.status !== "active") throw new Error("Position is no longer active.");
        const base = readAmounts(workflow.baseReserves),
          allocation = readAmounts(workflow.baseAllocations),
          increments = readAmounts(workflow.increments);
        const changed = assets.some((token) => {
          const pushed = this.state.operations.some(
            (operation) =>
              operation.workflowId === workflow.id &&
              operation.stepId === `push-${token}` &&
              operation.status === "confirmed",
          );
          return (
            position.reserves[token] !== base[token] ||
            position.allocations[token] !== allocation[token] + (pushed ? increments[token] : 0n)
          );
        });
        if (changed)
          throw new Error(
            "Position reserves or allocation changed since review. Refresh and review the saved targets again.",
          );
      }
      this.validateLiquidityFunds(workflow, ready, position);
      return {
        to: step.to,
        data: step.data,
        workflowId: workflow.id,
        stepId: step.id,
        order: order.encoded,
        feeRate: workflow.fee,
      };
    });
  }

  rereviewLiquidity() {
    return this.run(async () =>
      this.exclusive(async () => {
        const workflow = this.state.workflow;
        if (!workflow || this.state.operations.some(isUnresolved))
          throw new Error("Reconcile the pending action before reviewing targets.");
        await this.checkConfirmed();
        await this.refreshInternal();
        if (!sameAddress(workflow.maker, this.state.account))
          throw new Error("Reconnect the maker wallet.");
        const ready = this.state.readiness!,
          position = await readPosition(
            this.client,
            this.config,
            parseSwapOrder(workflow.encoded),
            ready.block,
          );
        if (position.error || position.status === "closed")
          throw new Error(
            position.error ?? "This workflow cannot be rebased. Reconcile its recorded steps.",
          );
        const allocation = { ...position.allocations },
          increments = readAmounts(workflow.increments),
          targets = readAmounts(workflow.targets);
        for (const token of assets) {
          const pushed = this.state.operations.some(
            (operation) =>
              operation.workflowId === workflow.id &&
              operation.stepId === `push-${token}` &&
              operation.status === "confirmed",
          );
          if (pushed) {
            if (allocation[token] < increments[token] || targets[token] > allocation[token])
              throw new Error(
                "A completed push no longer covers these targets. Finish or close the position after reviewing current chain state.",
              );
            allocation[token] -= increments[token];
          } else if (workflow.action === "ratio")
            increments[token] =
              targets[token] > allocation[token] ? targets[token] - allocation[token] : 0n;
        }
        const updated = {
          ...workflow,
          baseReserves: storeAmounts(position.reserves),
          baseAllocations: storeAmounts(allocation),
          increments: storeAmounts(increments),
          reviewedBlock: ready.block.toString(),
          fee: { rate: ready.fee.rate.toString(), parts: ready.fee.parts.toString() },
        };
        this.validateLiquidityFunds(updated, ready, position);
        this.save(this.state.operations, updated);
        this.update({
          message:
            "The same target totals were reviewed against current reserves, allocation and transfer fees. Confirm the next action explicitly.",
        });
      }),
    );
  }

  discardLiquidity() {
    return this.run(async () =>
      this.exclusive(async () => {
        const workflow = this.state.workflow;
        if (!workflow) return;
        if (this.state.operations.some(isUnresolved))
          throw new Error("Reconcile the unresolved transaction first.");
        const { block } = await this.inspect(this.previewClient, true);
        const position = await readPosition(
          this.previewClient,
          this.config,
          parseSwapOrder(workflow.encoded),
          block.number,
        );
        if (
          position.status !== "closed" &&
          this.workflowIncomplete() &&
          this.state.operations.some(
            (operation) =>
              operation.workflowId === workflow.id &&
              operation.kind !== "approval" &&
              operation.status === "confirmed",
          )
        )
          throw new Error(
            "A liquidity step already changed chain state. Resume the saved workflow to preserve its completed steps.",
          );
        this.save(this.state.operations, null);
        this.update({
          message: "Saved workflow cleared. Existing Aqua allowances remain unchanged.",
        });
      }),
    );
  }

  reviewLiquidityClosure() {
    return this.run(async () =>
      this.exclusive(async () => {
        const current = this.state.workflow;
        if (!current || this.state.operations.some(isUnresolved))
          throw new Error("Reconcile the pending operation first.");
        await this.checkConfirmed();
        await this.refreshInternal();
        if (!sameAddress(current.maker, this.state.account))
          throw new Error("Reconnect the maker wallet.");
        const ready = this.state.readiness!,
          order = parseSwapOrder(current.encoded);
        const position = await readPosition(this.client, this.config, order, ready.block);
        if (position.status !== "active")
          throw new Error(
            "Only an active position can be docked. Complete initial activation or refresh its current state.",
          );
        const workflow: LiquidityWorkflow = {
          ...current,
          id: workflowIdentity(order, ready.block, "remove"),
          action: "remove",
          baseReserves: storeAmounts(position.reserves),
          baseAllocations: storeAmounts(position.allocations),
          increments: storeAmounts(emptyAmounts()),
          targets: storeAmounts(emptyAmounts()),
          reviewedBlock: ready.block.toString(),
          fee: { rate: ready.fee.rate.toString(), parts: ready.fee.parts.toString() },
        };
        this.save(this.state.operations, workflow);
        this.update({
          message:
            "Full closure reviewed. Confirm Close position to dock this order permanently. Previous pushes remain recorded.",
        });
      }),
    );
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
      if (this.workflowIncomplete())
        throw new Error("Complete the liquidity workflow before another financial action.");
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
      if (this.workflowIncomplete())
        throw new Error("Complete the liquidity workflow before swapping.");
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
    prepare: () => Promise<
      Pick<SwapOperation, "to" | "data" | "feeRate" | "workflowId" | "stepId" | "order">
    >,
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
            evidence: "Transaction reverted. Its requested changes were not applied.",
          });
        } else {
          try {
            const evidence = receiptSummary(this.config, operation, receipt);
            this.replace({
              ...operation,
              status: "confirmed",
              evidence,
              receiptBlockHash: receipt.blockHash,
              actualFee: actualXauhPushFee(this.config, operation, receipt),
            });
            if (
              operation.order &&
              operation.kind !== "approval" &&
              !this.catalog.entries.some((entry) => entry.encoded === operation!.order)
            ) {
              this.catalog.entries.push({ encoded: operation.order });
              try {
                this.storage.setItem(catalogKey(this.config), JSON.stringify(this.catalog));
              } catch {
                this.update({
                  discoveryMessage:
                    "The position is in transaction recovery; its discovery cache could not be saved.",
                });
              }
            }
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
        await this.refreshPositions(false);
      }),
    );
  }
}
