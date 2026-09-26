export type TabId = "home" | "chat" | "wallets" | "activity";

export type Theme = "system" | "light" | "dark";

export type AgentMode = "monitoring" | "paused" | "insufficient";

export type ActivityFilter = "all" | "purchases" | "transfers";

export type ActivityDataState = "ready" | "empty" | "loading";

export type ActivityKind = "purchase" | "topup" | "withdrawal";

export type ActivityStatus =
  | "policy-blocked"
  | "delivery-pending"
  | "completed"
  | "expired"
  | "failed"
  | "insufficient"
  | "pending"
  | "credited"
  | "rejected"
  | "needs-review";

export type ConnectedWalletState = "disconnected" | "connected" | "proof-failed" | "wrong-network";

export type WalletFlow = "connect" | "topup" | "withdraw" | null;

export type TopUpStage = "amount" | "wallet" | "pending" | "credited" | "rejected" | "failed";

export type WithdrawalAsset = "TON" | "USDT" | "XAUH";

export type WithdrawalAmountMode = "fixed" | "max";

export type WithdrawalStage =
  | "amount"
  | "confirm"
  | "processing"
  | "completed"
  | "insufficient-ton"
  | "stale-preview"
  | "failed"
  | "needs-review";

export type StrategyId = "target-price" | "weekly-dca" | "reserve-buy" | "dip-buy";

export type StrategyDraft = {
  amount: string;
  targetPrice: string;
  day: string;
  time: string;
  reserve: string;
  dipPercent: string;
  lookbackDays: string;
};

export type SharedStrategyLimits = {
  purchase: string;
  daily: string;
  monthly: string;
  reserve: string;
  markup: string;
};

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  time: string;
  amount?: string;
  kind: ActivityKind;
  status: ActivityStatus;
};
