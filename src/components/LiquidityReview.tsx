import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircledIcon } from "@radix-ui/react-icons";
import { formatUnits } from "viem";
import { parseSwapOrder, swapNetwork, type SwapToken } from "../live/swapConfig";
import { isUnresolved, sameAddress, tokenFee } from "../live/swapModel";
import {
  assets,
  humanRange,
  liquiditySteps,
  workflowConfirmed,
  type LiquidityAction,
  type LiquidityStep,
} from "../live/liquidityModel";
import type { SwapSession } from "../live/swapSession";
import { LiquidityTokenMark } from "./LiquidityPositionForm";

export function liquidityActionLabel(step: LiquidityStep) {
  if (step.kind === "approval")
    return `${step.amount === 0n ? "Reset" : "Approve"} ${step.token!.toUpperCase()}${step.amount === 0n ? " approval" : ""}`;
  if (step.kind === "push") return `Add ${step.token!.toUpperCase()}`;
  return {
    initialize: "Prepare position",
    ship: "Create position",
    "update-reserves": "Confirm changes",
    dock: "Close position",
    swap: "Swap",
  }[step.kind];
}
const completedTitles: Record<LiquidityAction, string> = {
  create: "Position created",
  add: "Liquidity added",
  ratio: "Position updated",
  remove: "Position closed",
};
const reviewTitles: Record<LiquidityAction, string> = {
  create: "Review position",
  add: "Review addition",
  ratio: "Review changes",
  remove: "Review closure",
};

export function LiquidityReview({ session, onDone }: { session: SwapSession; onDone: () => void }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot),
    workflow = state.workflow!;
  const ready = state.readiness,
    decimals = ready?.decimals ?? state.tokenDecimals;
  const pending = state.operations.find(isUnresolved),
    complete = !session.workflowIncomplete();
  const blocked = state.busy || Boolean(pending) || Boolean(state.storageError);
  const maker = sameAddress(workflow.maker, state.account);
  const order = parseSwapOrder(workflow.encoded),
    steps = liquiditySteps(session.config, workflow),
    next = session.liquidityNext();
  const fmt = (amount: bigint, token: SwapToken) =>
    decimals ? formatUnits(amount, decimals[token]) : `${amount} base units`;
  const range = decimals ? humanRange(session.config, order, decimals) : undefined;
  const shownAmounts =
    workflow.action === "remove"
      ? workflow.baseAllocations
      : workflow.action === "add"
        ? workflow.increments
        : workflow.targets;
  const actualFee = state.operations
    .filter((op) => op.workflowId === workflow.id && op.status === "confirmed")
    .reduce((sum, op) => sum + BigInt(op.actualFee ?? "0"), 0n);
  const hasActualFee = state.operations.some(
    (op) =>
      op.workflowId === workflow.id && op.status === "confirmed" && op.actualFee !== undefined,
  );
  const estimatedFee = tokenFee(BigInt(workflow.increments.xauh), {
    rate: BigInt(workflow.fee.rate),
    parts: BigInt(workflow.fee.parts),
  });
  const position = state.positions.find((item) => item.order.hash === order.hash);
  useEffect(() => {
    document.getElementById("liquidity-review-heading")?.focus();
  }, [workflow.id]);
  const done = async () => {
    await session.discardLiquidity();
    if (!session.state.workflow) onDone();
  };
  return (
    <section className="liquidity-review" aria-labelledby="liquidity-review-heading">
      {complete && <CheckCircledIcon className="liquidity-success-icon" aria-hidden="true" />}
      <h2 id="liquidity-review-heading" tabIndex={-1}>
        {complete ? completedTitles[workflow.action] : reviewTitles[workflow.action]}
      </h2>
      <p className="liquidity-muted">
        XAUH / USDT · {order.family === "constant-product" ? "Full range" : "Custom range"}
      </p>
      <div className="liquidity-review-amounts">
        {assets
          .filter((token) => workflow.action !== "add" || BigInt(shownAmounts[token]) > 0n)
          .map((token) => (
            <div key={token}>
              <LiquidityTokenMark token={token} />
              <strong>{fmt(BigInt(shownAmounts[token]), token)}</strong>
              <span>{token.toUpperCase()}</span>
            </div>
          ))}
      </div>
      <dl className="liquidity-review-facts">
        {workflow.action === "add" && (
          <div>
            <dt>New pricing amounts</dt>
            <dd>
              {assets
                .map(
                  (token) =>
                    `${fmt(BigInt(workflow.targets[token]), token)} ${token.toUpperCase()}`,
                )
                .join(" · ")}
            </dd>
          </div>
        )}
        {range && (
          <div>
            <dt>Price range</dt>
            <dd>
              {range
                .map((n) => n.toLocaleString(undefined, { maximumSignificantDigits: 8 }))
                .join(" – ")}{" "}
              USDT/XAUH
            </dd>
          </div>
        )}
        <div>
          <dt>Swap fee</dt>
          <dd>{formatUnits(order.feeUnits, 7)}%</dd>
        </div>
        {estimatedFee > 0n && !hasActualFee && (
          <div>
            <dt>Estimated XAUH transfer fee</dt>
            <dd>{fmt(estimatedFee, "xauh")} XAUH</dd>
          </div>
        )}
        {hasActualFee && (
          <div className="liquidity-actual-fee">
            <dt>Paid XAUH transfer fee</dt>
            <dd>{fmt(actualFee, "xauh")} XAUH</dd>
          </div>
        )}
      </dl>
      {workflow.action === "remove" && !complete && (
        <p className="liquidity-close-note">
          This closes the position permanently. Your tokens stay in your wallet.
        </p>
      )}
      {!complete && !pending && (
        <ol className="liquidity-progress" aria-label="Confirmation steps">
          {steps.map((step) => (
            <li
              key={step.id}
              className={
                workflowConfirmed(workflow, step, state.operations)
                  ? "is-done"
                  : step.id === next?.id
                    ? "is-current"
                    : ""
              }
            >
              <span aria-hidden="true">
                {workflowConfirmed(workflow, step, state.operations) ? "✓" : "○"}
              </span>
              {liquidityActionLabel(step)}
            </li>
          ))}
        </ol>
      )}
      {state.problem && (
        <p className="liquidity-error" role="alert">
          {state.problem}
        </p>
      )}
      {pending ? (
        <LiquidityPending session={session} />
      ) : complete ? (
        <button
          type="button"
          className="button button--primary liquidity-primary"
          disabled={state.busy}
          onClick={() => void done()}
        >
          Done
        </button>
      ) : !state.account ? (
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
        next && (
          <>
            <button
              type="button"
              className="button button--primary liquidity-primary"
              disabled={blocked || !ready || !maker}
              onClick={() => void session.executeLiquidityStep(next.id)}
            >
              {liquidityActionLabel(next)}
            </button>
            <p className="liquidity-confirm-note">
              {next.kind === "approval" && next.amount !== undefined
                ? `${fmt(next.amount, next.token!)} ${next.token!.toUpperCase()} · `
                : ""}
              Confirm this step in your wallet.
            </p>
          </>
        )
      )}
      {!maker && state.account && !complete && (
        <p className="liquidity-muted">Connect the wallet that owns this position to continue.</p>
      )}
      <details className="liquidity-advanced">
        <summary>{complete ? "Transaction details" : "Details & more options"}</summary>
        <p className="liquidity-muted">{state.message}</p>
        <dl className="live-facts">
          <div>
            <dt>Maker</dt>
            <dd className="live-address">{workflow.maker}</dd>
          </div>
          {assets.map((token) => (
            <div key={token}>
              <dt>{token.toUpperCase()} push increment</dt>
              <dd>{fmt(BigInt(workflow.increments[token]), token)}</dd>
            </div>
          ))}
        </dl>
        <p className="liquidity-muted">
          Pushes add allocation; reserve updates set absolute pricing amounts. Lowering reserves
          does not withdraw tokens or reduce allocation. Network fees are additional.
        </p>
        <label className="liquidity-muted">
          Saved encoded order
          <textarea
            className="liquidity-order"
            readOnly
            aria-label="Saved encoded order"
            value={workflow.encoded}
          />
        </label>
        {!complete && (
          <div className="liquidity-secondary-actions">
            <button
              type="button"
              className="liquidity-text-button"
              disabled={blocked || !ready || !maker}
              onClick={() => void session.rereviewLiquidity()}
            >
              Review targets again
            </button>
            {workflow.action !== "remove" && position?.status === "active" && (
              <button
                type="button"
                className="liquidity-text-button"
                disabled={blocked || !ready || !maker}
                onClick={() => void session.reviewLiquidityClosure()}
              >
                Review full closure instead
              </button>
            )}
            <button
              type="button"
              className="liquidity-text-button"
              disabled={
                blocked ||
                (position?.status !== "closed" &&
                  state.operations.some(
                    (op) =>
                      op.workflowId === workflow.id &&
                      op.kind !== "approval" &&
                      op.status === "confirmed",
                  ))
              }
              onClick={() => void done()}
            >
              {position?.status === "closed" ? "Clear closed position review" : "Cancel review"}
            </button>
          </div>
        )}
      </details>
    </section>
  );
}

