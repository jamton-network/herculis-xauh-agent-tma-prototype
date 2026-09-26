import {
  CardStackIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  FileTextIcon,
  InfoCircledIcon,
  LockClosedIcon,
  PauseIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import type { TabId, AgentMode, ActivityItem } from "../types";
import { activityItems, withdrawalAssets, formatWithdrawalAmount } from "../demo/fixtures";
import { IconTile } from "../components/IconTile";

export function HomeScreen({
  agentMode,
  onOpenAgentState,
  onOpenStrategy,
  onChangeTab,
  onOpenActivity,
  onTopUp,
}: {
  agentMode: AgentMode;
  onOpenAgentState: () => void;
  onOpenStrategy: () => void;
  onChangeTab: (tab: TabId) => void;
  onOpenActivity: (item: ActivityItem) => void;
  onTopUp: () => void;
}) {
  const isPaused = agentMode === "paused";
  const isInsufficient = agentMode === "insufficient";
  const headline = isPaused
    ? "Autonomous buying is paused"
    : isInsufficient
      ? "Funding is below reserve"
      : "No purchase yet today";
  const body = isPaused
    ? "Your limits remain saved. Resume when you want the agent to monitor again."
    : isInsufficient
      ? "Add USDT on Ethereum or lower your reserve before purchases can continue."
      : "The current quote exceeds your 0.8% price-markup limit. I’ll continue monitoring.";

  return (
    <main className="screen-content home-screen" aria-labelledby="home-heading">
      <section className="agent-state-row">
        <button
          type="button"
          className="status-link"
          onClick={onOpenAgentState}
          data-testid="agent-status-trigger"
        >
          <span
            className={`live-dot ${isPaused || isInsufficient ? "is-warning" : ""}`}
            aria-hidden="true"
          />
          <span>
            {isPaused
              ? "Agent is paused"
              : isInsufficient
                ? "Funding action needed"
                : "Agent is monitoring"}
          </span>
          <ChevronRightIcon />
        </button>
      </section>

      <section className="decision-hero" aria-label="Latest agent decision">
        {isPaused || isInsufficient ? (
          <IconTile tone="red" size="large">
            {isPaused ? <PauseIcon /> : <InfoCircledIcon />}
          </IconTile>
        ) : (
          <img src="/assets/hercules-line-hero.png" alt="" className="hero-art" draggable={false} />
        )}
        <div>
          <h1 id="home-heading">{headline}</h1>
          <p>{body}</p>
        </div>
      </section>

      <section className="holdings-section" aria-labelledby="holdings-heading">
        <p id="holdings-heading" className="section-kicker">
          XAUH holdings
        </p>
        <p className="holding-value">
          12.3456 <span>XAUH</span>
        </p>
        <p className="holding-fiat">≈ $1,604.93 · $130/XAUH</p>
      </section>

      <section className="wallet-summary" aria-label="Wallet summary">
        <button type="button" className="summary-row" onClick={() => onChangeTab("wallets")}>
          <IconTile>
            <CardStackIcon />
          </IconTile>
          <span className="summary-copy">
            <span className="summary-label">Ethereum agent wallet</span>
            <span className="summary-value">
              825.40 <small>USDT</small>
            </span>
          </span>
          <ChevronRightIcon className="row-chevron" />
        </button>
        <button type="button" className="summary-row" onClick={() => onChangeTab("wallets")}>
          <IconTile tone="green">
            <LockClosedIcon />
          </IconTile>
          <span className="summary-copy">
            <span className="summary-label">ETH fee reserve</span>
            <span className="summary-value">
              {formatWithdrawalAmount(withdrawalAssets.ETH.balance, "ETH")}{" "}
              <small>ETH · Ready</small>
            </span>
          </span>
          <ChevronRightIcon className="row-chevron" />
        </button>
      </section>

      <section className="home-actions" aria-label="Quick actions">
        <button
          type="button"
          className="button button--primary"
          onClick={onTopUp}
          data-testid="top-up-home"
        >
          <RocketIcon />
          Top up agent wallet
        </button>
        <button
          type="button"
          className="button button--secondary"
          onClick={onOpenStrategy}
          data-testid="review-strategy"
        >
          <FileTextIcon />
          Trading strategy
        </button>
      </section>

      <section className="latest-activity" aria-labelledby="latest-activity-heading">
        <div className="section-heading-row">
          <h2 id="latest-activity-heading">Latest activity</h2>
          <button type="button" className="text-button" onClick={() => onChangeTab("activity")}>
            View all
          </button>
        </div>
        <button
          type="button"
          className="activity-row"
          onClick={() => onOpenActivity(activityItems[2])}
        >
          <IconTile tone="green">
            <CheckCircledIcon />
          </IconTile>
          <span className="activity-copy">
            <strong>USDT top-up credited</strong>
            <span>External wallet transfer confirmed on Ethereum</span>
          </span>
          <time>08:24</time>
          <ChevronRightIcon className="row-chevron" />
        </button>
      </section>
    </main>
  );
}
