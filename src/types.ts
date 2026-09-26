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

export type WithdrawalAsset = "ETH" | "USDT" | "XAUH";

export type WithdrawalAmountMode = "fixed" | "max";

export type WithdrawalStage =
  | "amount"
  | "confirm"
  | "processing"
  | "completed"
  | "insufficient-eth"
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

export type StrategyConfiguration = {
  selectedStrategy: StrategyId | null;
  drafts: Record<StrategyId, StrategyDraft>;
  limits: SharedStrategyLimits;
};

export type StrategyEditorDraft = StrategyConfiguration & { selectedStrategy: StrategyId };

export type ExecutionFamily = "constant-product" | "concentrated-liquidity";

export type ExecutionOffer = {
  id: string;
  name: string;
  family: ExecutionFamily;
  tokenIn: string;
  tokenOut: string;
  network: string;
  settlement: string;
  feePpm: bigint;
  reserveIn: bigint;
  reserveOut: bigint;
  availableOut: bigint;
  maxInput: bigint;
  priceRange?: { min: bigint; max: bigint };
};

export type ExecutionContext = {
  balance: bigint;
  spentToday: bigint;
  spentThisMonth: bigint;
  paymentFee: bigint;
  referencePrice: bigint;
  usdPerUsdt: bigint;
};

export type ExecutionEstimate = {
  offer: ExecutionOffer;
  reasons: string[];
  quote?: {
    amount: bigint;
    swapFee: bigint;
    paymentFee: bigint;
    total: bigint;
    output: bigint;
    effectivePrice: bigint;
    priceVsReference: bigint;
  };
};

export type ExecutionComparison = {
  status: "invalid" | "unavailable" | "ready";
  invalidFields: string[];
  condition: string;
  estimates: ExecutionEstimate[];
  recommendation?: ExecutionEstimate;
  explanation: string;
  context: ExecutionContext;
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
