# Herculis XAUH Agent

An interactive, responsive demo of a gold-token agent experience. Explore Home, Chat, Wallets, Activity, onboarding, and four trading strategies in light or dark mode.

All balances, wallet addresses, messages, and transactions are synthetic. The demo does not connect to wallets, blockchains, Telegram, models, or a backend. Reloading resets the session. The displayed XAUH price is a demo reference value.

## Run locally

Use Node.js 20.19+ in the 20.x series, or Node.js 22.12+ (Node.js 24 recommended), and npm.

```sh
npm ci
npm run dev
```

Open the [local demo](http://127.0.0.1:4173). Open **Settings** using the gear button on the right side of the header to change themes, restart onboarding, or choose **Activity states** to explore additional demo states.

## Commands

| Command                | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run dev`          | Start the local development server                                |
| `npm run build`        | Type-check and build static files into `dist`                     |
| `npm run preview`      | Preview the production build locally                              |
| `npm run typecheck`    | Check TypeScript                                                  |
| `npm run lint`         | Check code with Oxlint                                            |
| `npm run lint:fix`     | Apply safe lint fixes                                             |
| `npm run format`       | Format supported files with Oxfmt                                 |
| `npm run format:check` | Check formatting without writing files                            |
| `npm test`             | Run browser interaction tests                                     |
| `npm run validate`     | Run lint, formatting, type checking, the build, and browser tests |

Install the browser once before running tests:

```sh
npx playwright install chromium
npm run validate
```

## Entry routes

- `/?theme=light` or `/?theme=dark` selects a theme; the default follows the system.
- `/?tab=home`, `/?tab=chat`, `/?tab=wallets`, or `/?tab=activity` opens a tab.
- `/?view=strategy` opens the strategy editor.
- `/#onboarding` opens onboarding.

## Trading strategy demo

Choose a strategy manually or use **Choose randomly with Quantis**. This is a local simulation: no Quantis device is connected. Each of the four strategies has a 25% chance on every draw, including the current choice. Random selection only changes the editor draft.

**Save strategy** keeps the selection, each strategy's parameters, and shared purchase limits for the current session. Leaving the editor discards unsaved changes. Pause and Resume apply to the saved strategy without saving the draft. Saving keeps the current operating mode.

**Remove strategy** discards unsaved changes and removes the saved selection, while retaining saved parameters and limits. After saving a new strategy, use **Resume strategy** to enable demo monitoring. Restarting onboarding preserves the saved configuration and operating mode; reloading resets the entire session.

## Aqua execution comparison

**Execution via Aqua** compares a single full USDT → XAUH purchase under the current editor settings. The agent recommends an option and explains its choice; **Compare options** shows alternatives without a manual override. Manual and Quantis selection use the same calculation. Editing recalculates immediately, while Save keeps only the strategy configuration. Back discards the draft. An unavailable recommendation does not prevent saving a rule for future conditions.

The two [execution offers](src/demo/executionFixtures.ts) represent Constant-product AMM and Concentrated-liquidity AMM families. A trading rule, a SwapVM program family, and a particular liquidity position are distinct concepts. Target price buy constrains the effective price; Reserve buy uses the larger of its own reserve and the shared minimum balance. Weekly DCA and Dip buy describe when a purchase is eligible. Their schedule, drop percentage, and lookback do not change the price curve. This comparison does not monitor markets, calculate a historical high, or determine whether a trigger or interval has elapsed.

The [SwapVM catalog](https://github.com/1inch/swap-vm/blob/feb16411738331f7d05ae71d4a664154068018fc/docs/PROGRAMS.md) distinguishes one-direction limit programs from bidirectional AMM programs. Aqua-backed settlement is a separate authorization and balance mode. The selected [Aqua opcode set](https://github.com/1inch/swap-vm/blob/feb16411738331f7d05ae71d4a664154068018fc/contracts/opcodes/AquaOpcodes.sol) includes both AMM primitives. This app builds no bytecode, ships no positions, and connects to no router or quote service. The local model does not reproduce SwapVM's complete arithmetic or settlement behavior. Limit orders, pegged curves, partial fills, split routing, fee-on-transfer, and real transactions are outside this comparison.

### Calculation and fixture assumptions

All options share one fixed reference context: Ethereum, 825.40 USDT available, zero spent today/this month, 130 USD/XAUH reference price, and an assumed 1 USDT = 1 USD. These are independent synthetic inputs, not data inferred from Activity or a live wallet. Neither comparison nor Save changes balances, spend counters, or history.

| Offer                      | Pricing reserves X (USDT), Y (XAUH) | Input swap fee | Additional limits                                                                          |
| -------------------------- | ----------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| Constant-product AMM       | 50,000; 390.625                     | 0.05%          | Available output: 390.625 XAUH; input cap: 50,000 USDT                                     |
| Concentrated-liquidity AMM | Virtual reserves: 500,000; 3,906.25 | 0.30%          | Price range: 126–128.20 USDT/XAUH; available output: 3.048186 XAUH; input cap: 10,000 USDT |

Both start at an internal pool price of 128 USDT/XAUH. This pool price is distinct from the shared external reference of 130. The concentrated offer's real output reserve is derived from the range: with `L = sqrt(X × Y)` and `P = X / Y`, the available XAUH is `L × (1 / sqrt(P) − 1 / sqrt(128.20))`, approximately 3.048186184 XAUH, rounded down to six decimals. The corresponding real USDT reserve is `L × (sqrt(P) − sqrt(126))`, approximately 3,921.629175 USDT. Virtual reserves are not spendable balances. Each offer's input cap is an independent illustrative offer limit, not a derivation of its reserves or range; the concentrated range and actual output balance impose a tighter limit first.

For purchase amount `A`, swap fee `f` is rounded up and deducted inside `A`. Net input `a = A − f` gives `Q = Y × a / (X + a)`, with output rounded down. The concentrated offer uses its virtual reserves in this formula, and separately checks both endpoint prices and available real output. No offer silently reduces the requested amount.

A fixed payment fee of **0.38 USDT** is added on top: total `C = A + 0.38`. This is an explicit comparison fixture, consistent with the historical display value, not a verified Aqua tariff. The 0.05% and 0.30% swap fees are also illustrative. Network fees are unknown and **not included**, rather than assumed to be zero; there is no fee-on-transfer model. The UI's effective price includes only the listed swap and payment fees.

The [calculator](src/demo/execution.ts) checks the full total against per-purchase, remaining daily/monthly budgets, and the balance after the required reserve. Effective price is `C / Q`; price versus reference is `(effective USD price / reference price − 1) × 100%`. Target and markup comparisons use exact integer cross-products before display rounding. Negative markup remains negative. Among eligible offers, the largest XAUH output wins; equal six-decimal outputs use a stable offer ID and are described as equivalent.

Amounts use integer arithmetic at six decimal places, a UI model precision rather than a claim about contract token decimals. Outputs round down, fees and calculated price bounds round up, and inputs with more than six decimals are rejected. Values above 1,000,000,000,000, invalid active-rule fields, zero output, or invalid comparison data cannot produce a recommendation. Inactive strategy fields do not affect the selected rule. Zero budgets and reserves are valid inputs; purchase/target values must be positive. DCA accepts full weekday names and 24-hour `HH:mm`; Dip buy requires a percentage strictly between 0 and 100 and a positive whole-day window.

At **50 USDT**, the offers yield 0.390039 and 0.389414 XAUH, respectively, so Constant-product AMM wins. At **200 USDT**, they yield 1.555499 and 1.557191 XAUH, so Concentrated-liquidity AMM wins. Both examples fit the initial target and shared limits. A **250 USDT** purchase is excluded by a 250 USDT purchase cap because the total is **250.38 USDT**. These examples demonstrate amount-dependent comparison, not a guarantee of future execution or returns.

## Development

[Application state](src/App.tsx) composes the [screens](src/screens/) and [shared components](src/components/). [Demo fixtures](src/demo/fixtures.ts) hold example data, [types](src/types.ts) define the model, and [styles](src/styles.css) contain the visual presentation. [Browser hooks](src/hooks/browser.ts) handle the system theme and visible viewport.

Installing dependencies enables a pre-commit hook that applies safe lint fixes and formats staged files. See the [contributor guide](CONTRIBUTING.md) for editor setup, workflow, and validation details.

## Deployment

GitHub Actions validates pull requests targeting `main` and pushes to `main`. Successful pushes in the upstream repository deploy the tested static build to the [Cloudflare Pages demo](https://herculis-xauh-agent-demo.pages.dev).

## License

Project code and included project assets, except the [Quantis device photograph](public/assets/quantis-device.webp), are available under the [MIT license](LICENSE). The Quantis photograph is provided for use in this application and is excluded from the project's MIT license. Rights to the photograph and the depicted branding remain with their respective rights holders. Dependencies retain their respective licenses. The project name and branding do not imply endorsement of derivatives.
