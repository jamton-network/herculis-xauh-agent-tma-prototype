import type { Page } from "@playwright/test";
import {
  AquaProgramBuilder,
  AquaXYCAmmStrategy,
  Address as SdkAddress,
  MakerTraits,
  Order,
} from "@1inch/swap-vm-sdk";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  encodeEventTopics,
  erc20Abi,
  keccak256,
  numberToHex,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import { parseSwapConfig, forkReadAbi, feeTokenAbi } from "../src/live/swapConfig";
import { registryAbi, routerAbi, sameAddress, tokenFee } from "../src/live/swapModel";
export const maker = "0x0000000000000000000000000000000000000011" as const;
export const buyer = "0x0000000000000000000000000000000000000022" as const;
const code = "0x6000";
const order = (concentrated: boolean) =>
  Order.new({
    maker: new SdkAddress(maker),
    traits: MakerTraits.default(),
    program: concentrated
      ? new AquaProgramBuilder()
          .concentrateGrowLiquidity2D({
            sqrtPriceMin: 800_000_000_000_000_000n,
            sqrtPriceMax: 1_250_000_000_000_000_000n,
          })
          .xycSwapXD()
          .build()
      : AquaXYCAmmStrategy.new().build(),
  })
    .encode()
    .toString();
export const publicSwapConfig = {
  chainId: 11155111,
  rpcUrl: "/aqua-rpc",
  router: "0x0000000000000000000000000000000000000101",
  registry: "0x0000000000000000000000000000000000000102",
  tokens: {
    xauh: "0x0000000000000000000000000000000000000201",
    usdt: "0x0000000000000000000000000000000000000202",
  },
  codeHashes: {
    router: keccak256(code),
    registry: keccak256(code),
    xauh: keccak256(code),
    usdt: keccak256(code),
  },
  orders: [{ encoded: order(false) }, { encoded: order(true) }],
};
export const config = parseSwapConfig(publicSwapConfig);
const abi = [...erc20Abi, ...registryAbi, ...routerAbi, ...forkReadAbi, ...feeTokenAbi] as Abi;
type RpcCall = { method: string; params?: unknown[] };
type Sent = { from: Address; to: Address; data: Hex; nonce: Hex; value: Hex; chainId: Hex };

class MockWallet {
  account: Address = maker;
  chainId = 1;
  block = 100n;
  timestamp = BigInt(Math.floor(Date.now() / 1000));
  sends: Sent[] = [];
  nonces = new Map<Address, number>();
  allowances = new Map<string, bigint>();
  balances = new Map<string, bigint>();
  transactions = new Map<Hex, Record<string, unknown>>();
  receipts = new Map<Hex, Record<string, unknown>>();
  next: "success" | "reject" | "ambiguous" | "revert" | "missing-events" = "success";
  simulationFails = false;
  wrongBinding = false;
  rpcMethods: string[] = [];

  key(token: string, owner: string, spender = "") {
    return `${token}:${owner}:${spender}`.toLowerCase();
  }
  allowance(token: string, owner: string, spender: string) {
    return this.allowances.get(this.key(token, owner, spender)) ?? 0n;
  }
  blockHash(number: bigint) {
    return numberToHex(number, { size: 32 });
  }

  event(eventName: string, args: Record<string, unknown>, address: Address) {
    const event = abi.find((item) => item.type === "event" && item.name === eventName) as AbiEvent;
    return {
      address,
      topics: encodeEventTopics({ abi: [event], eventName, args }),
      data: encodeAbiParameters(
        event.inputs.filter((input) => !input.indexed),
        event.inputs.filter((input) => !input.indexed).map((input) => args[input.name!]),
      ),
    };
  }

  async handle({ method, params = [] }: RpcCall): Promise<unknown> {
    this.rpcMethods.push(method);
    if (method === "eth_chainId") return numberToHex(this.chainId);
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [this.account];
    if (method === "eth_blockNumber") return numberToHex(this.block);
    if (method === "eth_getCode") return code;
    if (method === "eth_getBalance") return "0xde0b6b3a7640000";
    if (method === "eth_gasPrice") return "0x1";
    if (method === "eth_getTransactionCount")
      return numberToHex(this.nonces.get(String(params[0]) as Address) ?? 0);
    if (method === "eth_getBlockByNumber") {
      const number = params[0] === "latest" ? this.block : BigInt(String(params[0]));
      return {
        number: numberToHex(number),
        hash: this.blockHash(number),
        parentHash: this.blockHash(number - 1n),
        timestamp: numberToHex(this.timestamp),
        gasLimit: "0x1c9c380",
        gasUsed: "0x0",
        size: "0x100",
        difficulty: "0x0",
        totalDifficulty: "0x0",
        extraData: "0x",
        logsBloom: `0x${"0".repeat(512)}`,
        miner: maker,
        mixHash: this.blockHash(0n),
        nonce: "0x0000000000000000",
        receiptsRoot: this.blockHash(0n),
        stateRoot: this.blockHash(0n),
        transactionsRoot: this.blockHash(0n),
        baseFeePerGas: "0x1",
        transactions: [...this.transactions.values()]
          .filter((tx) => tx.blockNumber === numberToHex(number))
          .map((tx) => (params[1] ? tx : tx.hash)),
        uncles: [],
      };
    }
    if (method === "eth_getTransactionByHash")
      return this.transactions.get(params[0] as Hex) ?? null;
    if (method === "eth_getTransactionReceipt") return this.receipts.get(params[0] as Hex) ?? null;
    if (method === "eth_estimateGas") {
      if (this.simulationFails) throw new Error("Synthetic simulation revert");
      return "0x186a0";
    }
    throw new Error(`Unsupported synthetic RPC ${method}`);
  }
}

