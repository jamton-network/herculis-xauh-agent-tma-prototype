import {
  ActivityLogIcon,
  BellIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  StopIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import type { ActivityFilter, ActivityDataState, ActivityItem } from "../types";
import { activityItems, statusCopy } from "../demo/fixtures";
import { IconTile } from "../components/IconTile";
import { StatusBadge } from "../components/StatusBadge";

export function ActivityScreen({
  filter,
  dataState,
  onChangeFilter,
  onOpenActivity,
}: {
  filter: ActivityFilter;
  dataState: ActivityDataState;
  onChangeFilter: (filter: ActivityFilter) => void;
  onOpenActivity: (item: ActivityItem) => void;
}) {
  const filteredItems = activityItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "purchases") return item.kind === "purchase";
    return item.kind === "topup" || item.kind === "withdrawal";
  });

  return (
    <main className="screen-content activity-screen" aria-labelledby="activity-heading">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">Purchases and wallet transfers</p>
          <h1 id="activity-heading">Activity</h1>
        </div>
        <BellIcon className="heading-icon" />
      </div>
      <div className="segmented-control" role="group" aria-label="Activity filter">
        {(["all", "purchases", "transfers"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={filter === item ? "is-active" : ""}
            onClick={() => onChangeFilter(item)}
            data-testid={`activity-filter-${item}`}
          >
            {item}
          </button>
        ))}
      </div>

      {dataState === "loading" ? (
        <div className="skeleton-list" aria-label="Loading activity">
          {[1, 2, 3, 4].map((item) => (
            <div className="skeleton-row" key={item}>
              <span />
              <div>
                <span />
                <span />
              </div>
            </div>
          ))}
        </div>
      ) : dataState === "empty" ? (
        <section className="empty-state">
          <IconTile size="large">
            <ActivityLogIcon />
          </IconTile>
          <h2>No activity yet</h2>
          <p>Agent decisions, purchases, top-ups, and withdrawals will appear here.</p>
        </section>
      ) : (
        <section className="activity-list" aria-label="Wallet and purchase activity">
          <p className="list-caption">Recent activity</p>
          {filteredItems.map((item, index) => (
            <button
              type="button"
              className="activity-list-row"
              key={item.id}
              onClick={() => onOpenActivity(item)}
              data-testid={index === 0 ? "activity-completed" : undefined}
            >
              <span className={`activity-marker activity-marker--${statusCopy[item.status].tone}`}>
                {item.status === "completed" || item.status === "credited" ? (
                  <CheckCircledIcon />
                ) : item.status === "delivery-pending" || item.status === "pending" ? (
                  <UpdateIcon />
                ) : item.status === "policy-blocked" ? (
                  <StopIcon />
                ) : item.status === "expired" ? (
                  <ClockIcon />
                ) : (
                  <ExclamationTriangleIcon />
                )}
              </span>
              <span className="activity-list-copy">
                <span className="activity-list-title">
                  <strong>{item.title}</strong>
                  <time>{item.time}</time>
                </span>
                <span>{item.description}</span>
                <span className="activity-meta">
                  {item.amount ? <small>{item.amount}</small> : null}
                  <StatusBadge status={item.status} compact />
                </span>
              </span>
              <ChevronRightIcon />
            </button>
          ))}
        </section>
      )}
    </main>
  );
}
