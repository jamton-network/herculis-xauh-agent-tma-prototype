import type { ExecutionComparison, ExecutionEstimate } from "../types";
import { formatDecimal } from "../demo/executionDecimal";

function Metrics({ estimate }: { estimate: ExecutionEstimate }) {
  if (!estimate.quote) return null;
  const { output, total, effectivePrice } = estimate.quote;
  return (
    <dl className="execution-metrics">
      <div>
        <dt>Estimated XAUH</dt>
        <dd>
          {formatDecimal(output, 6)} <small>XAUH</small>
        </dd>
      </div>
      <div>
        <dt>Total USDT</dt>
        <dd>
          {formatDecimal(total, 2)} <small>USDT</small>
        </dd>
      </div>
      <div>
        <dt>Effective price</dt>
        <dd>
          {formatDecimal(effectivePrice, 2, 2)} <small>USDT/XAUH</small>
        </dd>
      </div>
    </dl>
  );
}

function inputHint(field: string): string {
  if (field === "Day") return "Enter a day from Monday to Sunday.";
  if (field === "Local time") return "Use 24-hour time, from 00:00 to 23:59.";
  if (field === "Drop from recent high")
    return "Enter a percentage greater than 0 and less than 100.";
  if (field === "Recent-high window") return "Enter a positive whole number of days.";
  if (field === "Purchase amount" || field === "Buy at or below")
    return "Enter a positive value with up to 6 decimal places.";
  return "Enter zero or a positive value with up to 6 decimal places.";
}

export function AquaExecution({ comparison }: { comparison: ExecutionComparison }) {
  const { recommendation, estimates, context } = comparison;
  const eligibleCount = estimates.filter((estimate) => estimate.reasons.length === 0).length;
  const reasons = [...new Set(estimates.flatMap((estimate) => estimate.reasons))];
  const comparedQuote = estimates.find((estimate) => estimate.quote)?.quote;
  const announcement = recommendation
    ? `Recommended execution: ${recommendation.offer.name}`
    : comparison.explanation;

  return (
    <section className="execution-panel" aria-labelledby="execution-heading">
      <div className="execution-heading">
        <h3 id="execution-heading">Execution via Aqua</h3>
        <span className="execution-pair">USDT → XAUH</span>
      </div>
      <p className="execution-help">Compared for one purchase when your rule is met.</p>
      <p
        className="visually-hidden"
        role="status"
        aria-label="Execution recommendation"
        aria-atomic="true"
      >
        {announcement}
      </p>
      {comparison.status === "invalid" ? (
        <div className="execution-empty">
          <h4>{comparison.explanation}</h4>
          <ul id="execution-input-errors">
            {comparison.invalidFields.map((field) => (
              <li key={field}>
                <strong>{field}:</strong> {inputHint(field)}
              </li>
            ))}
          </ul>
          <p>Values must not exceed 1,000,000,000,000.</p>
        </div>
      ) : (
        <>
          <p className="execution-condition">{comparison.condition}</p>
          {recommendation ? (
            <section className="execution-recommendation" aria-label="Agent recommendation">
              <p className="execution-kicker">Agent recommendation</p>
              <h4>{recommendation.offer.name}</h4>
              <Metrics estimate={recommendation} />
              <p className="execution-reason">
                <strong>Why this option</strong>
                <span>{comparison.explanation}</span>
              </p>
            </section>
          ) : (
            <div className="execution-empty">
              <h4>{comparison.explanation}</h4>
              <ul>
                {(reasons.length ? reasons : ["No execution options are available"]).map(
                  (reason) => (
                    <li key={reason}>{reason}</li>
                  ),
                )}
              </ul>
            </div>
          )}
          <details className="execution-disclosure">
            <summary>Compare options ({estimates.length})</summary>
            <p className="execution-help">
              {eligibleCount} within your limits · Same purchase amount and reference conditions
            </p>
            <div className="execution-options">
              {estimates.map((estimate) => {
                const isRecommended = estimate.offer.id === recommendation?.offer.id;
                const { quote, offer } = estimate;
                const outputDifference =
                  (recommendation?.quote?.output ?? 0n) - (quote?.output ?? 0n);
                return (
                  <article className="execution-option" key={offer.id} aria-label={offer.name}>
                    <p className="execution-kicker">
                      {estimate.reasons.length
                        ? "Not eligible"
                        : isRecommended
                          ? "Recommended"
                          : "Alternative"}
                    </p>
                    <h4>{offer.name}</h4>
                    {estimate.reasons.length ? (
                      <ul className="execution-rejections">
                        {estimate.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    ) : !isRecommended ? (
                      <p className="execution-help">
                        {outputDifference === 0n
                          ? "Equivalent estimated output"
                          : `${formatDecimal(outputDifference, 6)} XAUH less for the same total USDT.`}
                      </p>
                    ) : null}
                    <Metrics estimate={estimate} />
                    <dl className="execution-details">
                      <div>
                        <dt>Swap fee</dt>
                        <dd>
                          {quote ? `${formatDecimal(quote.swapFee)} USDT · ` : ""}
                          {formatDecimal(offer.feePpm * 100n)}% of purchase amount
                        </dd>
                      </div>
                      {quote ? (
                        <div>
                          <dt>Price vs reference</dt>
                          <dd>
                            {quote.priceVsReference > 0n ? "+" : ""}
                            {formatDecimal(quote.priceVsReference, 2, 2)}%
                          </dd>
                        </div>
                      ) : null}
                      {offer.priceRange ? (
                        <div>
                          <dt>Price range</dt>
                          <dd>
                            {formatDecimal(offer.priceRange.min)}–
                            {formatDecimal(offer.priceRange.max)} USDT/XAUH
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                );
              })}
            </div>
            <details className="execution-disclosure execution-comparison-details">
              <summary>Comparison details</summary>
              <dl className="execution-details">
                {comparedQuote ? (
                  <div>
                    <dt>Purchase amount</dt>
                    <dd>{formatDecimal(comparedQuote.amount)} USDT</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Payment fee</dt>
                  <dd>{formatDecimal(context.paymentFee)} USDT, added to purchase amount</dd>
                </div>
                <div>
                  <dt>Reference price</dt>
                  <dd>{formatDecimal(context.referencePrice)} USD/XAUH</dd>
                </div>
                <div>
                  <dt>USDT conversion</dt>
                  <dd>1 USDT = {formatDecimal(context.usdPerUsdt)} USD</dd>
                </div>
                <div>
                  <dt>Network</dt>
                  <dd>Ethereum</dd>
                </div>
                <div>
                  <dt>Network fee</dt>
                  <dd>Not included</dd>
                </div>
                <div>
                  <dt>Balance for comparison</dt>
                  <dd>{formatDecimal(context.balance, 2)} USDT</dd>
                </div>
                <div>
                  <dt>Spent today</dt>
                  <dd>{formatDecimal(context.spentToday)} USDT</dd>
                </div>
                <div>
                  <dt>Spent this month</dt>
                  <dd>{formatDecimal(context.spentThisMonth)} USDT</dd>
                </div>
              </dl>
              <p className="execution-help">
                Swap fees are included in the purchase amount. Total USDT includes the payment fee.
                Effective price uses these listed fees.
              </p>
            </details>
          </details>
        </>
      )}
    </section>
  );
}
