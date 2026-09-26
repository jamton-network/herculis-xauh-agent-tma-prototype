import {
  CheckCircledIcon,
  ExclamationTriangleIcon,
  InfoCircledIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import type { ActivityItem } from "../types";
import { statusCopy, demoWallets } from "../demo/fixtures";
import { StatusBadge } from "../components/StatusBadge";

export function ActivityDetail({ item }: { item: ActivityItem }) {
  const info = statusCopy[item.status];
  const completed = item.status === "completed" || item.status === "credited";
  const pending = item.status === "delivery-pending";
  const isPurchase = item.kind === "purchase";
  const isTopUp = item.kind === "topup";
  return (
    <div className="detail-sheet">
      <div className={`detail-status detail-status--${info.tone}`}>
        {completed ? (
          <CheckCircledIcon />
        ) : pending ? (
          <UpdateIcon />
        ) : item.status === "failed" ||
          item.status === "insufficient" ||
          item.status === "needs-review" ? (
          <ExclamationTriangleIcon />
        ) : (
          <InfoCircledIcon />
        )}
        <div>
          <StatusBadge status={item.status} />
          <p>{info.summary}</p>
        </div>
      </div>
      <dl className="detail-list">
        <div>
          <dt>{isPurchase ? "Purchase" : isTopUp ? "Top-up" : "Withdrawal"}</dt>
          <dd>{item.id}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{item.amount ?? "—"}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>TON Mainnet</dd>
        </div>
        {isPurchase ? (
          <>
            <div>
              <dt>Payment asset</dt>
              <dd>USDT</dd>
            </div>
            <div>
              <dt>Payment fee</dt>
              <dd>0.38 USDT</dd>
            </div>
          </>
        ) : (
          <>
            <div>
              <dt>{isTopUp ? "Source" : "Destination"}</dt>
              <dd>{demoWallets.external}</dd>
            </div>
            {!isTopUp ? (
              <div>
                <dt>Network fee</dt>
                <dd>{item.amount?.includes("TON") ? "0.006 TON" : "0.045 TON"}</dd>
              </div>
            ) : null}
          </>
        )}
      </dl>
      <ol className="timeline" aria-label="Activity progress">
        <li className="is-done">
          <CheckCircledIcon />
          <div>
            <strong>{isPurchase ? "Agent decision" : "User confirmation"}</strong>
            <span>
              {isPurchase
                ? "Trading strategy and market conditions evaluated"
                : "Amount and wallet role reviewed"}
            </span>
          </div>
        </li>
        <li className={completed || pending ? "is-done" : ""}>
          <CheckCircledIcon />
          <div>
            <strong>
              {isPurchase ? "USDT payment" : isTopUp ? "TON transfer" : "Asset transfer"}
            </strong>
            <span>{completed || pending ? "Confirmed on TON" : "Not confirmed"}</span>
          </div>
        </li>
        {isPurchase ? (
          <li className={completed ? "is-done" : pending ? "is-current" : ""}>
            {pending ? <UpdateIcon /> : <CheckCircledIcon />}
            <div>
              <strong>XAUH delivery</strong>
              <span>
                {completed
                  ? "Delivery confirmed in agent wallet"
                  : pending
                    ? "In progress"
                    : "Not started"}
              </span>
            </div>
          </li>
        ) : null}
      </ol>
      {(completed || pending) && (
        <p className="mock-note">
          <InfoCircledIcon /> Explorer links are unavailable for simulated transactions.
        </p>
      )}
    </div>
  );
}
