import { formatUnits } from "viem";
import type { ExecutionFamily } from "../types";
import { familyNames, type SwapDirection, type SwapToken } from "../live/swapConfig";
import type { SwapEstimate } from "../live/swapModel";

export function AquaExecution({
  direction,
  estimates,
  decimals,
  selected,
  onSelect,
  disabled,
}: {
  direction: SwapDirection;
  estimates: SwapEstimate[];
  decimals?: Record<SwapToken, number>;
  selected: ExecutionFamily;
  onSelect: (family: ExecutionFamily) => void;
  disabled: boolean;
}) {
  const buying = direction === "instant-buy";
  const quotes = estimates.flatMap((item) => (item.quote ? [item.quote] : []));
  const best = quotes.reduce<bigint | undefined>(
    (value, quote) => (value === undefined || quote.output > value ? quote.output : value),
    undefined,
  );
  const tied = quotes.length === 2 && quotes[0].output === quotes[1].output;
  return (
    <section className="execution-panel" aria-labelledby="execution-heading">
      <div className="execution-heading">
        <h3 id="execution-heading">Execution via Aqua</h3>
        <span className="execution-pair">{buying ? "USDT → XAUH" : "XAUH → USDT"}</span>
      </div>
      <p className="execution-help">
        Choose either pricing type. The highest estimated net receipt is highlighted.
      </p>
      <p
        className="visually-hidden"
        role="status"
        aria-label="Execution recommendation"
        aria-atomic="true"
      >
        {best === undefined
          ? "Enter an amount to compare live quotes."
          : tied
            ? "Both options have equivalent net output."
            : `Best net receipt: ${familyNames[quotes.find((quote) => quote.output === best)!.order.family]}`}
      </p>
      <div className="execution-options" role="radiogroup" aria-label="Aqua execution strategy">
        {(["constant-product", "concentrated-liquidity"] as const).map((family) => {
          const estimate = estimates.find((item) => item.family === family),
            quote = estimate?.quote;
          const recommended = quote && quote.output === best;
          return (
            <article
              className={`execution-option${selected === family ? " is-selected" : ""}${recommended ? " is-recommended" : ""}`}
              key={family}
              aria-label={familyNames[family]}
            >
              <label className="execution-choice">
                <input
                  type="radio"
                  name="aqua-execution"
                  aria-label={familyNames[family]}
                  checked={selected === family}
                  onChange={() => onSelect(family)}
                  disabled={disabled}
                />
                <span>
                  <strong>{familyNames[family]}</strong>
                  <small>
                    {recommended
                      ? tied
                        ? "Equivalent net output"
                        : "Best net receipt"
                      : family === "constant-product"
                        ? "Full-range liquidity"
                        : "Liquidity within a price range"}
                  </small>
                </span>
                {selected === family && <em>Selected</em>}
              </label>
              {quote && decimals ? (
                <>
                  <dl className="execution-metrics">
                    <div>
                      <dt>Estimated received</dt>
                      <dd>
                        {formatUnits(quote.output, decimals[buying ? "xauh" : "usdt"])}{" "}
                        <small>{buying ? "XAUH" : "USDT"}</small>
                      </dd>
                    </div>
                    <div>
                      <dt>You pay</dt>
                      <dd>
                        {formatUnits(quote.input, decimals[buying ? "usdt" : "xauh"])}{" "}
                        <small>{buying ? "USDT" : "XAUH"}</small>
                      </dd>
                    </div>
                  </dl>
                  <dl className="execution-details">
                    <div>
                      <dt>Swap fee</dt>
                      <dd>
                        {formatUnits(quote.swapFee, decimals[buying ? "usdt" : "xauh"])}{" "}
                        {buying ? "USDT" : "XAUH"} · included in input
                      </dd>
                    </div>
                    {quote.transferFees.map((fee, index) => (
                      <div key={index}>
                        <dt>
                          {buying
                            ? "XAUH transfer fee"
                            : index === 0
                              ? "XAUH transfer fee · to router"
                              : "XAUH transfer fee · to liquidity provider"}
                        </dt>
                        <dd>{formatUnits(fee, decimals.xauh)} XAUH</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Minimum received</dt>
                      <dd>
                        {formatUnits(quote.minimum, decimals[buying ? "xauh" : "usdt"])}{" "}
                        {buying ? "XAUH" : "USDT"}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className={estimate?.error ? "execution-rejections" : "execution-help"}>
                  {estimate?.error ?? "Waiting for a live quote."}
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="execution-help">
        Received amounts already include token transfer fees. XAUH fee estimates use the token’s
        current rate and integer rounding. Network fees are additional and estimated by your wallet.
      </p>
    </section>
  );
}
