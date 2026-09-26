import {
  BarChartIcon,
  CalendarIcon,
  CardStackIcon,
  ChatBubbleIcon,
  ClockIcon,
  HomeIcon,
  LockClosedIcon,
  TargetIcon,
} from "@radix-ui/react-icons";
import type {
  TabId,
  ActivityStatus,
  WithdrawalAsset,
  StrategyId,
  StrategyDraft,
  StrategyConfiguration,
  ActivityItem,
} from "../types";

export const strategyTemplates: Array<{
  id: StrategyId;
  title: string;
  description: string;
  icon: typeof TargetIcon;
}> = [
  {
    id: "target-price",
    title: "Target price buy",
    description: "Buy XAUH only at or below the price you set.",
    icon: TargetIcon,
  },
  {
    id: "weekly-dca",
    title: "Weekly DCA",
    description: "Buy a fixed amount once in each weekly window.",
    icon: CalendarIcon,
  },
  {
    id: "reserve-buy",
    title: "Reserve buy",
    description: "Buy only when enough USDT remains after the purchase.",
    icon: LockClosedIcon,
  },
  {
    id: "dip-buy",
    title: "Dip buy",
    description: "Buy after XAUH falls from its recent high.",
    icon: BarChartIcon,
  },
];

export const initialStrategyDrafts: Record<StrategyId, StrategyDraft> = {
  "target-price": {
    amount: "50",
    targetPrice: "130",
    day: "Friday",
    time: "10:00",
    reserve: "200",
    dipPercent: "2",
    lookbackDays: "7",
  },
  "weekly-dca": {
    amount: "50",
    targetPrice: "130",
    day: "Friday",
    time: "10:00",
    reserve: "200",
    dipPercent: "2",
    lookbackDays: "7",
  },
  "reserve-buy": {
    amount: "50",
    targetPrice: "130",
    day: "Friday",
    time: "10:00",
    reserve: "200",
    dipPercent: "2",
    lookbackDays: "7",
  },
  "dip-buy": {
    amount: "50",
    targetPrice: "130",
    day: "Friday",
    time: "10:00",
    reserve: "200",
    dipPercent: "2",
    lookbackDays: "7",
  },
};

export const initialStrategyConfiguration: StrategyConfiguration = {
  selectedStrategy: "target-price",
  drafts: initialStrategyDrafts,
  limits: {
    purchase: "250",
    daily: "500",
    monthly: "2000",
    reserve: "200",
    markup: "0.8",
  },
};

export const withdrawalAssets: Record<
  WithdrawalAsset,
  {
    balance: number;
    defaultAmount: string;
    estimatedFee: number;
    feeLimit: number;
  }
> = {
  ETH: {
    balance: 0.42,
    defaultAmount: "0.1",
    estimatedFee: 0.006,
    feeLimit: 0.016,
  },
  USDT: {
    balance: 825.4,
    defaultAmount: "250",
    estimatedFee: 0.045,
    feeLimit: 0.05625,
  },
  XAUH: {
    balance: 12.3456,
    defaultAmount: "2.5",
    estimatedFee: 0.045,
    feeLimit: 0.05625,
  },
};

