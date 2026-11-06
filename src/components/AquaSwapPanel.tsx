import { useEffect, useState, useSyncExternalStore } from "react";
import { formatEther, formatUnits } from "viem";
import type { ExecutionFamily } from "../types";
import { familyNames, swapNetwork, type SwapDirection } from "../live/swapConfig";
import { inputToken, isUnresolved, sameAddress } from "../live/swapModel";
import type { SwapSession } from "../live/swapSession";
import { useAquaWallet } from "../live/SwapContext";
import { useSwapQuotes } from "../live/useSwapQuotes";
import { AquaExecution } from "./AquaExecution";

export default function AquaSwapPanel({ direction }: { direction: SwapDirection }) {
  const { session, error } = useAquaWallet();
  const [fallbackSelected, setFallbackSelected] = useState<ExecutionFamily>("constant-product");
  if (session) return <SwapForm direction={direction} session={session} />;
  if (error)
    return (
      <>
        <AquaExecution
          direction={direction}
          estimates={[]}
          selected={fallbackSelected}
          onSelect={setFallbackSelected}
          disabled={false}
        />
        <p className="live-message" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => window.location.reload()}
        >
          Reload configuration
        </button>
      </>
    );
  return (
    <p className="live-message" role="status">
      Loading Sepolia contracts…
    </p>
  );
}

