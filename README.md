# Herculis XAUH Agent

A responsive gold-token agent demo with Home, Chat, Wallets, Activity, onboarding and wallet-confirmed Aqua swaps on Sepolia.

Home, Chat, Activity and the agent wallet use simulated balances, addresses, messages and transactions. The External wallet card shares the real Sepolia wallet connection with Aqua swaps. Reloading resets that demo session. **Trading strategy** provides a separate live **Instant buy / Instant sell** flow for XAUH and USDT. Its amounts, balances, fees and quotes come from user inputs and Sepolia contracts; simulated demo values never authorize live transactions.

## Run locally

Use Node.js 22.12+ and npm. Node.js 24 is recommended.

```sh
npm ci
npm run dev
```

Open the [local demo](http://127.0.0.1:4173). Use the header settings to change themes or restart onboarding. Public Sepolia settings are included with the app, so live quotes work without additional server configuration.

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

- `/?theme=light` or `/?theme=dark` selects a theme; otherwise the system theme applies.
- `/?tab=home`, `/?tab=chat`, `/?tab=wallets` and `/?tab=activity` open the main screens. The Wallets screen combines a simulated agent wallet with the real external-wallet connection.
- `/?view=strategy` opens the integrated swap selector.
- The previous `/?view=aqua` and `/?view=strategy&section=liquidity` links also open the integrated selector. They no longer open a separate liquidity tab.
- `/#onboarding` opens onboarding.

## Trading strategy

**Instant buy** spends an exact USDT amount for XAUH. **Instant sell** spends an exact XAUH amount for USDT. Target price buy, Weekly DCA, Reserve buy and Dip buy remain visible with **Soon** labels and disabled native radio inputs.

**Choose randomly with Quantis** is a local simulation without a connected Quantis device. It selects only Instant buy or Instant sell, with a 50% chance each; repeated choices are allowed. It never connects a wallet, approves tokens or submits a swap.

Buy and sell keep separate amount drafts while the screen remains open. Returning to the surrounding demo discards these inputs and quotes, while submitted operations remain in recovery storage. Save, Pause, Resume and Remove controls are not part of the instant swap workflow. The surrounding agent status and Activity remain simulated.

## Public Aqua configuration

The [public Sepolia configuration](src/live/aquaDeployment.ts) is defined in source code and compiled into the application JavaScript.

To change the deployment, update this file with the intended public contract settings and rebuild. It contains:

| Key                                                                              | Meaning                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `rpcUrl`                                                                         | Public Sepolia HTTP JSON-RPC endpoint, or a same-origin path to a read-only RPC service    |
| `chainId`                                                                        | Ethereum Sepolia, `11155111`                                                               |
| `router`, `registry`                                                             | SwapVM fork and its Aqua registry                                                          |
| `tokens.xauh`, `tokens.usdt`                                                     | ERC-20 token contracts                                                                     |
| `codeHashes.router`, `codeHashes.registry`, `codeHashes.xauh`, `codeHashes.usdt` | Keccak-256 fingerprints of the expected deployed runtime bytecode                          |
| `orders`                                                                         | Two objects containing ABI-encoded `encoded` orders, one for each supported pricing family |

The order programs determine the pricing type. Supported programs use Aqua authorization without hooks, constant-product pricing, optional concentration, optional input fees and optional salt. Each configured order must already be initialized for fee-on-transfer accounting and shipped to Aqua with active balances for both configured tokens. This interface does not deploy contracts or add/remove liquidity.

## Wallet and swap workflow

1. Select Instant buy or Instant sell, enter the exact input amount and choose slippage from 0 to 500 whole basis points. Each direction starts with a one-token preview amount. 50 basis points means 0.50%. Live quotes load without connecting a wallet, update 400 milliseconds after editing, and refresh every 15 seconds while the page is visible. Invalid amounts clear old results. Background pages and unresolved transactions pause refreshes.
2. Use **Connect wallet** on either the strategy or Wallets screen to request access to an injected Ethereum wallet. Both screens share its address, network, live balances and connection state. Reconnect after reloading the app; switching screens retains the existing connection. If needed, explicitly choose **Switch to Sepolia**. Disconnecting clears this app’s connection and quotes while preserving transaction recovery; it does not revoke wallet permissions. The wallet needs input tokens and Sepolia ETH to execute, but insufficient funds do not prevent price previews.
3. **Get live quotes** also refreshes manually. Both options are quoted at the same block for the same input: Constant-product AMM and Concentrated-liquidity AMM. Either is selectable. The highest net token receipt is highlighted; equal receipts are described as equivalent. Unavailable options show their own error and cannot execute.
4. Approve the exact input amount with a separate wallet confirmation. Reset an existing nonzero allowance with a separate confirmed action before changing it. Reconcile the approval; quotes refresh automatically afterward.
5. Choose **Buy XAUH** or **Sell XAUH**. The app refreshes balances, code fingerprints, token fees and allowances, simulates the selected call, estimates gas and asks the wallet to submit. The minimum net receipt and a deadline of 90 seconds from the quote block are encoded in taker traits. Quotes also expire locally.
6. Use **Reconcile transaction** to verify two canonical block confirmations, the saved sender/nonce/calldata, swap and registry events, and actual ERC-20 transfer deltas. Two confirmations are not consensus finality.

Public quotes use the configured RPC and require no wallet permission or balance. Anonymous quotes cannot authorize approvals or swaps. Connecting or changing accounts invalidates earlier quotes; executable quotes must be bound to the connected account. Every write still rechecks wallet identity, chain, balances, allowance, simulation and deadline. Automatic refresh performs read-only RPC calls.

The recommendation compares token output after listed swap and transfer fees. Network fees are additional and estimated by the wallet, so the highlighted option is not a comparison of total costs including gas. No synthetic reference price or fixed payment fee is applied.

### Token fees

The Sepolia fee token exposes `FEE_RATE()` and `FEE_PARTS()`. Fees use integer division: `floor(amount × rate / parts)`, following XAUH's proportional transfer-fee model. Unsupported rates or missing fee methods block readiness.

The configured fork's `quote()` and `Swapped` output represent the net receipt. The interface does not deduct transfer fees from this output again. For buys, XAUH moves from the maker to the buyer in one taxed transfer. Its displayed fee is estimated by reconstructing the gross output from the net quote. For sells, XAUH passes from the wallet to the router and then to the maker; both taxed transfers are shown separately, with the second fee calculated on the amount remaining after the first.

Fees are separate from any SwapVM input fee and ETH network fee. A successful receipt is checked against actual net transfers, including the maker's gross output debit and both sell-side deductions. Fee values can change before mining; minimum output and the deadline remain enforced by the submitted calldata.

### Transaction recovery

The app persists a public transaction identity before opening the wallet: chain, sender, nonce, destination and calldata. An unresolved operation blocks further writes across app tabs using Web Locks. Rejection, mined revert, replacement and unexpected receipt evidence are distinct outcomes. There are no automatic financial retries, private-key signing or wallet credential storage.

After reload, reconnect the submitting account and reconcile the pending operation. A hashless submission scans up to 40 mined blocks per action. Attach its transaction or replacement hash to locate it directly. A matching nonce with different calldata is a replacement, not a successful execution of the requested action. An absent receipt never authorizes resubmission. Resolve an unmined nonce in the wallet and reconcile its hash.

Only public operations are persisted. Quotes, balances and wallet credentials are not saved. Existing recovery journals are not cleared when navigating, selecting another strategy or refreshing the app. Previously confirmed receipts are checked for canonical block identity before another write.

## Development and validation

[Application state](src/App.tsx) composes [screens](src/screens/) and [shared components](src/components/). Simulated data remains in [demo fixtures](src/demo/fixtures.ts). The [shared wallet provider](src/live/SwapContext.tsx) retains the session across screen navigation. The [quote scheduler](src/live/useSwapQuotes.ts) debounces inputs and pauses automatic reads when appropriate. The [strategy screen](src/screens/TradingStrategyScreen.tsx) owns the selector, while the [swap panel](src/components/AquaSwapPanel.tsx), [execution comparison](src/components/AquaExecution.tsx), [configuration parser](src/live/swapConfig.ts), [swap model](src/live/swapModel.ts) and [wallet session](src/live/swapSession.ts) implement the separate Sepolia flow.

The SDKs are pinned to `@1inch/aqua-sdk` 0.3.0 and `@1inch/swap-vm-sdk` 0.4.0, with `viem` 2.57.13. Opcode numbers depend on the router version; ABI compatibility alone does not establish program compatibility. Runtime fingerprints must be reviewed when changing contracts. Vite resolves the SDK's `assert` dependency for browsers; Node-side SDK tests use CommonJS because of an extensionless ESM dependency import.

```sh
npx playwright install chromium
npm run format
npm run validate
```

Tests use synthetic deployments and browser wallets. They cover both pricing types and swap directions, separate token fees, finite approvals, stale quotes, context changes, receipt evidence and reload recovery. These checks do not establish a funded browser-wallet acceptance run. Use explicit wallet-confirmed swaps and reconcile their receipts for that verification.

If local cache or output directories are unavailable, `VITE_CACHE_DIR` and `PLAYWRIGHT_OUTPUT_DIR` can select alternative locations. See the [contributor guide](CONTRIBUTING.md) for formatting and editor setup. Installing dependencies enables the existing lint-and-format pre-commit hook.

## Deployment

GitHub Actions validates pull requests targeting `main` and pushes to `main`. Successful upstream pushes to `main` publish the validated static build. Publication requires separate authorization.

## License

Project code and included project assets, except the [Quantis device photograph](public/assets/quantis-device.webp), are available under the [MIT license](LICENSE). The Quantis photograph is provided for use in this application and is excluded from the project's MIT license. Rights to the photograph and the depicted branding remain with their respective rights holders. Dependencies retain their respective licenses. The project name and branding do not imply endorsement of derivatives.