export class SwapWallet extends MockWallet {
  override account: Address = buyer;
  override chainId: number = config.chainId;
  fee = { rate: 200n, parts: 1_000_000n };
  closed = false;
  quoteFamilies: string[] = [];
  constructor() {
    super();
    for (const account of [maker, buyer]) {
      this.balances.set(this.key(config.tokens.xauh, account), 1000n * 10n ** 18n);
      this.balances.set(this.key(config.tokens.usdt, account), 1000n * 10n ** 6n);
    }
  }
  output(orderData: Hex, amount: bigint, buy: boolean) {
    const concentrated = orderData.startsWith("0x12");
    const base = buy ? amount * 10n ** 12n : amount / 10n ** 12n;
    return (base * (concentrated ? 998n : 999n)) / 1000n;
  }
  override async handle(call: { method: string; params?: unknown[] }): Promise<unknown> {
    const { method, params = [] } = call;
    if (method === "wallet_switchEthereumChain") {
      this.chainId = Number(BigInt((params[0] as { chainId: string }).chainId));
      return null;
    }
    if (method === "eth_call") {
      this.rpcMethods.push(method);
      const request = params[0] as { to: Address; data: Hex };
      const decoded = decodeFunctionData({ abi, data: request.data });
      const args = (decoded.args ?? []) as unknown[];
      const result = (value: unknown) =>
        encodeFunctionResult({ abi, functionName: decoded.functionName, result: value });
      switch (decoded.functionName) {
        case "AQUA":
          return result(this.wrongBinding ? maker : config.registry);
        case "FEE_RATE":
          return result(this.fee.rate);
        case "FEE_PARTS":
          return result(this.fee.parts);
        case "feeOnTransferInitialized":
          return result(true);
        case "decimals":
          return result(sameAddress(request.to, config.tokens.usdt) ? 6 : 18);
        case "balanceOf":
          return result(this.balances.get(this.key(request.to, String(args[0]))) ?? 0n);
        case "allowance":
          return result(this.allowance(request.to, String(args[0]), String(args[1])));
        case "rawBalances":
          return result([1000n * 10n ** 18n, this.closed ? 255 : 2]);
        case "approve":
          return result(true);
        case "quote":
        case "swap": {
          if (this.simulationFails) throw new Error("Synthetic simulation revert");
          const order = args[0] as { maker: Address; traits: bigint; data: Hex };
          this.quoteFamilies.push(
            order.data.startsWith("0x12") ? "concentrated-liquidity" : "constant-product",
          );
          return result([
            args[3],
            this.output(
              order.data,
              args[3] as bigint,
              sameAddress(String(args[1]), config.tokens.usdt),
            ),
            keccak256(encodeAbiParameters([Order.ABI], [order])),
          ]);
        }
        default:
          throw new Error(`Unsupported synthetic call ${decoded.functionName}`);
      }
    }
    if (method !== "eth_sendTransaction") return super.handle(call);
    this.rpcMethods.push(method);
    const tx = params[0] as Sent;
    this.sends.push(tx);
    const mode = this.next;
    this.next = "success";
    if (mode === "reject") return { mockError: 4001 };
    const hash = numberToHex(this.sends.length, { size: 32 }),
      number = ++this.block,
      blockHash = this.blockHash(number);
    this.nonces.set(tx.from, Number(BigInt(tx.nonce)) + 1);
    const decoded = decodeFunctionData({ abi, data: tx.data });
    const args = decoded.args as unknown[];
    let logs: ReturnType<MockWallet["event"]>[] = [];
    if (mode !== "revert") {
      if (decoded.functionName === "approve") {
        const [spender, value] = args as [Address, bigint];
        this.allowances.set(this.key(tx.to, tx.from, spender), value);
        logs.push(this.event("Approval", { owner: tx.from, spender, value }, tx.to));
      } else if (decoded.functionName === "swap") {
        const [order, tokenIn, tokenOut, amountIn] = args as [
          { maker: Address; traits: bigint; data: Hex },
          Address,
          Address,
          bigint,
        ];
        const buy = sameAddress(tokenIn, config.tokens.usdt),
          amountOut = this.output(order.data, amountIn, buy);
        const strategyHash = keccak256(encodeAbiParameters([Order.ABI], [order]));
        const transfer = (token: Address, from: Address, to: Address, gross: bigint) => {
          const fee = sameAddress(token, config.tokens.xauh) ? tokenFee(gross, this.fee) : 0n;
          this.balances.set(
            this.key(token, from),
            (this.balances.get(this.key(token, from)) ?? 0n) - gross,
          );
          this.balances.set(
            this.key(token, to),
            (this.balances.get(this.key(token, to)) ?? 0n) + gross - fee,
          );
          logs.push(this.event("Transfer", { from, to, value: gross - fee }, token));
          if (fee)
            logs.push(
              this.event(
                "Transfer",
                { from, to: "0x0000000000000000000000000000000000000000", value: fee },
                token,
              ),
            );
          return gross - fee;
        };
        const routed = transfer(tokenIn, tx.from, config.router, amountIn);
        transfer(tokenIn, config.router, order.maker, routed);
        const debit = buy
          ? (amountOut * this.fee.parts) / (this.fee.parts - this.fee.rate)
          : amountOut;
        transfer(tokenOut, order.maker, tx.from, debit);
        this.allowances.set(this.key(tokenIn, tx.from, config.router), 0n);
        logs.push(
          this.event(
            "Pushed",
            {
              maker: order.maker,
              app: config.router,
              strategyHash,
              token: tokenIn,
              amount: routed,
            },
            config.registry,
          ),
        );
        logs.push(
          this.event(
            "Pulled",
            {
              maker: order.maker,
              app: config.router,
              strategyHash,
              token: tokenOut,
              amount: debit,
            },
            config.registry,
          ),
        );
        logs.push(
          this.event(
            "Swapped",
            {
              orderHash: strategyHash,
              maker: order.maker,
              taker: tx.from,
              tokenIn,
              tokenOut,
              amountIn,
              amountOut,
            },
            config.router,
          ),
        );
      }
    }
    if (mode === "missing-events") logs = [];
    this.transactions.set(hash, {
      ...tx,
      input: tx.data,
      hash,
      nonce: tx.nonce,
      blockHash,
      blockNumber: numberToHex(number),
      transactionIndex: "0x0",
      gas: "0x186a0",
      gasPrice: "0x1",
      type: "0x0",
      v: "0x25",
      r: this.blockHash(1n),
      s: this.blockHash(2n),
    });
    this.receipts.set(hash, {
      transactionHash: hash,
      transactionIndex: "0x0",
      blockNumber: numberToHex(number),
      blockHash,
      from: tx.from,
      to: tx.to,
      cumulativeGasUsed: "0x10000",
      gasUsed: "0x10000",
      contractAddress: null,
      logsBloom: `0x${"0".repeat(512)}`,
      status: mode === "revert" ? "0x0" : "0x1",
      effectiveGasPrice: "0x1",
      type: "0x0",
      logs: logs.map((log, i) => ({
        ...log,
        blockNumber: numberToHex(number),
        blockHash,
        transactionHash: hash,
        transactionIndex: "0x0",
        logIndex: numberToHex(i),
        removed: false,
      })),
    });
    this.block++;
    return mode === "ambiguous" ? { mockError: -32000 } : hash;
  }
}

