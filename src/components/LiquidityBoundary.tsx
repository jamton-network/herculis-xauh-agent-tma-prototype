import { Component, type ReactNode } from "react";

export class LiquidityBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="screen-content liquidity-screen">
        <section className="live-message" role="alert">
          <h1>Liquidity positions couldn’t load</h1>
          <p>Reload to try again. Saved transactions remain recoverable.</p>
          <div className="liquidity-secondary-actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
            <button type="button" className="liquidity-text-button" onClick={this.props.onBack}>
              Back to trading strategy
            </button>
          </div>
        </section>
      </main>
    );
  }
}
