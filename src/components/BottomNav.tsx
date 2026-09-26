import type { TabId } from "../types";
import { tabs } from "../demo/fixtures";

export function BottomNav({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation" data-testid="bottom-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            className={`tab-button ${active === tab.id ? "is-active" : ""}`}
            type="button"
            aria-current={active === tab.id ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            <Icon width={23} height={23} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
