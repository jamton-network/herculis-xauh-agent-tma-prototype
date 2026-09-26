import { GearIcon } from "@radix-ui/react-icons";

export function BrandHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="brand-header">
      <img src="/assets/xauh-coin.png" alt="" className="brand-coin" draggable={false} />
      <div className="brand-title-wrap">
        <p className="brand-title">Herculis XAUH Agent</p>
        <p className="brand-subtitle">Interactive demo · No real transactions</p>
      </div>
      <button
        className="icon-button brand-settings-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Open demo settings"
        aria-haspopup="dialog"
        data-testid="settings-trigger"
      >
        <GearIcon aria-hidden="true" />
      </button>
    </header>
  );
}
