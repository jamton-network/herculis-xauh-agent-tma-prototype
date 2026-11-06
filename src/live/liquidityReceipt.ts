import {
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  type Address,
  type TransactionReceipt,
} from "viem";
import { HexString, Order } from "@1inch/swap-vm-sdk";
import { parseSwapOrder, type SwapConfig } from "./swapConfig";
import { assets, liquidityAbi, tokenOrder } from "./liquidityModel";
import { registryAbi, sameAddress, type SwapOperation } from "./swapModel";

export function liquidityReceiptSummary(
  config: SwapConfig,
  operation: SwapOperation,
  receipt: TransactionReceipt,
): string {
  if (!operation.order) throw new Error("Missing liquidity order.");
  const order = parseSwapOrder(operation.order);
  if (!sameAddress(order.maker, operation.account)) throw new Error("Liquidity maker mismatch.");
  const transfers = receipt.logs.flatMap((log) => {
    try {
      return [{ address: log.address, event: decodeEventLog({ abi: erc20Abi, ...log }) }];
    } catch {
      return [];
    }
  });
  const delta = (token: Address) =>
    transfers.reduce((total, log) => {
      if (!sameAddress(log.address, token) || log.event.eventName !== "Transfer") return total;
      return (
        total +
        (sameAddress(log.event.args.to, order.maker) ? log.event.args.value : 0n) -
        (sameAddress(log.event.args.from, order.maker) ? log.event.args.value : 0n)
      );
    }, 0n);
  if (operation.kind === "approval") {
    const call = decodeFunctionData({ abi: erc20Abi, data: operation.data });
    if (
      call.functionName !== "approve" ||
      !sameAddress(call.args[0], config.registry) ||
      !assets.some((asset) => sameAddress(config.tokens[asset], operation.to)) ||
      !transfers.some(
        (log) =>
          sameAddress(log.address, operation.to) &&
          log.event.eventName === "Approval" &&
          sameAddress(log.event.args.owner, order.maker) &&
          sameAddress(log.event.args.spender, config.registry) &&
          log.event.args.value === call.args[1],
      )
    )
      throw new Error("Aqua allowance evidence missing.");
    if (assets.some((asset) => delta(config.tokens[asset]) !== 0n))
      throw new Error("Unexpected approval transfer.");
    return call.args[1] === 0n
      ? "Aqua allowance reset confirmed."
      : "Finite Aqua allowance confirmed.";
  }
  const routerEvents = receipt.logs
    .filter((log) => sameAddress(log.address, config.router))
    .flatMap((log) => {
      try {
        return [decodeEventLog({ abi: liquidityAbi, ...log })];
      } catch {
        return [];
      }
    });
  const aquaEvents = receipt.logs
    .filter((log) => sameAddress(log.address, config.registry))
    .flatMap((log) => {
      try {
        return [decodeEventLog({ abi: registryAbi, ...log })];
      } catch {
        return [];
      }
    });
  if (operation.kind === "initialize" || operation.kind === "update-reserves") {
    const call = decodeFunctionData({ abi: liquidityAbi, data: operation.data });
    const [stored, token0, token1, reserve0, reserve1] = call.args;
    const [a, b] = tokenOrder(config);
    const eventName =
      operation.kind === "initialize" ? "FeeOnTransferInitialized" : "FeeOnTransferReservesUpdated";
    if (
      !sameAddress(operation.to, config.router) ||
      call.functionName !==
        (operation.kind === "initialize"
          ? "initializeFeeOnTransfer"
          : "updateFeeOnTransferReserves")
    )
      throw new Error("Unexpected reserve payload.");
    const built = Order.decode(new HexString(order.encoded)).build();
    if (
      !sameAddress(stored.maker, built.maker) ||
      stored.traits !== built.traits ||
      stored.data !== built.data ||
      !sameAddress(token0, config.tokens[a]) ||
      !sameAddress(token1, config.tokens[b]) ||
      !routerEvents.some(
        (event) =>
          event.eventName === eventName &&
          event.args.orderHash === order.hash &&
          sameAddress(event.args.token0, token0) &&
          sameAddress(event.args.token1, token1) &&
          event.args.reserve0 === reserve0 &&
          event.args.reserve1 === reserve1 &&
          (event.eventName !== "FeeOnTransferInitialized" ||
            sameAddress(event.args.maker, order.maker)),
      )
    )
      throw new Error("Reserve event does not match targets.");
  } else {
    const call = decodeFunctionData({ abi: registryAbi, data: operation.data });
    if (!sameAddress(operation.to, config.registry))
      throw new Error("Unexpected Aqua destination.");
    if (operation.kind === "ship") {
      const [a, b] = tokenOrder(config);
      if (
        call.functionName !== "ship" ||
        !sameAddress(call.args[0], config.router) ||
        call.args[1] !== order.encoded ||
        call.args[2].length !== 2 ||
        !sameAddress(call.args[2][0], config.tokens[a]) ||
        !sameAddress(call.args[2][1], config.tokens[b]) ||
        call.args[3].length !== 2 ||
        !aquaEvents.some(
          (event) =>
            event.eventName === "Shipped" &&
            sameAddress(event.args.maker, order.maker) &&
            sameAddress(event.args.app, config.router) &&
            event.args.strategyHash === order.hash &&
            event.args.strategy === order.encoded,
        )
      )
        throw new Error("Initial allocation evidence missing.");
    } else if (operation.kind === "dock") {
      const [a, b] = tokenOrder(config);
      if (
        call.functionName !== "dock" ||
        !sameAddress(call.args[0], config.router) ||
        call.args[1] !== order.hash ||
        call.args[2].length !== 2 ||
        !sameAddress(call.args[2][0], config.tokens[a]) ||
        !sameAddress(call.args[2][1], config.tokens[b]) ||
        !aquaEvents.some(
          (event) =>
            event.eventName === "Docked" &&
            sameAddress(event.args.maker, order.maker) &&
            sameAddress(event.args.app, config.router) &&
            event.args.strategyHash === order.hash,
        )
      )
        throw new Error("Dock evidence missing.");
    } else if (operation.kind === "push") {
      if (
        call.functionName !== "push" ||
        !sameAddress(call.args[0], order.maker) ||
        !sameAddress(call.args[1], config.router) ||
        call.args[2] !== order.hash ||
        !aquaEvents.some(
          (event) =>
            event.eventName === "Pushed" &&
            sameAddress(event.args.maker, order.maker) &&
            sameAddress(event.args.app, config.router) &&
            event.args.strategyHash === order.hash &&
            sameAddress(event.args.token, call.args[3]) &&
            event.args.amount === call.args[4],
        )
      )
        throw new Error("Push evidence missing.");
      const asset = assets.find((token) => sameAddress(config.tokens[token], call.args[3]));
      if (!asset || !operation.feeRate) throw new Error("Unknown pushed token.");
      const fee = -delta(config.tokens[asset]);
      const movements = transfers.filter(
        (log) =>
          sameAddress(log.address, config.tokens[asset]) && log.event.eventName === "Transfer",
      );
      const outgoing = movements.reduce(
        (sum, log) =>
          sum +
          (log.event.eventName === "Transfer" && sameAddress(log.event.args.from, order.maker)
            ? log.event.args.value
            : 0n),
        0n,
      );
      if (
        outgoing !== call.args[4] ||
        fee < 0n ||
        fee >= call.args[4] ||
        (asset === "usdt" && fee !== 0n) ||
        delta(config.tokens[asset === "xauh" ? "usdt" : "xauh"]) !== 0n
      )
        throw new Error("Self-transfer fee evidence mismatch.");
      return `Push confirmed. Actual ${asset.toUpperCase()} transfer fee: ${fee.toString()} base units. Aqua allocation increased by the gross increment.`;
    } else throw new Error("Unsupported liquidity receipt.");
  }
  if (assets.some((asset) => delta(config.tokens[asset]) !== 0n))
    throw new Error("Unexpected liquidity transfer.");
  return operation.kind === "dock"
    ? "Position closed permanently. Docking removed its Aqua allocation without transferring wallet funds."
    : operation.kind === "ship"
      ? "Initial Aqua allocation confirmed. Wallet tokens remain in the maker wallet."
      : "Pricing reserves confirmed. Wallet funds and Aqua allocation were not withdrawn.";
}

export function actualXauhPushFee(
  config: SwapConfig,
  operation: SwapOperation,
  receipt: TransactionReceipt,
): string | undefined {
  if (operation.kind !== "push") return undefined;
  const call = decodeFunctionData({ abi: registryAbi, data: operation.data });
  if (call.functionName !== "push" || !sameAddress(call.args[3], config.tokens.xauh))
    return undefined;
  let delta = 0n;
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, config.tokens.xauh)) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, ...log });
      if (event.eventName !== "Transfer") continue;
      if (sameAddress(event.args.to, operation.account)) delta += event.args.value;
      if (sameAddress(event.args.from, operation.account)) delta -= event.args.value;
    } catch {
      continue;
    }
  }
  return (-delta).toString();
}