export const activityItems: ActivityItem[] = [
  {
    id: "DEMO-ACTIVITY-001",
    title: "Delivery completed",
    description: "XAUH delivered to your Ethereum wallet",
    time: "2h ago",
    amount: "8.2958 XAUH",
    kind: "purchase",
    status: "completed",
  },
  {
    id: "DEMO-ACTIVITY-002",
    title: "Purchase held",
    description: "Price markup exceeded your 0.8% limit",
    time: "09:41",
    amount: "250 USDT",
    kind: "purchase",
    status: "policy-blocked",
  },
  {
    id: "DEMO-ACTIVITY-003",
    title: "USDT top-up credited",
    description: "External wallet transfer confirmed on Ethereum",
    time: "08:24",
    amount: "+500 USDT",
    kind: "topup",
    status: "credited",
  },
  {
    id: "DEMO-ACTIVITY-004",
    title: "ETH withdrawal completed",
    description: "Sent to your verified external wallet",
    time: "Yesterday",
    amount: `-${formatWithdrawalAmount(withdrawalAssets.ETH.balance - withdrawalAssets.ETH.estimatedFee, "ETH")} ETH`,
    kind: "withdrawal",
    status: "completed",
  },
  {
    id: "DEMO-ACTIVITY-005",
    title: "USDT withdrawal completed",
    description: "Network fee paid from the agent wallet in ETH",
    time: "Yesterday",
    amount: "-250 USDT",
    kind: "withdrawal",
    status: "completed",
  },
  {
    id: "DEMO-ACTIVITY-006",
    title: "Delivery pending",
    description: "Ethereum USDT payment received; XAUH delivery is in progress",
    time: "Yesterday",
    amount: "125 USDT",
    kind: "purchase",
    status: "delivery-pending",
  },
  {
    id: "DEMO-ACTIVITY-007",
    title: "Quote expired",
    description: "No payment was sent",
    time: "Yesterday",
    amount: "100 USDT",
    kind: "purchase",
    status: "expired",
  },
  {
    id: "DEMO-ACTIVITY-008",
    title: "Purchase failed",
    description: "Settlement result needs operator review",
    time: "2 days ago",
    amount: "80 USDT",
    kind: "purchase",
    status: "needs-review",
  },
  {
    id: "DEMO-ACTIVITY-009",
    title: "Insufficient funds",
    description: "Minimum 200 USDT reserve would be crossed",
    time: "3 days ago",
    amount: "200 USDT",
    kind: "purchase",
    status: "insufficient",
  },
];

export const statusCopy: Record<ActivityStatus, { label: string; tone: string; summary: string }> =
  {
    completed: {
      label: "Completed",
      tone: "success",
      summary: "The transfer completed and its final state has been confirmed.",
    },
    "delivery-pending": {
      label: "Delivery pending",
      tone: "pending",
      summary: "Payment is confirmed. XAUH delivery is still in progress.",
    },
    "policy-blocked": {
      label: "Strategy blocked",
      tone: "warning",
      summary:
        "No payment was requested because the decision did not pass your trading strategy and safety limits.",
    },
    expired: {
      label: "Quote expired",
      tone: "neutral",
      summary: "The purchase quote expired before payment. No payment was sent.",
    },
    failed: {
      label: "Failed",
      tone: "danger",
      summary: "The action failed with a final error and no automatic retry will be attempted.",
    },
    insufficient: {
      label: "Insufficient funds",
      tone: "danger",
      summary: "The action was blocked before signing to protect your balance or fee reserve.",
    },
    pending: {
      label: "Pending",
      tone: "pending",
      summary: "The transfer was submitted and is waiting for network confirmation.",
    },
    credited: {
      label: "Credited",
      tone: "success",
      summary: "The incoming transfer was confirmed and added to the agent balance.",
    },
    rejected: {
      label: "Rejected",
      tone: "neutral",
      summary: "The external wallet rejected the request. No transfer was submitted.",
    },
    "needs-review": {
      label: "Needs review",
      tone: "danger",
      summary:
        "The final outcome is unclear. The agent will not retry while this execution is reconciled.",
    },
  };

export const tabs: Array<{
  id: TabId;
  label: string;
  icon: typeof HomeIcon;
}> = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "chat", label: "Chat", icon: ChatBubbleIcon },
  { id: "wallets", label: "Wallets", icon: CardStackIcon },
  { id: "activity", label: "Activity", icon: ClockIcon },
];

export function formatWithdrawalAmount(value: number, asset: WithdrawalAsset) {
  if (asset === "ETH") return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  if (asset === "USDT") return value.toFixed(2).replace(/\.00$/, "");
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

export const demoWallets = {
  agent: "0x87fd926d185474eaf7f92fcc724b3f193ffdeb66",
  external: "0x14bede34e52ad32291bde02bf6c7f0e999317a4f",
} as const;

export const initialMessages = [
  {
    id: "a1",
    from: "agent" as const,
    text: "I’m waiting. The current XAUH quote is 1.1% above the reference price, beyond your 0.8% limit.",
    time: "09:41",
  },
  {
    id: "u1",
    from: "user" as const,
    text: "What would need to change before you buy?",
    time: "09:42",
  },
  {
    id: "a2",
    from: "agent" as const,
    text: "The price markup must return within your limit. I’ll also preserve your 200 USDT minimum balance, include the payment fee in your limits, and follow your 24-hour minimum interval.",
    time: "09:43",
  },
];
