import {
  CardStackIcon,
  CopyIcon,
  InfoCircledIcon,
  PaperPlaneIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { demoWallets, withdrawalAssets, formatWithdrawalAmount } from "../demo/fixtures";
import { ExternalWalletCard } from "../components/ExternalWalletCard";
import { IconTile } from "../components/IconTile";

export function WalletsScreen({
  onTopUp,
  onWithdraw,
  onCopy,
}: {
  onTopUp: () => void;
  onWithdraw: () => void;
  onCopy: (label: string) => void;
}) {
  return (
    <main className="screen-content wallets-screen" aria-labelledby="wallets-heading">
      <div className="screen-heading">
        <h1 id="wallets-heading">Wallets</h1>
      </div>
      <p className="intro-copy">
        The agent wallet and its transfers are simulated. Your external wallet connects separately
        to Aqua on Sepolia and stays under your control.
      </p>

      <section className="wallet-card wallet-card--agent" aria-labelledby="agent-wallet-heading">
        <div className="wallet-card-top">
          <IconTile>
            <CardStackIcon />
          </IconTile>
          <div>
            <h2 id="agent-wallet-heading">Agent wallet</h2>
          </div>
          <span className="network-badge network-badge--ethereum">Ethereum · Demo</span>
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

      <ExternalWalletCard />

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
