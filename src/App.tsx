import { useViewport, useSystemTheme } from "./hooks/browser";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  ActivityLogIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  GearIcon,
  GlobeIcon,
  InfoCircledIcon,
  MoonIcon,
  PaperPlaneIcon,
  PauseIcon,
  ReloadIcon,
  RocketIcon,
  SunIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import type {
  TabId,
  Theme,
  AgentMode,
  ActivityFilter,
  ActivityDataState,
  ConnectedWalletState,
  WalletFlow,
  TopUpStage,
  WithdrawalAsset,
  WithdrawalAmountMode,
  WithdrawalStage,
  ActivityItem,
  StrategyConfiguration,
} from "./types";
import {
  withdrawalAssets,
  formatWithdrawalAmount,
  demoWallets,
  initialStrategyConfiguration,
  strategyTemplates,
} from "./demo/fixtures";
import { IconTile } from "./components/IconTile";
import { BrandHeader } from "./components/BrandHeader";
import { BottomNav } from "./components/BottomNav";
import { BottomSheet } from "./components/BottomSheet";
import { HomeScreen } from "./screens/HomeScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { WalletsScreen } from "./screens/WalletsScreen";
import { ActivityScreen } from "./screens/ActivityScreen";
import { TradingStrategyScreen } from "./screens/TradingStrategyScreen";
import { Onboarding } from "./screens/Onboarding";
import { ActivityDetail } from "./screens/ActivityDetail";