export async function installSwapConfig(page: Page, reader = new SwapWallet()) {
  await page.route(
    /\/(?:src\/live\/aquaDeployment\.ts|assets\/aquaDeployment-[^/]+\.js)(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `export default ${JSON.stringify(publicSwapConfig)};`,
      }),
  );
  await page.route("**/aqua-rpc", async (route) => {
    const call = route.request().postDataJSON();
    if (["eth_sendTransaction", "eth_requestAccounts", "eth_accounts"].includes(call.method))
      throw new Error("Unexpected wallet request through public quote RPC");
    try {
      const result =
        call.method === "eth_chainId" ? numberToHex(config.chainId) : await reader.handle(call);
      await route.fulfill({ json: { jsonrpc: "2.0", id: call.id, result } });
    } catch (error) {
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: call.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Synthetic RPC error",
          },
        },
      });
    }
  });
}
export async function installSwapWallet(page: Page, wallet: SwapWallet) {
  await installSwapConfig(page, wallet);
  let authorized = false;
  await page.exposeFunction("swapRpc", (call: { method: string; params?: unknown[] }) => {
    if (call.method === "eth_requestAccounts") authorized = true;
    if (call.method === "eth_accounts" && !authorized) return [];
    return wallet.handle(call);
  });
  await page.addInitScript(() => {
    const handlers = new Map<string, Set<() => void>>();
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: {
        async request(args: unknown) {
          const result = await (
            window as unknown as { swapRpc(args: unknown): Promise<unknown> }
          ).swapRpc(args);
          if (result && typeof result === "object" && "mockError" in result)
            throw Object.assign(new Error("Synthetic wallet error"), { code: result.mockError });
          return result;
        },
        on(event: string, handler: () => void) {
          if (!handlers.has(event)) handlers.set(event, new Set());
          handlers.get(event)!.add(handler);
        },
        removeListener(event: string, handler: () => void) {
          handlers.get(event)?.delete(handler);
        },
        emit(event: string) {
          handlers.get(event)?.forEach((handler) => handler());
        },
      },
    });
  });
}
