import type { ActivityStatus } from "../types";
import { statusCopy } from "../demo/fixtures";

export function StatusBadge({
  status,
  compact = false,
}: {
  status: ActivityStatus;
  compact?: boolean;
}) {
  const copy = statusCopy[status];
  return (
    <span className={`status-badge status-badge--${copy.tone} ${compact ? "is-compact" : ""}`}>
      {copy.label}
    </span>
  );
}