export default function App() {
  useViewport();
  const systemTheme = useSystemTheme();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return requestedTab === "chat" || requestedTab === "wallets" || requestedTab === "activity"
      ? requestedTab
      : "home";
  });
  const [theme, setTheme] = useState<Theme>(() => {
    const requestedTheme = new URLSearchParams(window.location.search).get("theme");
    return requestedTheme === "light" || requestedTheme === "dark" ? requestedTheme : "system";
  });
  const [agentMode, setAgentMode] = useState<AgentMode>("monitoring");
  const [strategyConfiguration, setStrategyConfiguration] = useState<StrategyConfiguration>(() =>
    structuredClone(initialStrategyConfiguration),
  );
  const restoreStrategyFocus = useRef(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activityDataState, setActivityDataState] = useState<ActivityDataState>("ready");
  const [connectedWallet, setConnectedWallet] = useState<ConnectedWalletState>("disconnected");
  const [walletFlow, setWalletFlow] = useState<WalletFlow>(null);
  const [topUpStage, setTopUpStage] = useState<TopUpStage>("amount");
  const [topUpAsset, setTopUpAsset] = useState<"USDT" | "ETH">("USDT");
  const [topUpAmount, setTopUpAmount] = useState("500");
  const [withdrawalStage, setWithdrawalStage] = useState<WithdrawalStage>("amount");
  const [withdrawalAsset, setWithdrawalAsset] = useState<WithdrawalAsset>("XAUH");
  const [withdrawalAmountMode, setWithdrawalAmountMode] = useState<WithdrawalAmountMode>("fixed");
  const [withdrawalAmount, setWithdrawalAmount] = useState("2.5");
  const [showOnboarding, setShowOnboarding] = useState(
    () => window.location.hash === "#onboarding",
  );
  const [showStrategy, setShowStrategy] = useState(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    return requestedView === "strategy";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentStateOpen, setAgentStateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"remove-strategy" | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);
  const [toast, setToast] = useState("");
  const savedStrategyTitle = strategyTemplates.find(
    (template) => template.id === strategyConfiguration.selectedStrategy,
  )?.title;

  useEffect(() => {
    if (showStrategy || showOnboarding || !restoreStrategyFocus.current) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>("[data-strategy-entry]")?.focus();
      restoreStrategyFocus.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showStrategy, showOnboarding]);

  const closeStrategy = () => {
    restoreStrategyFocus.current = true;
    setShowStrategy(false);
  };

  const effectiveTheme = useMemo(() => {
    if (theme !== "system") return theme;
    return systemTheme;
  }, [theme, systemTheme]);

  const withdrawalConfig = withdrawalAssets[withdrawalAsset];
  const withdrawalNumericAmount = Number(withdrawalAmount);
  const maximumFixedWithdrawal =
    withdrawalAsset === "ETH"
      ? Number(formatWithdrawalAmount(withdrawalConfig.balance - withdrawalConfig.feeLimit, "ETH"))
      : withdrawalConfig.balance;
  const withdrawalAmountInvalid =
    !Number.isFinite(withdrawalNumericAmount) ||
    withdrawalNumericAmount <= 0 ||
    (withdrawalAmountMode === "fixed" && withdrawalNumericAmount > maximumFixedWithdrawal);
  const isMaxEthWithdrawal = withdrawalAmountMode === "max" && withdrawalAsset === "ETH";
  const withdrawalReceivedAmount = isMaxEthWithdrawal
    ? Math.max(0, withdrawalConfig.balance - withdrawalConfig.estimatedFee)
    : withdrawalNumericAmount;
  const withdrawalSendLabel = isMaxEthWithdrawal
    ? "Entire ETH balance"
    : `${withdrawalAmount} ${withdrawalAsset}`;
  const withdrawalCompletionLabel = `${isMaxEthWithdrawal ? formatWithdrawalAmount(withdrawalReceivedAmount, "ETH") : withdrawalAmount} ${withdrawalAsset}`;
  const withdrawalReceiveLabel = `${isMaxEthWithdrawal ? "≈ " : ""}${withdrawalCompletionLabel}`;
  const withdrawalFeeLabel = `≈ ${formatWithdrawalAmount(withdrawalConfig.estimatedFee, "ETH")} ETH`;
  const withdrawalBalanceAfter = (() => {
    if (withdrawalAsset === "ETH") {
      const remaining = Math.max(
        0,
        withdrawalConfig.balance - withdrawalReceivedAmount - withdrawalConfig.estimatedFee,
      );
      return `≈ ${formatWithdrawalAmount(remaining, "ETH")} ETH`;
    }

    const remainingAsset = Math.max(0, withdrawalConfig.balance - withdrawalNumericAmount);
    const remainingEth = Math.max(0, withdrawalAssets.ETH.balance - withdrawalConfig.estimatedFee);
    return `${formatWithdrawalAmount(remainingAsset, withdrawalAsset)} ${withdrawalAsset} · ≈ ${formatWithdrawalAmount(remainingEth, "ETH")} ETH`;
  })();

  const selectWithdrawalAsset = (asset: WithdrawalAsset) => {
    setWithdrawalAsset(asset);
    setWithdrawalAmountMode("fixed");
    setWithdrawalAmount(withdrawalAssets[asset].defaultAmount);
  };

  const selectMaximumWithdrawal = () => {
    setWithdrawalAmountMode("max");
    setWithdrawalAmount(formatWithdrawalAmount(withdrawalConfig.balance, withdrawalAsset));
  };

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.style.colorScheme = effectiveTheme;
  }, [effectiveTheme]);

  const notify = (message = "Action completed") => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const changeTab = (tab: TabId) => {
    setShowStrategy(false);
    setActiveTab(tab);
  };

  const openConnect = () => {
    setWalletFlow("connect");
  };

  const openTopUp = () => {
    if (connectedWallet !== "connected") {
      openConnect();
      return;
    }
    setTopUpStage("amount");
    setWalletFlow("topup");
  };

  const openWithdraw = () => {
    if (connectedWallet !== "connected") {
      openConnect();
      return;
    }
    setWithdrawalAsset("XAUH");
    setWithdrawalAmountMode("fixed");
    setWithdrawalAmount(withdrawalAssets.XAUH.defaultAmount);
    setWithdrawalStage("amount");
    setWalletFlow("withdraw");
  };

  const copy = async (label: string) => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(
        label === "External wallet address" ? demoWallets.external : demoWallets.agent,
      );
      notify(`${label} copied`);
    } catch {
      notify("Could not copy the address. Try again in a supported browser.");
    }
  };

  if (showOnboarding) {
    return (
      <div
        className={`app-shell theme-${effectiveTheme}`}
        data-theme={effectiveTheme}
        data-testid="app-shell"
      >
        <div className="app-scroll">
          <Onboarding
            onComplete={() => {
              setShowOnboarding(false);
              notify("Ready");
            }}
            onCancel={() => setShowOnboarding(false)}
            connectedWallet={connectedWallet === "connected"}
            onConnectWallet={() => {
              setConnectedWallet("connected");
              notify("External wallet verified");
            }}
          />
        </div>
        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`app-shell theme-${effectiveTheme}`}
      data-theme={effectiveTheme}
      data-testid="app-shell"
    >
      <BrandHeader onOpenSettings={() => setSettingsOpen(true)} />
      {showStrategy ? (
        <div key="strategy" className="app-scroll">
          <TradingStrategyScreen
            agentMode={agentMode}
            savedConfiguration={strategyConfiguration}
            onBack={closeStrategy}
            onSave={(configuration) => {
              if (!strategyConfiguration.selectedStrategy) setAgentMode("paused");
              setStrategyConfiguration(structuredClone(configuration));
              notify("Trading strategy saved");
            }}
            onPause={() => {
              if (!strategyConfiguration.selectedStrategy) return;
              setAgentMode((mode) => (mode === "paused" ? "monitoring" : "paused"));
              notify(
                agentMode === "paused" ? "Trading strategy resumed" : "Trading strategy paused",
              );
            }}
            onRemove={() => setConfirmAction("remove-strategy")}
          />
        </div>
      ) : activeTab === "chat" ? (
        <ChatScreen
          onOpenStrategy={() => setShowStrategy(true)}
          notify={() => notify("Message sent")}
        />
      ) : (
        <div key={activeTab} className="app-scroll">
          {activeTab === "home" ? (
            <HomeScreen
              agentMode={agentMode}
              savedStrategyTitle={savedStrategyTitle}
              savedLimits={strategyConfiguration.limits}
              onOpenAgentState={() => setAgentStateOpen(true)}
              onOpenStrategy={() => setShowStrategy(true)}
              onChangeTab={changeTab}
              onOpenActivity={setSelectedActivity}
              onTopUp={openTopUp}
            />
          ) : activeTab === "wallets" ? (
            <WalletsScreen
              connectedWallet={connectedWallet}
              onConnect={openConnect}
              onDisconnect={() => {
                setConnectedWallet("disconnected");
                notify("External wallet disconnected");
              }}
              onTopUp={openTopUp}
              onWithdraw={openWithdraw}
              onCopy={copy}
            />
          ) : (
            <ActivityScreen
              filter={activityFilter}
              dataState={activityDataState}
              onChangeFilter={setActivityFilter}
              onOpenActivity={setSelectedActivity}
            />
          )}
        </div>
      )}

      {!showStrategy ? <BottomNav active={activeTab} onChange={changeTab} /> : null}

      <BottomSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title="Settings"
        description="Customize your experience and explore app states."
      >
        <div className="settings-list">
          <div className="setting-row">
            <span>
              <GearIcon />
              Theme
            </span>
            <div className="theme-options" role="group" aria-label="Theme">
              {(["system", "light", "dark"] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={theme === item ? "is-active" : ""}
                  onClick={() => setTheme(item)}
                >
                  {item === "system" ? (
                    <ReloadIcon />
                  ) : item === "light" ? (
                    <SunIcon />
                  ) : (
                    <MoonIcon />
                  )}
                  {item}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="sheet-action"
            onClick={() => {
              setSettingsOpen(false);
              setShowStrategy(false);
              setShowOnboarding(true);
            }}
          >
            <RocketIcon /> Restart onboarding <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="sheet-action"
            onClick={() => {
              setSettingsOpen(false);
              setActiveTab("activity");
              setActivityFilter("all");
              setActivityDataState("ready");
            }}
          >
            <ActivityLogIcon /> Activity states <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="sheet-action"
            onClick={() => {
              setSettingsOpen(false);
              setActiveTab("activity");
              setActivityDataState("loading");
            }}
          >
            <UpdateIcon /> Activity loading <ChevronRightIcon />
          </button>
          <button
            type="button"
            className="sheet-action"
            onClick={() => {
              setSettingsOpen(false);
              setActiveTab("activity");
              setActivityDataState("empty");
            }}
          >
            <ActivityLogIcon /> Empty activity <ChevronRightIcon />
          </button>
          <p className="mock-note">
            <InfoCircledIcon /> Preview environment: sample data, no real transactions.
          </p>
        </div>
      </BottomSheet>

      <BottomSheet
        open={agentStateOpen}
        onOpenChange={setAgentStateOpen}
        title="Agent status"
        description="Use these controls to review the main operating states."
      >
        <div className="state-options">
          {(
            [
              ["monitoring", "Monitoring", "Continuously checking market conditions", UpdateIcon],
              ["paused", "Paused", "No autonomous decisions or payments", PauseIcon],
              [
                "insufficient",
                "Insufficient funds",
                "Funding or reserve action is required",
                ExclamationTriangleIcon,
              ],
            ] as const
          ).map(([mode, title, description, Icon]) => (
            <button
              type="button"
              key={mode}
              disabled={!strategyConfiguration.selectedStrategy && mode !== "paused"}
              className={agentMode === mode ? "is-active" : ""}
              onClick={() => {
                if (!strategyConfiguration.selectedStrategy && mode !== "paused") return;
                setAgentMode(mode);
                setAgentStateOpen(false);
              }}
            >
              <IconTile tone={mode === "monitoring" ? "green" : "red"}>
                <Icon />
              </IconTile>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={walletFlow === "connect"}
        onOpenChange={(open) => {
          if (!open) setWalletFlow(null);
        }}
        title="Connect your Ethereum wallet"
        description="A secure check confirms that this wallet belongs to you. The agent never receives your keys."
      >
        <div className="wallet-flow">
          {connectedWallet === "proof-failed" || connectedWallet === "wrong-network" ? (
            <div className="flow-state flow-state--danger">
              <ExclamationTriangleIcon />
              <h3>
                {connectedWallet === "wrong-network"
                  ? "Ethereum Mainnet required"
                  : "Wallet check failed"}
              </h3>
              <p>
                {connectedWallet === "wrong-network"
                  ? "Switch the wallet to Ethereum Mainnet and try again."
                  : "We could not verify this wallet. Start a new connection request."}
              </p>
            </div>
          ) : (
            <div className="flow-state">
              <IconTile size="large">
                <GlobeIcon />
              </IconTile>
              <h3>Ready to connect</h3>
            </div>
          )}
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              setConnectedWallet("connected");
              setWalletFlow(null);
              notify("External wallet verified");
            }}
            data-testid="verify-wallet"
          >
            <CheckCircledIcon /> Connect wallet
          </button>
          <div className="preview-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setConnectedWallet("wrong-network")}
            >
              Wrong network
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setConnectedWallet("proof-failed")}
            >
              Verification failure
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={walletFlow === "topup"}
        onOpenChange={(open) => {
          if (!open) setWalletFlow(null);
        }}
        title="Top up agent wallet"
        description="Your external wallet approves the transfer. Credit appears only after Ethereum confirmation."
      >
        <div className="wallet-flow">
          {topUpStage === "amount" ? (
            <>
              <div
                className="segmented-control segmented-control--two"
                role="group"
                aria-label="Top-up asset"
              >
                {(["USDT", "ETH"] as const).map((asset) => (
                  <button
                    type="button"
                    key={asset}
                    className={topUpAsset === asset ? "is-active" : ""}
                    onClick={() => {
                      setTopUpAsset(asset);
                      setTopUpAmount(asset === "USDT" ? "500" : "0.5");
                    }}
                  >
                    {asset}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>Amount</span>
                <span className="flow-input-wrap">
                  <input
                    inputMode="decimal"
                    aria-label="Top-up amount"
                    value={topUpAmount}
                    onChange={(event) => setTopUpAmount(event.target.value)}
                  />
                  <small>{topUpAsset}</small>
                </span>
              </label>
              <dl className="detail-list detail-list--compact">
                <div>
                  <dt>From</dt>
                  <dd className="wallet-address">External wallet · {demoWallets.external}</dd>
                </div>
                <div>
                  <dt>To</dt>
                  <dd className="wallet-address">Agent wallet · {demoWallets.agent}</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>Ethereum Mainnet</dd>
                </div>
              </dl>
              <aside className="risk-note">
                <InfoCircledIcon />
                <p>
                  {topUpAsset === "USDT"
                    ? "Your external wallet needs a small ETH balance for its transfer fee."
                    : "ETH pays the network fee for manual ETH, USDT, and XAUH withdrawals."}
                </p>
              </aside>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setTopUpStage("wallet")}
                data-testid="review-top-up"
              >
                Review in external wallet
              </button>
            </>
          ) : topUpStage === "wallet" ? (
            <>
              <div className="flow-state">
                <IconTile size="large">
                  <PaperPlaneIcon />
                </IconTile>
                <h3>
                  Approve {topUpAmount} {topUpAsset}
                </h3>
                <p>Confirm the destination, token, amount, and Ethereum Mainnet in your wallet.</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setTopUpStage("pending")}
                data-testid="confirm-top-up"
              >
                Approve transfer
              </button>
              <div className="preview-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTopUpStage("rejected")}
                >
                  Rejection
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTopUpStage("failed")}
                >
                  Failed submission
                </button>
              </div>
            </>
          ) : topUpStage === "pending" ? (
            <>
              <div className="flow-state flow-state--pending">
                <UpdateIcon />
                <h3>Top-up submitted</h3>
                <p>
                  Transfer submitted. Waiting for network confirmation before adding it to your
                  balance.
                </p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setTopUpStage("credited")}
                data-testid="complete-top-up"
              >
                Continue
              </button>
            </>
          ) : topUpStage === "credited" ? (
            <>
              <div className="flow-state flow-state--success">
                <CheckCircledIcon />
                <h3>
                  {topUpAmount} {topUpAsset} credited
                </h3>
                <p>The confirmed transfer is now reflected in the agent-wallet balance.</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setWalletFlow(null);
                  notify("Top-up credited");
                }}
              >
                Done
              </button>
            </>
          ) : (
            <>
              <div className="flow-state flow-state--danger">
                <ExclamationTriangleIcon />
                <h3>{topUpStage === "rejected" ? "Request rejected" : "Submission failed"}</h3>
                <p>
                  {topUpStage === "rejected"
                    ? "No transfer was signed or broadcast."
                    : "No credit was recorded. Check your wallet before retrying."}
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setTopUpStage("amount")}
              >
                Try again
              </button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={walletFlow === "withdraw"}
        onOpenChange={(open) => {
          if (!open) setWalletFlow(null);
        }}
        title="Withdraw"
        description="Choose ETH, USDT, or XAUH. Every withdrawal goes only to your verified external wallet."
      >
        <div className="wallet-flow">
          {withdrawalStage === "amount" ? (
            <>
              <div
                className="segmented-control withdrawal-asset-selector"
                role="group"
                aria-label="Withdrawal asset"
              >
                {(["ETH", "USDT", "XAUH"] as const).map((asset) => (
                  <button
                    type="button"
                    key={asset}
                    className={withdrawalAsset === asset ? "is-active" : ""}
                    onClick={() => selectWithdrawalAsset(asset)}
                  >
                    {asset}
                  </button>
                ))}
              </div>
              <div className="field">
                <div className="field-heading">
                  <span>Amount</span>
                  <button
                    type="button"
                    className="max-button"
                    aria-pressed={withdrawalAmountMode === "max"}
                    onClick={selectMaximumWithdrawal}
                    data-testid="withdrawal-max"
                  >
                    Max
                  </button>
                </div>
                <span className="flow-input-wrap">
                  <input
                    inputMode="decimal"
                    aria-label="Withdrawal amount"
                    value={withdrawalAmount}
                    readOnly={withdrawalAmountMode === "max"}
                    onChange={(event) => {
                      setWithdrawalAmountMode("fixed");
                      setWithdrawalAmount(event.target.value);
                    }}
                  />
                  <small>{withdrawalAsset}</small>
                </span>
                {withdrawalAsset === "ETH" && withdrawalAmountMode === "fixed" ? (
                  <small className={withdrawalAmountInvalid ? "field-error" : "field-help"}>
                    Maximum fixed amount: {formatWithdrawalAmount(maximumFixedWithdrawal, "ETH")}{" "}
                    ETH. Choose Max to send the remaining balance after fees.
                  </small>
                ) : withdrawalAmountInvalid ? (
                  <small className="field-error">
                    Enter an amount within the available balance.
                  </small>
                ) : null}
              </div>
              <dl className="detail-list detail-list--compact">
                <div>
                  <dt>Available</dt>
                  <dd>
                    {formatWithdrawalAmount(withdrawalConfig.balance, withdrawalAsset)}{" "}
                    {withdrawalAsset}
                  </dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd className="wallet-address">Verified · {demoWallets.external}</dd>
                </div>
                <div>
                  <dt>Estimated network fee</dt>
                  <dd>{withdrawalFeeLabel}</dd>
                </div>
                {isMaxEthWithdrawal ? (
                  <div>
                    <dt>Estimated to receive</dt>
                    <dd>{withdrawalReceiveLabel}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Agent wallet after</dt>
                  <dd>{withdrawalBalanceAfter}</dd>
                </div>
              </dl>
              {isMaxEthWithdrawal ? (
                <aside className="risk-note">
                  <InfoCircledIcon />
                  <p>
                    Max sends the remaining ETH balance after the actual network fee. The agent
                    wallet may have no ETH left for another withdrawal.
                  </p>
                </aside>
              ) : (
                <aside className="risk-note">
                  <InfoCircledIcon />
                  <p>
                    The network fee is paid from the agent wallet in ETH and does not change the{" "}
                    {withdrawalAsset} amount you enter.
                  </p>
                </aside>
              )}
              <button
                type="button"
                className="button button--primary"
                onClick={() => setWithdrawalStage("confirm")}
                disabled={withdrawalAmountInvalid}
                data-testid="review-withdrawal"
              >
                Review withdrawal
              </button>
              <div className="preview-actions preview-actions--wrap">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setWithdrawalStage("insufficient-eth")}
                >
                  Insufficient ETH
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setWithdrawalStage("stale-preview")}
                >
                  Changed fee
                </button>
              </div>
            </>
          ) : withdrawalStage === "confirm" ? (
            <>
              <div className="flow-review">
                <span>Send</span>
                <strong>{withdrawalSendLabel}</strong>
                <span>Estimated to receive</span>
                <strong>{withdrawalReceiveLabel}</strong>
                <span>Estimated network fee</span>
                <strong>{withdrawalFeeLabel}</strong>
                <span>Agent wallet after</span>
                <strong>{withdrawalBalanceAfter}</strong>
                <span>To verified wallet</span>
                <strong className="wallet-address">{demoWallets.external}</strong>
              </div>
              <aside className="risk-note">
                <InfoCircledIcon />
                <p>
                  {isMaxEthWithdrawal
                    ? "The received ETH amount is an estimate because the actual network fee is deducted from the balance. You may need to top up ETH before another withdrawal."
                    : "This transfer is irreversible, its fee is paid from the agent wallet in ETH, and it is separate from your trading strategy."}
                </p>
              </aside>
              <button
                type="button"
                className="button button--danger-filled"
                onClick={() => setWithdrawalStage("processing")}
                data-testid="confirm-withdrawal"
              >
                Confirm withdrawal
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setWithdrawalStage("amount")}
              >
                Go back
              </button>
            </>
          ) : withdrawalStage === "processing" ? (
            <>
              <div className="flow-state flow-state--pending">
                <UpdateIcon />
                <h3>Withdrawal submitted</h3>
                <p>Security checks passed. Waiting for the Ethereum transfer result.</p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setWithdrawalStage("completed")}
                data-testid="complete-withdrawal"
              >
                Continue
              </button>
              <div className="preview-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setWithdrawalStage("failed")}
                >
                  Failure
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setWithdrawalStage("needs-review")}
                >
                  Unclear result
                </button>
              </div>
            </>
          ) : withdrawalStage === "completed" ? (
            <>
              <div className="flow-state flow-state--success">
                <CheckCircledIcon />
                <h3>Withdrawal completed</h3>
                <p>
                  {withdrawalCompletionLabel} reached your verified external wallet. The final
                  network result is confirmed.
                </p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setWalletFlow(null);
                  notify(`${withdrawalAsset} withdrawal completed`);
                }}
              >
                Done
              </button>
            </>
          ) : withdrawalStage === "insufficient-eth" ? (
            <>
              <div className="flow-state flow-state--danger">
                <ExclamationTriangleIcon />
                <h3>ETH balance is too low</h3>
                <p>
                  The agent wallet must pay the withdrawal fee in ETH. Add ETH before trying again.
                </p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => {
                  setTopUpAsset("ETH");
                  setTopUpAmount("0.5");
                  setTopUpStage("amount");
                  setWalletFlow("topup");
                }}
              >
                Top up ETH
              </button>
            </>
          ) : withdrawalStage === "stale-preview" ? (
            <>
              <div className="flow-state flow-state--danger">
                <ReloadIcon />
                <h3>Review required</h3>
                <p>
                  The balance or network fee changed. Nothing was sent. Review the updated
                  withdrawal before confirming.
                </p>
              </div>
              <button
                type="button"
                className="button button--primary"
                onClick={() => setWithdrawalStage("amount")}
              >
                Review updated amount
              </button>
            </>
          ) : withdrawalStage === "failed" ? (
            <>
              <div className="flow-state flow-state--danger">
                <CrossCircledIcon />
                <h3>Withdrawal failed</h3>
                <p>
                  The transfer has a final failure. No asset was delivered and no automatic retry
                  will be made.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setWalletFlow(null)}
              >
                Close
              </button>
            </>
          ) : (
            <>
              <div className="flow-state flow-state--danger">
                <ExclamationTriangleIcon />
                <h3>Withdrawal needs review</h3>
                <p>
                  The final network result is unclear. The agent will not retry while it is being
                  checked.
                </p>
              </div>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setWalletFlow(null)}
              >
                Close
              </button>
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={selectedActivity !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedActivity(null);
        }}
        title={selectedActivity?.title ?? "Purchase activity"}
        description={
          selectedActivity
            ? `${selectedActivity.id.replace(/^DEMO-/, "")} · ${selectedActivity.time}`
            : undefined
        }
      >
        {selectedActivity ? <ActivityDetail item={selectedActivity} /> : null}
      </BottomSheet>

      <BottomSheet
        open={confirmAction === "remove-strategy"}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title="Remove this strategy?"
        description={`Remove ${savedStrategyTitle ?? "the saved strategy"} and stop autonomous purchases? Unsaved edits will be discarded. Saved parameters and purchase limits stay available for your next strategy.`}
      >
        <div className="confirmation-actions">
          <button
            type="button"
            className="button button--danger-filled"
            onClick={() => {
              setConfirmAction(null);
              setStrategyConfiguration((configuration) => ({
                ...configuration,
                selectedStrategy: null,
              }));
              setAgentMode("paused");
              closeStrategy();
              notify("Trading strategy removed");
            }}
          >
            <CrossCircledIcon /> Remove strategy
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => setConfirmAction(null)}
          >
            Keep strategy
          </button>
        </div>
      </BottomSheet>

      {toast ? (
        <div className="toast" role="status" data-testid="toast">
          <CheckCircledIcon /> {toast}
        </div>
      ) : null}
    </div>
  );
}