export function LiquidityPending({ session }: { session: SwapSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot),
    pending = state.operations.find(isUnresolved);
  const [hash, setHash] = useState("");
  if (!pending) return null;
  return (
    <section className="liquidity-pending" aria-labelledby="liquidity-pending-heading">
      <h3 id="liquidity-pending-heading">
        {pending.status === "needs-review"
          ? "Transaction needs review"
          : pending.status === "ambiguous" || pending.status === "awaiting-wallet"
            ? "Check your wallet"
            : "Waiting for confirmation"}
      </h3>
      <p className="liquidity-muted">
        {pending.status === "needs-review"
          ? "The receipt needs checking before you can continue."
          : "Your next step unlocks after this transaction is confirmed."}
      </p>
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
          type="button"
          className="button button--primary liquidity-primary"
          disabled={state.busy}
          onClick={() => void session.reconcile()}
        >
          Check confirmation
        </button>
      )}
      <details className="liquidity-advanced">
        <summary>Find a transaction</summary>
        <p className="liquidity-muted">
          {pending.kind} · nonce {pending.nonce} · {pending.status}. Nothing is resent when you
          check.
        </p>
        {pending.hash && (
          <a href={`${swapNetwork.explorer}/tx/${pending.hash}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        )}
        <form
          className="live-fields"
          onSubmit={(event) => {
            event.preventDefault();
            void session.reconcile(hash);
          }}
        >
          <label>
            Transaction or replacement hash
            <input
              required
              pattern="0x[0-9a-fA-F]{64}"
              value={hash}
              onChange={(event) => setHash(event.target.value)}
            />
          </label>
          <button className="button button--secondary" disabled={state.busy || !state.account}>
            Attach hash & check
          </button>
        </form>
      </details>
    </section>
  );
}
