import {
  CardStackIcon,
  CopyIcon,
  GlobeIcon,
  InfoCircledIcon,
  PaperPlaneIcon,
  PersonIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import type { ConnectedWalletState } from "../types";
import { demoWallets, withdrawalAssets, formatWithdrawalAmount } from "../demo/fixtures";
import { IconTile } from "../components/IconTile";

export function WalletsScreen({
  connectedWallet,
  onConnect,
  onDisconnect,
  onTopUp,
  onWithdraw,
  onCopy,
}: {
  connectedWallet: ConnectedWalletState;
  onConnect: () => void;
  onDisconnect: () => void;
  onTopUp: () => void;
  onWithdraw: () => void;
  onCopy: (label: string) => void;
}) {
  const isConnected = connectedWallet === "connected";

  return (
    <main className="screen-content wallets-screen" aria-labelledby="wallets-heading">
      <div className="screen-heading">
        <h1 id="wallets-heading">Wallets</h1>
      </div>
      <p className="intro-copy">
        Your agent wallet uses USDT to buy XAUH on Ethereum. Connecting an external wallet is
        optional and it always stays under your control.
      </p>

      <section className="wallet-card wallet-card--agent" aria-labelledby="agent-wallet-heading">
        <div className="wallet-card-top">
          <IconTile>
            <CardStackIcon />
          </IconTile>
          <div>
            <h2 id="agent-wallet-heading">Agent wallet</h2>
          </div>
          <span className="network-badge network-badge--ethereum">Ethereum</span>
        </div>
        <div className="asset-balances" aria-label="Agent wallet balances">
          <div>
            <span>Available to buy</span>
            <strong>
              {formatWithdrawalAmount(withdrawalAssets.USDT.balance, "USDT")} <small>USDT</small>
            </strong>
          </div>
          <div>
            <span>Gold holdings</span>
            <strong>
              {formatWithdrawalAmount(withdrawalAssets.XAUH.balance, "XAUH")} <small>XAUH</small>
            </strong>
          </div>
          <div>
            <span>Fee reserve</span>
            <strong>
              {formatWithdrawalAmount(withdrawalAssets.ETH.balance, "ETH")} <small>ETH</small>
            </strong>
          </div>
        </div>
        <button
          type="button"
          className="address-box"
          onClick={() => onCopy("Agent wallet address")}
          aria-label="Copy Ethereum agent wallet address"
        >
          <span>{demoWallets.agent}</span>
          <CopyIcon />
        </button>
        <div className="wallet-actions-grid">
          <button
            type="button"
            className="button button--primary"
            onClick={onTopUp}
            data-testid="top-up-wallet"
          >
            <RocketIcon /> Top up
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={onWithdraw}
            data-testid="withdraw-wallet"
          >
            <PaperPlaneIcon /> Withdraw
          </button>
        </div>
      </section>

      <section
        className="wallet-card wallet-card--connected"
        aria-labelledby="connected-wallet-heading"
      >
        <div className="wallet-card-top">
          <IconTile tone={isConnected ? "green" : "blue"}>
            <PersonIcon />
          </IconTile>
          <div>
            <h2 id="connected-wallet-heading">External wallet</h2>
          </div>
          <span className={`connection-pill ${isConnected ? "is-connected" : ""}`}>
            {isConnected ? "Verified" : "Not connected"}
          </span>
        </div>
        {isConnected ? (
          <>
            <p className="connected-wallet-name">Demo wallet</p>
            <button
              type="button"
              className="address-box"
              onClick={() => onCopy("External wallet address")}
              aria-label="Copy external wallet address"
            >
              <span>{demoWallets.external}</span>
              <CopyIcon />
            </button>
            <p className="wallet-explainer">
              Use this verified wallet to approve top-ups and receive withdrawals.
            </p>
            <button
              type="button"
              className="text-button text-button--danger"
              onClick={onDisconnect}
            >
              Disconnect wallet
            </button>
          </>
        ) : (
          <>
            <p className="wallet-explainer">
              Connect an Ethereum wallet to top up directly and set your withdrawal destination.
              Connecting never shares your keys or moves funds by itself.
            </p>
            <button
              type="button"
              className="button button--secondary"
              onClick={onConnect}
              data-testid="connect-wallet"
            >
              <GlobeIcon /> Connect Ethereum wallet
            </button>
          </>
        )}
      </section>

      <aside className="risk-note">
        <InfoCircledIcon />
        <p>
          Purchases use USDT on Ethereum. Payment fees count toward your limits. Withdrawals are
          manual, and their network fees are paid from the agent wallet in ETH.
        </p>
      </aside>
    </main>
  );
}