function SwapForm({ direction, session }: { direction: SwapDirection; session: SwapSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [amounts, setAmounts] = useState({ "instant-buy": "1", "instant-sell": "1" });
  const [slippage, setSlippage] = useState("50");
  const [selected, setSelected] = useState<ExecutionFamily>("constant-product");
  const [hash, setHash] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ready = state.readiness,
    token = inputToken(direction),
    buying = direction === "instant-buy";
  const estimates = state.estimates.filter(
    (item) => !item.quote || item.quote.direction === direction,
  );
  const quote = estimates.find((item) => item.family === selected)?.quote;
  const expired = Boolean(quote && now >= quote.expiresAt);
  const pending = state.operations.find(isUnresolved);
  const blocked = state.busy || Boolean(pending) || Boolean(state.storageError);
  const correctChain = state.chainId === swapNetwork.chainId;
  const allowance = ready?.allowances[token];
  const configured = Boolean(state.account && correctChain && ready);
  const allowanceMatches = quote && allowance === quote.input;
  const boundQuote = quote && sameAddress(quote.account, state.account);
  const sufficientFunds = quote && ready && ready.balances[token] >= quote.input && ready.eth > 0n;
  useSwapQuotes(
    session,
    direction,
    amounts[direction],
    slippage,
    state.busy || Boolean(pending),
    state.account,
    state.chainId,
  );
  return (
    <>
      <section className="strategy-section" aria-labelledby="strategy-settings-heading">
        <h2 id="strategy-settings-heading">Swap settings</h2>
        <div className="strategy-fields">
          <label className="strategy-field">
            <span>{buying ? "USDT to spend" : "XAUH to sell"}</span>
            <span className="strategy-input-wrap">
              <input
                inputMode="decimal"
                autoComplete="off"
                aria-label={buying ? "USDT to spend" : "XAUH to sell"}
                placeholder="0.00"
                value={amounts[direction]}
                disabled={state.busy}
                onChange={(event) => {
                  setAmounts({ ...amounts, [direction]: event.target.value });
                  session.invalidateQuotes();
                }}
              />
              <small>{buying ? "USDT" : "XAUH"}</small>
            </span>
          </label>
          <label className="strategy-field">
            <span>Slippage tolerance</span>
            <span className="strategy-input-wrap">
              <input
                inputMode="numeric"
                aria-label="Slippage tolerance"
                value={slippage}
                disabled={state.busy}
                onChange={(event) => {
                  setSlippage(event.target.value);
                  session.invalidateQuotes();
                }}
              />
              <small>bps</small>
            </span>
          </label>
        </div>
        <p className="section-help">
          50 bps = 0.50%. Quotes last up to 90 seconds. Minimum received applies after token
          transfer fees. Quotes update as you edit and refresh every 15 seconds while this page is
          visible.
        </p>
        <p className="section-help" role="status" aria-label="Aqua quotes">
          {state.quoteMessage}
        </p>
        <AquaExecution
          direction={direction}
          estimates={estimates}
          decimals={state.quoteContext?.decimals}
          selected={selected}
          onSelect={setSelected}
          disabled={state.busy}
        />
      </section>
      <section
        className="strategy-section swap-wallet-section"
        aria-labelledby="swap-wallet-heading"
      >
        <h2 id="swap-wallet-heading">Wallet & swap</h2>
        <p className="section-help">
          Each approval and swap is a separate action confirmed in your browser wallet.
        </p>
        <div className="live-message" role="status" aria-live="polite">
          {state.message}
        </div>
        {state.storageError && (
          <p role="alert" className="live-warning">
            {state.storageError}
          </p>
        )}
        <dl className="live-facts">
          <div>
            <dt>Wallet</dt>
            <dd>
              {state.account ? (
                <a
                  className="live-address"
                  href={`${swapNetwork.explorer}/address/${state.account}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {state.account}
                </a>
              ) : (
                "Not connected"
              )}
            </dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>
              {correctChain
                ? "Sepolia (11155111)"
                : state.chainId
                  ? `Switch to Sepolia · current chain ${state.chainId}`
                  : "Sepolia required"}
            </dd>
          </div>
          {ready && (
            <>
              <div>
                <dt>XAUH balance</dt>
                <dd>{formatUnits(ready.balances.xauh, ready.decimals.xauh)} XAUH</dd>
              </div>
              <div>
                <dt>USDT balance</dt>
                <dd>{formatUnits(ready.balances.usdt, ready.decimals.usdt)} USDT</dd>
              </div>
              <div>
                <dt>Network fee balance</dt>
                <dd>{formatEther(ready.eth)} Sepolia ETH</dd>
              </div>
              <div>
                <dt>Current {token.toUpperCase()} allowance</dt>
                <dd>
                  {formatUnits(ready.allowances[token], ready.decimals[token])}{" "}
                  {token.toUpperCase()}
                </dd>
              </div>
            </>
          )}
          {quote && (
            <>
              <div>
                <dt>Selected execution</dt>
                <dd>{familyNames[selected]}</dd>
              </div>
              <div>
                <dt>Quote</dt>
                <dd>
                  {expired
                    ? "Expired · request a fresh quote"
                    : `Block ${quote.block} · ${Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))} seconds remaining`}
                </dd>
              </div>
            </>
          )}
        </dl>
        <div className="swap-action-buttons">
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy}
            onClick={() => void session.connect()}
          >
            {state.account ? "Reconnect wallet" : "Connect wallet"}
          </button>
          {state.chainId !== 0 && !correctChain && (
            <button
              type="button"
              className="button button--secondary"
              disabled={state.busy}
              onClick={() => void session.switchNetwork()}
            >
              Switch to Sepolia
            </button>
          )}
          {state.account && (
            <button
              type="button"
              className="button button--secondary"
              disabled={state.busy}
              onClick={() => void session.refresh()}
            >
              Refresh wallet
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy || state.quoting || !amounts[direction]}
            onClick={() => void session.quote(direction, amounts[direction], slippage)}
          >
            Get live quotes
          </button>
          {Boolean(allowance) && (
            <button
              type="button"
              className="button button--secondary"
              disabled={blocked || !configured}
              onClick={() => void session.approve(selected, true, token)}
            >
              Reset {token.toUpperCase()} allowance
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            disabled={
              blocked ||
              state.quoting ||
              !boundQuote ||
              expired ||
              !configured ||
              !sufficientFunds ||
              allowance !== 0n
            }
            onClick={() => void session.approve(selected, false, token)}
          >
            Approve exact {token.toUpperCase()}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={
              blocked ||
              state.quoting ||
              !boundQuote ||
              expired ||
              !configured ||
              !sufficientFunds ||
              !allowanceMatches
            }
            onClick={() => void session.swap(selected)}
          >
            {buying ? "Buy XAUH" : "Sell XAUH"}
          </button>
        </div>
        {quote && state.account && ready && !sufficientFunds && (
          <p className="section-help">
            Your wallet needs enough {token.toUpperCase()} and Sepolia ETH to execute this swap. You
            can still compare quotes.
          </p>
        )}
        {quote && state.account && !allowanceMatches && (
          <p className="section-help">
            Approve the exact input and reconcile the approval. Quotes refresh automatically
            afterward. Reset any existing allowance before setting a new amount.
          </p>
        )}
        {pending && (
          <div className="live-card">
            <h3>Transaction awaiting reconciliation</h3>
            <p>
              {pending.kind} · nonce {pending.nonce} · {pending.status}
            </p>
            <p>
              Further writes are blocked until the receipt is checked. Reloading never resends a
              transaction.
            </p>
            <button
              type="button"
              className="button button--secondary"
              disabled={state.busy}
              onClick={() => void session.reconcile()}
            >
              Reconcile transaction
            </button>
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
              <button type="submit" className="button button--secondary" disabled={state.busy}>
                Attach hash & reconcile
              </button>
            </form>
          </div>
        )}
        {state.operations.length > 0 && (
          <details className="live-card" open={Boolean(pending)}>
            <summary>Swap transaction history</summary>
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
          </details>
        )}
        <details className="live-card">
          <summary>Sepolia contracts</summary>
          <dl className="live-facts">
            {Object.entries({
              Router: session.config.router,
              "Aqua registry": session.config.registry,
              XAUH: session.config.tokens.xauh,
              USDT: session.config.tokens.usdt,
            }).map(([label, address]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <a
                    className="live-address"
                    href={`${swapNetwork.explorer}/address/${address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {address}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Contract code and registry binding are checked before quoting and each wallet
            transaction. Submitted transactions require two canonical block confirmations and
            matching settlement events.
          </p>
        </details>
      </section>
    </>
  );
}
