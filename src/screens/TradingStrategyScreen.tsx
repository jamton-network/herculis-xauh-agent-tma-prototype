import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon } from "@radix-ui/react-icons";
import { strategyTemplates } from "../demo/fixtures";
import { chooseDemoStrategy } from "../demo/strategyRandom";
import { IconTile } from "../components/IconTile";
import { AquaAttribution } from "../components/AquaAttribution";
import { QuantisStrategyChooser } from "../components/QuantisStrategyChooser";
import type { SwapDirection } from "../live/swapConfig";

const AquaSwapPanel = lazy(() => import("../components/AquaSwapPanel"));
const instantStrategies = [
  {
    id: "instant-buy",
    title: "Instant buy",
    description: "Buy XAUH with USDT through Aqua.",
    icon: ArrowDownIcon,
  },
  {
    id: "instant-sell",
    title: "Instant sell",
    description: "Sell XAUH for USDT through Aqua.",
    icon: ArrowUpIcon,
  },
] as const;

export function TradingStrategyScreen({
  onBack,
  onOpenLiquidity,
}: {
  onBack: () => void;
  onOpenLiquidity: () => void;
}) {
  const [direction, setDirection] = useState<SwapDirection>("instant-buy");
  const [randomResult, setRandomResult] = useState("");
  const [drawNumber, setDrawNumber] = useState(0);
  const chooseRandomly = () => {
    try {
      const next = chooseDemoStrategy();
      const title = instantStrategies.find((item) => item.id === next)!.title;
      setDrawNumber((number) => number + 1);
      setRandomResult(
        `Draw ${drawNumber + 1}: ${title}.${next === direction ? " Selected again." : ""}`,
      );
      setDirection(next);
    } catch {
      setRandomResult("Random choice is unavailable. Choose a strategy manually.");
    }
  };
  return (
    <main className="screen-content strategy-screen" aria-labelledby="strategy-heading">
      <div className="subscreen-header">
        <button type="button" className="back-button" aria-label="Back" onClick={onBack}>
          <ChevronLeftIcon />
          <span>Back</span>
        </button>
        <div className="strategy-title">
          <h1 id="strategy-heading">Trading strategy</h1>
          <AquaAttribution />
        </div>
      </div>
      <p className="swap-network-note">
        <span className="swap-network-dot" />
        Sepolia testnet · XAUH / USDT
      </p>
      <section className="strategy-section" aria-labelledby="strategy-options-heading">
        <div className="strategy-section-heading">
          <h2 id="strategy-options-heading">Choose one strategy</h2>
          <span>One selected</span>
        </div>
        <QuantisStrategyChooser result={randomResult} onChoose={chooseRandomly} />
        <div className="strategy-options" role="radiogroup" aria-label="Trading strategy">
          {instantStrategies.map((template) => {
            const Icon = template.icon,
              selected = direction === template.id;
            return (
              <label key={template.id} className={selected ? "is-selected" : ""}>
                <input
                  type="radio"
                  name="trading-strategy"
                  className="strategy-radio"
                  checked={selected}
                  aria-label={template.title}
                  aria-describedby={`strategy-description-${template.id}`}
                  onChange={() => {
                    setDirection(template.id);
                    setRandomResult("");
                  }}
                  data-testid={`strategy-${template.id}`}
                />
                <IconTile tone={selected ? "gold" : "blue"}>
                  <Icon />
                </IconTile>
                <span className="strategy-option-copy">
                  <strong>{template.title}</strong>
                  <small id={`strategy-description-${template.id}`}>{template.description}</small>
                </span>
                {selected && <em>Selected</em>}
              </label>
            );
          })}
          {strategyTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <label key={template.id} className="strategy-option--soon">
                <input
                  type="radio"
                  name="trading-strategy"
                  className="strategy-radio"
                  checked={false}
                  disabled
                  aria-label={template.title}
                  aria-describedby={`strategy-description-${template.id}`}
                  readOnly
                  data-testid={`strategy-${template.id}`}
                />
                <IconTile tone="blue">
                  <Icon />
                </IconTile>
                <span className="strategy-option-copy">
                  <strong>{template.title}</strong>
                  <small id={`strategy-description-${template.id}`}>{template.description}</small>
                </span>
                <em>Soon</em>
              </label>
            );
          })}
        </div>
      </section>
      <SwapBoundary>
        <Suspense
          fallback={
            <p className="live-message" role="status">
              Loading Aqua swap…
            </p>
          }
        >
          <AquaSwapPanel direction={direction} onOpenLiquidity={onOpenLiquidity} />
        </Suspense>
      </SwapBoundary>
    </main>
  );
}

class SwapBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="live-message" role="alert">
        <h2>Aqua swap couldn’t load</h2>
        <p>Reload to try again. Submitted transaction recovery data stays in this browser.</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </section>
    );
  }
}
