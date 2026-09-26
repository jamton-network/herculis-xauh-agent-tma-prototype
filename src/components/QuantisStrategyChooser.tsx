import { useState } from "react";
import { InfoCircledIcon, ShuffleIcon } from "@radix-ui/react-icons";
import { QuantisInfoSheet } from "./QuantisInfoSheet";

export function QuantisStrategyChooser({
  result,
  onChoose,
}: {
  result: string;
  onChoose: () => void;
}) {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <section className="quantis-chooser" aria-labelledby="quantis-heading">
      <div className="quantis-heading">
        <h3 id="quantis-heading">Quantis</h3>
        <button
          type="button"
          className="quantis-about"
          aria-haspopup="dialog"
          onClick={() => setAboutOpen(true)}
        >
          <InfoCircledIcon aria-hidden="true" />
          About Quantis
        </button>
      </div>
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
      <QuantisInfoSheet open={aboutOpen} onOpenChange={setAboutOpen} />
    </section>
  );
}
