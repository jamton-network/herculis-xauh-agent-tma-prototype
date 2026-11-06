import { GlobeIcon, PersonIcon, CopyIcon } from "@radix-ui/react-icons";
import { useState, useSyncExternalStore } from "react";
import { formatEther, formatUnits } from "viem";
import { useAquaWallet } from "../live/SwapContext";
import type { SwapSession } from "../live/swapSession";
import { IconTile } from "./IconTile";

export function ExternalWalletCard() {
  const { session, error } = useAquaWallet();
  if (!session)
    return (
      <section
        className="wallet-card wallet-card--connected"
        aria-labelledby="connected-wallet-heading"
      >
        <div className="wallet-card-top">
          <IconTile>
            <PersonIcon />
          </IconTile>
          <h2 id="connected-wallet-heading">External wallet</h2>
        </div>
        <p className="wallet-explainer" role={error ? "alert" : "status"}>
          {error ?? "Loading wallet connection…"}
        </p>
      </section>
    );
  return <ConnectedWalletCard session={session} />;
}

function ConnectedWalletCard({ session }: { session: SwapSession }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const ready = state.readiness;
  const [copyMessage, setCopyMessage] = useState("");
  const connected = Boolean(state.account);
  const correctChain = state.chainId === session.config.chainId;
  return (
    <section
      className="wallet-card wallet-card--connected"
      aria-labelledby="connected-wallet-heading"
    >
      <div className="wallet-card-top">
        <IconTile tone={connected ? "green" : "blue"}>
          <PersonIcon />
        </IconTile>
        <div>
          <h2 id="connected-wallet-heading">External wallet</h2>
        </div>
        <span className={`connection-pill ${connected && correctChain ? "is-connected" : ""}`}>
          {connected ? (correctChain ? "Connected" : "Wrong network") : "Not connected"}
        </span>
      </div>
      <p className="wallet-explainer">
        Use the same browser wallet for Aqua swaps on Sepolia. Connecting never shares your keys or
        moves funds.
      </p>
      {state.account && (
        <>
          <button
            type="button"
            className="address-box"
            aria-label="Copy external wallet address"
            onClick={() => {
              void navigator.clipboard.writeText(state.account!).then(
                () => setCopyMessage("Wallet address copied."),
                () => setCopyMessage("Could not copy the address. Select it manually."),
              );
            }}
          >
            <span>{state.account}</span>
            <CopyIcon />
          </button>
          {copyMessage && (
            <p className="wallet-explainer" role="status" aria-label="Wallet address copy">
              {copyMessage}
            </p>
          )}
          <dl className="live-facts">
            <div>
              <dt>Network</dt>
              <dd>
                {correctChain
                  ? "Sepolia (11155111)"
                  : `Switch to Sepolia · current chain ${state.chainId}`}
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
              </>
            )}
          </dl>
        </>
      )}
      <div className="wallet-actions-grid">
        {!connected && (
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy}
            onClick={() => void session.connect()}
            data-testid="connect-aqua-wallet"
          >
            <GlobeIcon />
            Connect wallet
          </button>
        )}
        {connected && !correctChain && (
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy}
            onClick={() => void session.switchNetwork()}
          >
            Switch to Sepolia
          </button>
        )}
        {connected && correctChain && (
          <button
            type="button"
            className="button button--secondary"
            disabled={state.busy}
            onClick={() => void session.refresh()}
          >
            Refresh wallet
          </button>
        )}
        {connected && (
          <button
            type="button"
            className="text-button text-button--danger"
            disabled={state.busy}
            onClick={() => session.disconnect()}
          >
            Disconnect wallet
          </button>
        )}
      </div>
      <p className="wallet-explainer" role="status" aria-label="Wallet connection">
        {state.message}
      </p>
    </section>
  );
}
