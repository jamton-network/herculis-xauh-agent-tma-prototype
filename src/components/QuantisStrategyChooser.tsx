import { ShuffleIcon } from "@radix-ui/react-icons";

export function QuantisStrategyChooser({
  result,
  onChoose,
}: {
  result: string;
  onChoose: () => void;
}) {
  return (
    <section className="quantis-chooser" aria-labelledby="quantis-heading">
      <h3 id="quantis-heading">Quantis</h3>
      <p id="quantis-description">Explore a strategy picked at random.</p>
      <button
        type="button"
        className="button button--secondary"
        aria-describedby="quantis-description quantis-repeat-note"
        onClick={onChoose}
      >
        <ShuffleIcon aria-hidden="true" />
        Choose randomly with Quantis
      </button>
      <p id="quantis-repeat-note">
        Each strategy has a 25% chance. The same choice can appear again.
      </p>
      <p
        className="quantis-result"
        role="status"
        aria-label="Random strategy result"
        aria-atomic="true"
      >
        {result}
      </p>
    </section>
  );
}
