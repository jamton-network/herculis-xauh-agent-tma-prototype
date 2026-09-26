import { useState } from "react";
import {
  CheckCircledIcon,
  ChevronLeftIcon,
  InfoCircledIcon,
  PauseIcon,
  ResumeIcon,
} from "@radix-ui/react-icons";
import type {
  AgentMode,
  StrategyDraft,
  StrategyConfiguration,
  StrategyEditorDraft,
} from "../types";
import { strategyTemplates } from "../demo/fixtures";
import { chooseDemoStrategy } from "../demo/strategyRandom";
import { IconTile } from "../components/IconTile";
import { AquaAttribution } from "../components/AquaAttribution";
import { QuantisStrategyChooser } from "../components/QuantisStrategyChooser";
import { AquaExecution } from "../components/AquaExecution";
import { compareExecution } from "../demo/execution";

export function TradingStrategyScreen({
  agentMode,
  savedConfiguration,
  onBack,
  onSave,
  onPause,
  onRemove,
}: {
  agentMode: AgentMode;
  savedConfiguration: StrategyConfiguration;
  onBack: () => void;
  onSave: (configuration: StrategyEditorDraft) => void;
  onPause: () => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState<StrategyEditorDraft>(() => ({
    ...structuredClone(savedConfiguration),
    selectedStrategy: savedConfiguration.selectedStrategy ?? "target-price",
  }));
  const [randomResult, setRandomResult] = useState("");
  const [drawNumber, setDrawNumber] = useState(0);
  const { selectedStrategy, drafts, limits } = draft;
  const comparison = compareExecution(draft);
  const savedTemplate = strategyTemplates.find(
    (template) => template.id === savedConfiguration.selectedStrategy,
  );
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(savedConfiguration);
  const isMonitoring = Boolean(savedTemplate) && agentMode === "monitoring";
  const sharedFields = [
    ["purchase", "Maximum per purchase", "USDT"],
    ["daily", "Daily budget", "USDT"],
    ["monthly", "Monthly budget", "USDT"],
    ["reserve", "Minimum balance", "USDT"],
    ["markup", "Maximum price markup", "%"],
  ] as const;
  const selectedDraft = drafts[selectedStrategy];
  const updateDraft = (key: keyof StrategyDraft, value: string) => {
    setDraft((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [selectedStrategy]: { ...current.drafts[selectedStrategy], [key]: value },
      },
    }));
  };
  const chooseRandomly = () => {
    try {
      const nextStrategy = chooseDemoStrategy();
      const title = strategyTemplates.find((template) => template.id === nextStrategy)!.title;
      const nextDrawNumber = drawNumber + 1;
      setDraft((current) => ({ ...current, selectedStrategy: nextStrategy }));
      setDrawNumber(nextDrawNumber);
      setRandomResult(
        `Draw ${nextDrawNumber}: ${title}.${nextStrategy === selectedStrategy ? " Selected again." : ""}`,
      );
    } catch {
      setRandomResult("Random choice is unavailable. Choose a strategy manually.");
    }
  };

  const strategySettings = (() => {
    if (selectedStrategy === "target-price") {
      return (
        <>
          <StrategyField
            label="Purchase amount"
            invalid={comparison.invalidFields.includes("Purchase amount")}
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Buy at or below"
            invalid={comparison.invalidFields.includes("Buy at or below")}
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
            invalid={comparison.invalidFields.includes("Purchase amount")}
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Day"
            invalid={comparison.invalidFields.includes("Day")}
            value={selectedDraft.day}
            onChange={(value) => updateDraft("day", value)}
            inputMode="text"
          />
          <StrategyField
            label="Local time"
            invalid={comparison.invalidFields.includes("Local time")}
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
            invalid={comparison.invalidFields.includes("Purchase amount")}
            value={selectedDraft.amount}
            unit="USDT"
            onChange={(value) => updateDraft("amount", value)}
          />
          <StrategyField
            label="Keep at least"
            invalid={comparison.invalidFields.includes("Keep at least")}
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
          invalid={comparison.invalidFields.includes("Purchase amount")}
          value={selectedDraft.amount}
          unit="USDT"
          onChange={(value) => updateDraft("amount", value)}
        />
        <StrategyField
          label="Drop from recent high"
          invalid={comparison.invalidFields.includes("Drop from recent high")}
          value={selectedDraft.dipPercent}
          unit="%"
          onChange={(value) => updateDraft("dipPercent", value)}
        />
        <StrategyField
          label="Recent-high window"
          invalid={comparison.invalidFields.includes("Recent-high window")}
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
        <div className="strategy-title">
          <h1 id="strategy-heading">Trading strategy</h1>
          <AquaAttribution />
        </div>
      </div>
      <section className="mode-card" aria-label="Saved strategy status">
        <IconTile tone={isMonitoring ? "green" : "red"} size="large">
          {isMonitoring ? <CheckCircledIcon /> : <PauseIcon />}
        </IconTile>
        <div>
          <h2>
            {!savedTemplate
              ? "No strategy saved"
              : agentMode === "paused"
                ? "Strategy is paused"
                : agentMode === "insufficient"
                  ? "Funding action needed"
                  : "Strategy is active"}
          </h2>
          {savedTemplate ? (
            <p className="saved-strategy-name">Saved: {savedTemplate.title}</p>
          ) : null}
          <p>
            {savedTemplate
              ? "Only saved settings apply to the agent. Every purchase must pass your balance, budget, timing, and price limits, including the payment fee."
              : "Choose a strategy and save your settings, then resume when you are ready. Your saved parameters and purchase limits remain available."}
          </p>
        </div>
      </section>
      <section className="strategy-section" aria-labelledby="strategy-options-heading">
        <div className="strategy-section-heading">
          <h2 id="strategy-options-heading">Choose one strategy</h2>
          <span>One selected</span>
        </div>
        <QuantisStrategyChooser result={randomResult} onChoose={chooseRandomly} />
        <div className="strategy-options" role="radiogroup" aria-label="Trading strategy">
          {strategyTemplates.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedStrategy === template.id;
            return (
              <label className={isSelected ? "is-selected" : ""} key={template.id}>
                <input
                  type="radio"
                  name="trading-strategy"
                  className="strategy-radio"
                  checked={isSelected}
                  aria-label={template.title}
                  aria-describedby={`strategy-description-${template.id}`}
                  onClick={() => setRandomResult("")}
                  onChange={() => {
                    setDraft((current) => ({ ...current, selectedStrategy: template.id }));
                    setRandomResult("");
                  }}
                  data-testid={`strategy-${template.id}`}
                />
                <IconTile tone={isSelected ? "gold" : "blue"}>
                  <Icon />
                </IconTile>
                <span className="strategy-option-copy">
                  <strong>{template.title}</strong>
                  <small id={`strategy-description-${template.id}`}>{template.description}</small>
                  {isSelected ? (
                    <small className="strategy-execution">
                      Aqua execution · {comparison.recommendation?.offer.name ?? "Review settings"}
                    </small>
                  ) : null}
                </span>
                {isSelected ? <em>Selected</em> : null}
              </label>
            );
          })}
        </div>
      </section>
      <section className="strategy-section" aria-labelledby="strategy-settings-heading">
        <h2 id="strategy-settings-heading">Strategy settings</h2>
        <div className="strategy-fields">{strategySettings}</div>
        <AquaExecution comparison={comparison} />
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
                  aria-invalid={comparison.invalidFields.includes(label) || undefined}
                  aria-describedby={
                    comparison.invalidFields.includes(label) ? "execution-input-errors" : undefined
                  }
                  value={limits[key]}
                  onChange={(event) =>
                    setDraft({ ...draft, limits: { ...limits, [key]: event.target.value } })
                  }
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
        <p className="strategy-save-state" role="status" aria-label="Strategy changes">
          {hasChanges ? "Unsaved changes" : "All changes saved"}
        </p>
        <p className="section-help">
          Changes apply only after Save. Leaving discards unsaved changes.
          {savedTemplate ? " Pause, Resume and Remove apply to the saved strategy." : ""}
        </p>
        <button type="button" className="button button--primary" onClick={() => onSave(draft)}>
          <CheckCircledIcon /> Save strategy
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={onPause}
          disabled={!savedTemplate}
        >
          {agentMode === "paused" ? <ResumeIcon /> : <PauseIcon />}
          {agentMode === "paused" ? "Resume strategy" : "Pause strategy"}
        </button>
        <button
          type="button"
          className="text-button text-button--danger"
          onClick={onRemove}
          disabled={!savedTemplate}
        >
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
  invalid = false,
}: {
  label: string;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
  inputMode?: "decimal" | "text";
  invalid?: boolean;
}) {
  return (
    <label className="strategy-field">
      <span>{label}</span>
      <span className="strategy-input-wrap">
        <input
          inputMode={inputMode}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "execution-input-errors" : undefined}
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
