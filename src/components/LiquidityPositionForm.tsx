import { useState, useSyncExternalStore, type FormEvent } from "react";
import { formatUnits } from "viem";
import type { ExecutionFamily } from "../types";
import { swapNetwork, type SwapToken } from "../live/swapConfig";
import { isUnresolved } from "../live/swapModel";
import {
  assets,
  createLiquidityOrder,
  liquidityAmount,
  openingPrice,
  type LiquidityAction,
  type LiquidityPosition,
} from "../live/liquidityModel";
import type { SwapSession } from "../live/swapSession";

export function LiquidityTokenMark({ token }: { token: SwapToken }) {
  return (
    <span className={`liquidity-token-mark liquidity-token-mark--${token}`} aria-hidden="true">
      {token === "xauh" ? "X" : "T"}
    </span>
  );
}

const titles: Record<LiquidityAction, string> = {
  create: "Create a position",
  add: "Add liquidity",
  ratio: "Change ratio",
  remove: "Close position",
};
const reviewLabels: Record<LiquidityAction, string> = {
  create: "Review position",
  add: "Review addition",
  ratio: "Review changes",
  remove: "Review removal",
};

export function LiquidityPositionForm({
  session,
  action,
  position,
  onCancel,
}: {
  session: SwapSession;
  action: LiquidityAction;
  position?: LiquidityPosition;
  onCancel: () => void;
}) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot),
    ready = state.readiness;
  const [family, setFamily] = useState<ExecutionFamily>("constant-product");
  const [amounts, setAmounts] = useState(() => ({
    xauh:
      action === "ratio" && position && ready
        ? formatUnits(position.reserves.xauh, ready.decimals.xauh)
        : "0",
    usdt:
      action === "ratio" && position && ready
        ? formatUnits(position.reserves.usdt, ready.decimals.usdt)
        : "0",
  }));
  const [fee, setFee] = useState("0"),
    [minimum, setMinimum] = useState("100"),
    [maximum, setMaximum] = useState("150"),
    [error, setError] = useState("");
  const decimals = ready?.decimals ?? state.tokenDecimals;
  let price: number | undefined;
  let formValid = action === "remove";
  try {
    if (decimals && action !== "remove") {
      const parsed = {
        xauh: liquidityAmount(amounts.xauh, decimals.xauh),
        usdt: liquidityAmount(amounts.usdt, decimals.usdt),
      };
      if (action === "add") formValid = parsed.xauh + parsed.usdt > 0n;
      else if (action === "ratio")
        formValid =
          parsed.xauh + parsed.usdt > 0n &&
          (position?.order.family !== "constant-product" ||
            (parsed.xauh > 0n && parsed.usdt > 0n)) &&
          assets.some((token) => parsed[token] !== position?.reserves[token]);
      else {
        price = openingPrice(
          session.config,
          createLiquidityOrder(
            session.config,
            state.account ?? session.config.orders[0].maker,
            family,
            parsed,
            decimals,
            fee,
            minimum,
            maximum,
            1n,
          ),
          parsed,
          decimals,
        );
        formValid = Number.isFinite(price) && price > 0;
      }
    }
  } catch {
    price = undefined;
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (!ready) throw new Error("Connect your wallet first.");
      void session.reviewLiquidity({
        action,
        amounts:
          action === "remove"
            ? { xauh: 0n, usdt: 0n }
            : {
                xauh: liquidityAmount(amounts.xauh, ready.decimals.xauh),
                usdt: liquidityAmount(amounts.usdt, ready.decimals.usdt),
              },
        order: position?.order.encoded,
        family,
        feeBps: fee,
        minimum,
        maximum,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Check your amounts.");
    }
  };
  const suffix =
    action === "ratio" ? "desired reserve total" : action === "add" ? "increment" : "amount";
  return (
    <form className="liquidity-editor" onSubmit={submit} aria-labelledby="liquidity-form-heading">
      <div className="liquidity-card-heading">
        <h2 id="liquidity-form-heading" tabIndex={-1}>
          {titles[action]}
        </h2>
        {action !== "create" && (
          <button type="button" className="liquidity-text-button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="liquidity-muted">XAUH / USDT</p>
      {action === "create" && (
        <fieldset className="liquidity-range-picker">
          <legend>Price range</legend>
          <div className="liquidity-segmented">
            {(
              [
                ["constant-product", "Full range"],
                ["concentrated-liquidity", "Custom range"],
              ] as const
            ).map(([id, title]) => (
              <label key={id} className={family === id ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="liquidity-family"
                  value={id}
                  checked={family === id}
                  onChange={() => setFamily(id)}
                />
                <span>{title}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {action === "create" && family === "concentrated-liquidity" && (
        <div className="liquidity-input-grid liquidity-range-inputs">
          <label>
            Min price
            <input
              aria-label="Minimum price (USDT/XAUH)"
              inputMode="decimal"
              required
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
            <small>USDT per XAUH</small>
          </label>
          <label>
            Max price
            <input
              aria-label="Maximum price (USDT/XAUH)"
              inputMode="decimal"
              required
              value={maximum}
              onChange={(event) => setMaximum(event.target.value)}
            />
            <small>USDT per XAUH</small>
          </label>
        </div>
      )}
      {action !== "remove" ? (
        <>
          <h3 className="liquidity-field-heading">
            {action === "ratio" ? "New pricing amounts" : "Token amounts"}
          </h3>
          <div className="liquidity-amounts">
            {assets.map((token) => (
              <label className="liquidity-amount-card" key={token}>
                <span className="liquidity-amount-top">
                  <span>
                    <LiquidityTokenMark token={token} />
                    {token.toUpperCase()}
                  </span>
                  {ready && (
                    <small title={formatUnits(ready.balances[token], ready.decimals[token])}>
                      Balance{" "}
                      {Number(
                        formatUnits(ready.balances[token], ready.decimals[token]),
                      ).toLocaleString(undefined, { maximumSignificantDigits: 8 })}
                    </small>
                  )}
                </span>
                <input
                  aria-label={`${token.toUpperCase()} ${suffix}`}
                  inputMode="decimal"
                  autoComplete="off"
                  required
                  value={amounts[token]}
                  onChange={(event) => setAmounts({ ...amounts, [token]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {action === "ratio" && (
            <p className="liquidity-muted">Lowering pricing amounts does not withdraw tokens.</p>
          )}
          {action === "create" && (
            <>
              <div className="liquidity-summary-row">
                <span>Opening price</span>
                <output>
                  {price !== undefined && Number.isFinite(price)
                    ? `${price.toLocaleString(undefined, { maximumSignificantDigits: 8 })} USDT/XAUH`
                    : "—"}
                </output>
              </div>
              <details className="liquidity-fee-editor">
                <summary>
                  <span>Swap fee</span>
                  <strong>{/^\d+$/.test(fee) ? `${Number(fee) / 100}%` : "Custom"}</strong>
                </summary>
                <label>
                  Swap fee (whole bps)
                  <input
                    inputMode="numeric"
                    pattern="[0-9]+"
                    value={fee}
                    onChange={(event) => setFee(event.target.value)}
                    required
                  />
                </label>
                <p className="liquidity-muted">
                  1 bps = 0.01%. Applies to swaps against your position.
                </p>
              </details>
              <p className="liquidity-wallet-note">
                Tokens stay in your wallet and can back multiple positions.
              </p>
            </>
          )}
        </>
      ) : (
        <p className="liquidity-close-note">
          Your tokens stay in your wallet. This position will stop trading and cannot be reopened.
        </p>
      )}
      {error && (
        <p className="liquidity-error" role="alert">
          {error}
        </p>
      )}
      {!state.account ? (
        <button
          type="button"
          className="button button--primary liquidity-primary"
          disabled={state.busy}
          onClick={() => void session.connect()}
        >
          Connect wallet
        </button>
      ) : state.chainId !== swapNetwork.chainId ? (
        <button
          type="button"
          className="button button--primary liquidity-primary"
          disabled={state.busy}
          onClick={() => void session.switchNetwork()}
        >
          Switch to Sepolia
        </button>
      ) : (
        <button
          className="button button--primary liquidity-primary"
          disabled={
            state.busy ||
            Boolean(state.storageError) ||
            state.operations.some(isUnresolved) ||
            !ready ||
            !formValid
          }
        >
          {reviewLabels[action]}
        </button>
      )}
    </form>
  );
}
