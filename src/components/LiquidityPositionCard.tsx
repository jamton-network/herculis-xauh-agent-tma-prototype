import { formatUnits } from "viem";
import { familyNames, type SwapToken } from "../live/swapConfig";
import {
  assets,
  humanRange,
  type LiquidityAction,
  type LiquidityPosition,
} from "../live/liquidityModel";
import type { SwapSession } from "../live/swapSession";
import { LiquidityTokenMark } from "./LiquidityPositionForm";

export function LiquidityPositionCard({
  session,
  position,
  decimals,
  disabled,
  onSelect,
}: {
  session: SwapSession;
  position: LiquidityPosition;
  decimals?: Record<SwapToken, number>;
  disabled: boolean;
  onSelect: (position: LiquidityPosition, action: LiquidityAction) => void;
}) {
  const full = (amount: bigint, token: SwapToken) =>
    decimals ? formatUnits(amount, decimals[token]) : `${amount} base units`;
  const compact = (amount: bigint, token: SwapToken) =>
    decimals
      ? Number(full(amount, token)).toLocaleString(undefined, { maximumSignificantDigits: 8 })
      : "—";
  const range = decimals ? humanRange(session.config, position.order, decimals) : undefined;
  return (
    <article className="liquidity-position">
      <div className="liquidity-card-heading">
        <h3>XAUH / USDT</h3>
        <span className={`liquidity-status liquidity-status--${position.status}`}>
          {position.status === "initialized" ? "Preparing" : position.status}
        </span>
      </div>
      <p className="liquidity-muted">
        {position.order.family === "constant-product" ? "Full range" : "Custom range"} ·{" "}
        {formatUnits(position.order.feeUnits, 7)}% fee
      </p>
      {range && (
        <p className="liquidity-range-caption">
          {range
            .map((n) => n.toLocaleString(undefined, { maximumSignificantDigits: 6 }))
            .join(" – ")}{" "}
          USDT/XAUH
        </p>
      )}
      <p className="liquidity-allocation-label">Allocated</p>
      <div className="liquidity-allocation" aria-label="Aqua allocation">
        {assets.map((token) => (
          <div key={token}>
            <LiquidityTokenMark token={token} />
            <span>
              <strong title={full(position.allocations[token], token)}>
                {compact(position.allocations[token], token)}
              </strong>
              <small>{token.toUpperCase()}</small>
            </span>
          </div>
        ))}
      </div>
      {position.status === "active" && (
        <div className="liquidity-position-actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled}
            onClick={() => onSelect(position, "add")}
          >
            Add liquidity
          </button>
          <details className="liquidity-manage">
            <summary>Manage</summary>
            <div>
              <button
                type="button"
                className="liquidity-text-button"
                disabled={disabled}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onSelect(position, "ratio");
                }}
              >
                Change ratio
              </button>
              <button
                type="button"
                className="liquidity-text-button"
                disabled={disabled}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onSelect(position, "remove");
                }}
              >
                Close position
              </button>
            </div>
          </details>
        </div>
      )}
      {position.error && (
        <p className="liquidity-error" role="alert">
          Current position state is unavailable. Refresh to try again.
        </p>
      )}
      <details className="liquidity-position-details">
        <summary>Position details</summary>
        <dl className="live-facts">
          <div>
            <dt>Pricing type</dt>
            <dd>{familyNames[position.order.family]}</dd>
          </div>
          {assets.map((token) => (
            <div key={token}>
              <dt>Pricing reserve · {token.toUpperCase()}</dt>
              <dd>{full(position.reserves[token], token)}</dd>
            </div>
          ))}
          {assets.map((token) => (
            <div key={token}>
              <dt>Aqua allocation · {token.toUpperCase()}</dt>
              <dd>{full(position.allocations[token], token)}</dd>
            </div>
          ))}
          <div>
            <dt>Order hash</dt>
            <dd className="live-address">{position.order.hash}</dd>
          </div>
          <div>
            <dt>Observed at block</dt>
            <dd>{String(position.block)}</dd>
          </div>
        </dl>
        <label className="liquidity-muted">
          Encoded order
          <textarea
            className="liquidity-order"
            readOnly
            aria-label="Encoded position order"
            value={position.order.encoded}
          />
        </label>
      </details>
    </article>
  );
}
