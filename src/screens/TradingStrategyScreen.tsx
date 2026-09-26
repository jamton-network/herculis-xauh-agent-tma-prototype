import { useState } from "react";
import {
  CheckCircledIcon,
  ChevronLeftIcon,
  InfoCircledIcon,
  PauseIcon,
  ResumeIcon,
} from "@radix-ui/react-icons";
import type { AgentMode, StrategyId, StrategyDraft, SharedStrategyLimits } from "../types";
import { strategyTemplates, initialStrategyDrafts } from "../demo/fixtures";
import { IconTile } from "../components/IconTile";

export function TradingStrategyScreen({
  agentMode,
  onBack,
  onSave,
  onPause,
  onRemove,
}: {
  agentMode: AgentMode;
  onBack: () => void;
  onSave: () => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>("target-price");
  const [drafts, setDrafts] = useState<Record<StrategyId, StrategyDraft>>(initialStrategyDrafts);
  const [limits, setLimits] = useState<SharedStrategyLimits>({
    purchase: "250",
    daily: "500",
    monthly: "2000",
    reserve: "200",
    markup: "0.8",
  });
  const sharedFields = [
    ["purchase", "Maximum per purchase", "USDT"],
    ["daily", "Daily budget", "USDT"],
    ["monthly", "Monthly budget", "USDT"],
    ["reserve", "Minimum balance", "USDT"],
    ["markup", "Maximum price markup", "%"],
  ] as const;
  const selectedDraft = drafts[selectedStrategy];
  const updateDraft = (key: keyof StrategyDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [selectedStrategy]: { ...current[selectedStrategy], [key]: value },
    }));
  };

  const strategySettings = (() => {
    if (selectedStrategy === "target-price") {
      return (
        <>
          <StrategyField
            label="Purchase amount"
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Buy at or below"
            value={selectedDraft.targetPrice}
            unit="USD/XAUH"
            onChange={(value) => updateDraft("targetPrice", value)}
          />
          <StrategySummary label="Minimum interval" value="24 hours" />
        </>
      );
    }
    if (selectedStrategy === "weekly-dca") {
      return (
        <>
          <StrategyField
            label="Purchase amount"
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Day"
            value={selectedDraft.day}
            onChange={(value) => updateDraft("day", value)}
            inputMode="text"
          />
          <StrategyField
            label="Local time"
            value={selectedDraft.time}
            onChange={(value) => updateDraft("time", value)}
            inputMode="text"
          />
          <StrategySummary label="Frequency" value="Once per weekly window" />
        </>
      );
    }
    if (selectedStrategy === "reserve-buy") {
      return (
        <>
          <StrategyField
            label="Purchase amount"
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Keep at least"
            value={selectedDraft.reserve}
            unit="USDT"
            onChange={(value) => updateDraft("reserve", value)}
          />
          <StrategySummary label="Minimum interval" value="24 hours" />
        </>
      );
    }
    return (
      <>
        <StrategyField
          label="Purchase amount"
          value={selectedDraft.amount}
          unit="USDT"
          onChange={(value) => updateDraft("amount", value)}
        />
        <StrategyField
          label="Drop from recent high"
          value={selectedDraft.dipPercent}
          unit="%"
          onChange={(value) => updateDraft("dipPercent", value)}
        />
        <StrategyField
          label="Recent-high window"
          value={selectedDraft.lookbackDays}
          unit="days"
          onChange={(value) => updateDraft("lookbackDays", value)}
        />
        <StrategySummary label="Maximum frequency" value="Once every 7 days" />
      </>
    );
  })();

  return (
    <main className="screen-content strategy-screen" aria-labelledby="strategy-heading">
      <div className="subscreen-header">
        <button type="button" className="back-button" aria-label="Back" onClick={onBack}>
          <ChevronLeftIcon />
          <span>Back</span>
        </button>
        <h1 id="strategy-heading">Trading strategy</h1>
      </div>
      <section className={`mode-card ${agentMode === "paused" ? "is-paused" : ""}`}>
        <IconTile tone={agentMode === "paused" ? "red" : "green"} size="large">
          {agentMode === "paused" ? <PauseIcon /> : <CheckCircledIcon />}
        </IconTile>
        <div>
          <h2>{agentMode === "paused" ? "Strategy is paused" : "Strategy is active"}</h2>
          <p>
            The agent follows the selected strategy, while every purchase must pass your balance,
            budget, timing, and price limits. The amount and payment fee both count toward the caps.
          </p>
        </div>
      </section>
      <section className="strategy-section" aria-labelledby="strategy-options-heading">
        <div className="strategy-section-heading">
          <h2 id="strategy-options-heading">Choose one strategy</h2>
          <span>One active</span>
        </div>
        <div className="strategy-options" role="radiogroup" aria-label="Trading strategy">
          {strategyTemplates.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedStrategy === template.id;
            return (
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={isSelected ? "is-selected" : ""}
                key={template.id}
                onClick={() => setSelectedStrategy(template.id)}
                data-testid={`strategy-${template.id}`}
              >
                <IconTile tone={isSelected ? "gold" : "blue"}>
                  <Icon />
                </IconTile>
                <span>
                  <strong>{template.title}</strong>
                  <small>{template.description}</small>
                </span>
                {isSelected ? <em>Selected</em> : null}
              </button>
            );
          })}
        </div>
      </section>
      <section className="strategy-section" aria-labelledby="strategy-settings-heading">
        <h2 id="strategy-settings-heading">Strategy settings</h2>
        <div className="strategy-fields">{strategySettings}</div>
      </section>
      <section className="strategy-section" aria-labelledby="shared-limits-heading">
        <h2 id="shared-limits-heading">Purchase limits</h2>
        <p className="section-help">
          These limits apply to every strategy. Purchase amount plus payment fee consumes each
          applicable limit.
        </p>
        <div className="strategy-fields">
          {sharedFields.map(([key, label, unit]) => (
            <label className="strategy-field" key={key}>
              <span>{label}</span>
              <span className="strategy-input-wrap">
                <input
                  inputMode="decimal"
                  aria-label={label}
                  value={limits[key]}
                  onChange={(event) => setLimits({ ...limits, [key]: event.target.value })}
                />
                <small>{unit}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <aside className="risk-note">
        <InfoCircledIcon />
        <p>
          This is not a promise of returns or a perfect entry price. XAUH carries issuer, liquidity,
          delivery, smart-contract, and irreversible-payment risks. Withdrawals are manual and are
          never authorized by a trading strategy.
        </p>
      </aside>
      <div className="strategy-actions">
        <button type="button" className="button button--primary" onClick={onSave}>
          <CheckCircledIcon /> Save strategy
        </button>
        <button type="button" className="button button--danger" onClick={onPause}>
          {agentMode === "paused" ? <ResumeIcon /> : <PauseIcon />}
          {agentMode === "paused" ? "Resume strategy" : "Pause strategy"}
        </button>
        <button type="button" className="text-button text-button--danger" onClick={onRemove}>
          Remove strategy
        </button>
      </div>
    </main>
  );
}

function StrategyField({
  label,
  value,
  unit,
  onChange,
  inputMode = "decimal",
}: {
  label: string;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "text";
}) {
  return (
    <label className="strategy-field">
      <span>{label}</span>
      <span className="strategy-input-wrap">
        <input
          inputMode={inputMode}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <small>{unit}</small> : null}
      </span>
    </label>
  );
}

function StrategySummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="strategy-summary">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
