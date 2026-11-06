import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeftIcon, ReloadIcon } from "@radix-ui/react-icons";
import { formatUnits } from "viem";
import { AquaAttribution } from "../components/AquaAttribution";
import { LiquidityPositionForm, LiquidityTokenMark } from "../components/LiquidityPositionForm";
import { LiquidityPositionCard } from "../components/LiquidityPositionCard";
import { LiquidityPending, LiquidityReview } from "../components/LiquidityReview";
import { LiquidityWalletMenu } from "../components/LiquidityWalletMenu";
import { useAquaWallet } from "../live/SwapContext";
import { swapNetwork } from "../live/swapConfig";
import { isUnresolved, sameAddress } from "../live/swapModel";
import { assets, type LiquidityAction, type LiquidityPosition } from "../live/liquidityModel";
import type { SwapSession } from "../live/swapSession";

export default function LiquidityPositionsScreen({ onBack }: { onBack: () => void }) {
  const { session, error } = useAquaWallet();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="screen-content liquidity-screen" aria-labelledby="liquidity-heading">
      <div className="subscreen-header">
        <button
          type="button"
          className="back-button"
          aria-label="Back to trading strategy"
          onClick={onBack}
        >
          <ChevronLeftIcon />
          <span>Back</span>
        </button>
        <div className="strategy-title">
          <h1 id="liquidity-heading" tabIndex={-1} ref={heading}>
            Liquidity positions
          </h1>
          <AquaAttribution />
        </div>
      </div>
      {session ? (
        <Positions session={session} />
      ) : (
        <p className="live-message" role={error ? "alert" : "status"}>
          {error ?? "Loading positions…"}
        </p>
      )}
    </main>
  );
}

function Positions({ session }: { session: SwapSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [selected, setSelected] = useState<LiquidityPosition>();
  const [action, setAction] = useState<LiquidityAction>("create");
  const [encoded, setEncoded] = useState("");
  const ready = state.readiness,
    decimals = ready?.decimals ?? state.tokenDecimals;
  const pending = state.operations.find(isUnresolved),
    workflow = state.workflow;
  const own = state.positions
    .filter(
      (position) => sameAddress(position.order.maker, state.account) && position.status !== "draft",
    )
    .reverse()
    .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"));
  const blocked =
    state.busy ||
    Boolean(pending) ||
    Boolean(state.storageError) ||
    !ready ||
    session.workflowIncomplete();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden && !session.state.busy && !session.state.operations.some(isUnresolved))
        void session.refreshPositions(false);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [session]);
  const select = (position: LiquidityPosition, mode: LiquidityAction) => {
    setSelected(position);
    setAction(mode);
    window.requestAnimationFrame(() => document.getElementById("liquidity-form-heading")?.focus());
  };
  const reset = () => {
    setSelected(undefined);
    setAction("create");
  };
  const refresh = async () => {
    if (state.account) await session.refresh();
    await session.refreshPositions();
  };
  return (
    <>
      <div className="liquidity-wallet-bar">
        <span className="liquidity-network">
          <span className="swap-network-dot" />
          Sepolia testnet
        </span>
        {ready && (
          <div className="liquidity-wallet-balances" aria-label="Shared wallet funds">
            {assets.map((token) => (
              <span key={token} title={formatUnits(ready.balances[token], ready.decimals[token])}>
                <LiquidityTokenMark token={token} />
                {Number(formatUnits(ready.balances[token], ready.decimals[token])).toLocaleString(
                  undefined,
                  { maximumSignificantDigits: 8 },
                )}{" "}
                {token.toUpperCase()}
              </span>
            ))}
          </div>
        )}
        {state.account ? (
          <LiquidityWalletMenu
            key={state.account}
            account={state.account}
            chainId={state.chainId}
            eth={ready?.eth}
            busy={state.busy}
            onRefresh={() => void session.refresh()}
            onDisconnect={() => {
              session.disconnect();
              window.requestAnimationFrame(() =>
                document
                  .querySelector<HTMLButtonElement>(".liquidity-main-card .button--primary")
                  ?.focus(),
              );
            }}
          />
        ) : (
          <span className="liquidity-muted">Wallet not connected</span>
        )}
      </div>
      {state.storageError && (
        <p className="liquidity-error" role="alert">
          {state.storageError}
        </p>
      )}
      {state.problem && !workflow && (
        <p className="liquidity-error" role="alert">
          {state.problem}
        </p>
      )}
      <div className="liquidity-layout">
        <div className="liquidity-main-card">
          {workflow ? (
            <LiquidityReview session={session} onDone={reset} />
          ) : pending ? (
            <LiquidityPending session={session} />
          ) : (
            <LiquidityPositionForm
              key={`${action}-${selected?.order.hash ?? "new"}`}
              session={session}
              action={action}
              position={selected}
              onCancel={reset}
            />
          )}
        </div>
        <section className="liquidity-positions-panel" aria-labelledby="positions-heading">
          <div className="liquidity-card-heading">
            <h2 id="positions-heading">
              Your positions <span>{own.length}</span>
            </h2>
            <button
              type="button"
              className="liquidity-refresh"
              aria-label="Refresh positions"
              title="Refresh positions"
              disabled={state.busy || state.discovering}
              onClick={() => void refresh()}
            >
              <ReloadIcon />
            </button>
          </div>
          {workflow && !session.workflowIncomplete() && (
            <p className="liquidity-muted">Choose Done to manage another position.</p>
          )}
          {!state.account ? (
            <p className="liquidity-empty">Connect your wallet to see your positions.</p>
          ) : (
            own.length === 0 && (
              <p className="liquidity-empty">
                {state.discoveryComplete
                  ? "No positions yet. Create your first one."
                  : "No positions loaded yet."}
              </p>
            )
          )}
          <div className="liquidity-position-list">
            {own.map((position) => (
              <LiquidityPositionCard
                key={position.order.hash}
                session={session}
                position={position}
                decimals={decimals}
                disabled={blocked || Boolean(workflow)}
                onSelect={select}
              />
            ))}
          </div>
          {!state.discoveryComplete && (
            <p className="liquidity-discovery-note" role="status">
              {state.discovering
                ? "Looking for positions…"
                : "Some positions may be missing. Refresh or import one below."}
            </p>
          )}
        </section>
      </div>
      <details className="liquidity-utilities">
        <summary>Activity & advanced</summary>
        <h3>Transaction history</h3>
        <ol className="live-transactions">
          {state.operations.map((operation) => (
            <li key={operation.id}>
              <strong>
                {operation.kind} · {operation.status}
              </strong>
              {operation.hash && (
                <a
                  href={`${swapNetwork.explorer}/tx/${operation.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction
                </a>
              )}
              {operation.evidence && <p>{operation.evidence}</p>}
            </li>
          ))}
        </ol>
        {state.operations.length === 0 && <p className="liquidity-muted">No transactions yet.</p>}
        <h3>Position discovery</h3>
        <p className="liquidity-muted">{state.discoveryMessage}</p>
        <p className="liquidity-muted">
          Positions use shared wallet funds. Aqua allocation is the amount an order can trade;
          pricing reserves determine its price. Neither is a separate wallet balance.
        </p>
        <form
          className="live-fields"
          onSubmit={(event) => {
            event.preventDefault();
            void session.importPosition(encoded);
          }}
        >
          <label>
            Import an encoded order
            <textarea
              className="liquidity-order"
              required
              value={encoded}
              onChange={(event) => setEncoded(event.target.value)}
            />
          </label>
          <button className="button button--secondary" disabled={state.busy || state.discovering}>
            Import position
          </button>
        </form>
      </details>
    </>
  );
}
