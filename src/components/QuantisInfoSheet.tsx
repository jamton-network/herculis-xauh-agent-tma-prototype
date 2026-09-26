import { ExternalLinkIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "./BottomSheet";

export function QuantisInfoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="About Quantis"
      description="Quantis is a hardware quantum random number generator from ID Quantique. It uses quantum processes to generate random numbers."
      scrollDescription
    >
      <div className="quantis-info">
        <figure>
          <img
            src="/assets/quantis-device.webp"
            width={1110}
            height={580}
            alt="Black Quantis random number generator with an ID Quantique label."
          />
          <figcaption>Quantis device by ID Quantique.</figcaption>
        </figure>
        <div className="quantis-info-copy">
          <h3>Random strategy selection</h3>
          <p>
            A random choice is another way to explore the four strategies. Review the choice and
            adjust its settings before saving.
          </p>
        </div>
        <div className="quantis-info-links">
          <a
            href="https://coredevx.com/site/en/idq-quantis-qrng-usb/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Quantis USB product details (opens in a new tab)"
          >
            Quantis USB product details
            <ExternalLinkIcon aria-hidden="true" />
          </a>
          <a
            href="https://www.idquantique.com/random-number-generation/overview/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="About quantum random number generation (opens in a new tab)"
          >
            About quantum random number generation
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        </div>
      </div>
    </BottomSheet>
  );
}
