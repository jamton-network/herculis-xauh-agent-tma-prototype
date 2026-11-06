import { AquaProgramBuilder, HexString, Order } from "@1inch/swap-vm-sdk";
import { getAddress, isAddress, isHex, keccak256, parseAbi, type Address, type Hex } from "viem";
import type { ExecutionFamily } from "../types";

export type SwapToken = "xauh" | "usdt";
export type SwapDirection = "instant-buy" | "instant-sell";
export type SwapOrder = {
  family: ExecutionFamily;
  encoded: Hex;
  hash: Hex;
  maker: Address;
  feeUnits: bigint;
};
export type SwapConfig = {
  chainId: 11155111;
  rpcUrl: string;
  router: Address;
  registry: Address;
  tokens: Record<SwapToken, Address>;
  codeHashes: Record<"router" | "registry" | SwapToken, Hex>;
  orders: SwapOrder[];
};

export const swapNetwork = { chainId: 11155111, explorer: "https://sepolia.etherscan.io" } as const;
export const familyNames: Record<ExecutionFamily, string> = {
  "constant-product": "Constant-product AMM",
  "concentrated-liquidity": "Concentrated-liquidity AMM",
};
export const feeTokenAbi = parseAbi([
  "function FEE_RATE() view returns (uint256)",
  "function FEE_PARTS() view returns (uint256)",
]);
export const forkReadAbi = parseAbi([
  "function AQUA() view returns (address)",
  "function feeOnTransferInitialized(bytes32 orderHash) view returns (bool)",
  "function feeOnTransferReserves(bytes32 orderHash, address token) view returns (uint256)",
]);

export function parseSwapOrder(encoded: unknown): SwapOrder {
  if (typeof encoded !== "string" || !isHex(encoded) || encoded.length > 4096)
    throw new Error("Invalid liquidity configuration.");
  const order = Order.decode(new HexString(encoded));
  const built = order.build();
  if (built.traits !== 1n << 254n || order.encode().toString() !== encoded.toLowerCase())
    throw new Error("Only Aqua orders without hooks are supported.");
  const instructions = AquaProgramBuilder.decode(order.program).getInstructions();
  const names = instructions.map((ix) => String(ix.opcode.id));
  const allowed = [
    "Symbol(XYCSwap.xycSwapXD)",
    "Symbol(XYCConcentrate.concentrateGrowLiquidity2D)",
    "Symbol(Fee.flatFeeAmountInXD)",
    "Symbol(Controls.salt)",
  ];
  if (
    names.some((name) => !allowed.includes(name)) ||
    names.filter((name) => name === allowed[0]).length !== 1 ||
    names.filter((name) => name === allowed[1]).length > 1 ||
    names.filter((name) => name === allowed[2]).length > 1
  )
    throw new Error("Unsupported liquidity pricing program.");
  const curveIndex = names.indexOf(allowed[0]);
  const feeIndex = names.indexOf(allowed[2]);
  const concentrateIndex = names.indexOf(allowed[1]);
  if (
    names.slice(curveIndex + 1).some((name) => name !== allowed[3]) ||
    (feeIndex !== -1 && concentrateIndex !== -1 && feeIndex > concentrateIndex)
  )
    throw new Error("Unsupported pricing instruction order.");
  let feeUnits = 0n;
  for (const ix of instructions) {
    if (String(ix.opcode.id) === allowed[2]) {
      const args = ix.args.toJSON();
      feeUnits += BigInt(String(args?.fee ?? "-1"));
    }
  }
  if (feeUnits < 0n || feeUnits > 1_000_000_000n) throw new Error("Unsupported swap fee.");
  return {
    family: names.includes(allowed[1]) ? "concentrated-liquidity" : "constant-product",
    encoded: encoded.toLowerCase() as Hex,
    hash: keccak256(encoded as Hex),
    maker: getAddress(built.maker),
    feeUnits,
  };
}

export function parseSwapConfig(raw: unknown): SwapConfig {
  const value = raw as SwapConfig & { orders: { encoded: unknown }[] };
  if (
    !value ||
    value.chainId !== swapNetwork.chainId ||
    !value.tokens ||
    !value.codeHashes ||
    !Array.isArray(value.orders)
  )
    throw new Error("Sepolia contract configuration is unavailable.");
  for (const address of [value.router, value.registry, value.tokens.xauh, value.tokens.usdt])
    if (!isAddress(address) || BigInt(address) === 0n) throw new Error("Invalid contract address.");
  if (
    new Set(
      [value.router, value.registry, value.tokens.xauh, value.tokens.usdt].map((a) =>
        a.toLowerCase(),
      ),
    ).size !== 4
  )
    throw new Error("Contract addresses must be distinct.");
  for (const name of ["router", "registry", "xauh", "usdt"] as const)
    if (!/^0x[\da-f]{64}$/i.test(value.codeHashes[name]))
      throw new Error("Missing contract code fingerprint.");
  if (typeof value.rpcUrl !== "string" || !value.rpcUrl)
    throw new Error("Configure a public Sepolia RPC URL.");
  const rpc = new URL(value.rpcUrl, "http://localhost");
  if (
    rpc.username ||
    rpc.password ||
    !["http:", "https:"].includes(rpc.protocol) ||
    value.rpcUrl.startsWith("//") ||
    value.rpcUrl.includes("\\")
  )
    throw new Error("Use a public HTTP RPC URL without credentials.");
  const orders = value.orders.map((order) => parseSwapOrder(order.encoded));
  if (orders.length !== 2 || new Set(orders.map((order) => order.family)).size !== 2)
    throw new Error("Configure one position for each Aqua pricing type.");
  return {
    chainId: swapNetwork.chainId,
    rpcUrl: value.rpcUrl,
    router: getAddress(value.router),
    registry: getAddress(value.registry),
    tokens: { xauh: getAddress(value.tokens.xauh), usdt: getAddress(value.tokens.usdt) },
    codeHashes: value.codeHashes,
    orders,
  };
}

export async function loadSwapConfig(): Promise<SwapConfig> {
  const { default: deployment } = await import("./aquaDeployment");
  return parseSwapConfig(deployment);
}
