export function BrandHeader({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="brand-header">
      <button
        className="brand-button"
        type="button"
        onClick={onOpenSettings}
        aria-label="Open demo settings"
        data-testid="settings-trigger"
      >
        <img src="/assets/xauh-coin.png" alt="" className="brand-coin" draggable={false} />
      </button>
      <div className="brand-title-wrap">
        <p className="brand-title">Herculis XAUH Agent</p>
        <p className="brand-subtitle">Interactive demo · No real transactions</p>
      </div>
    </header>
  );
}
