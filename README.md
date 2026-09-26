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

## Development

[Application state](src/App.tsx) composes the [screens](src/screens/) and [shared components](src/components/). [Demo fixtures](src/demo/fixtures.ts) hold example data, [types](src/types.ts) define the model, and [styles](src/styles.css) contain the visual presentation. [Browser hooks](src/hooks/browser.ts) handle the system theme and visible viewport.

Installing dependencies enables a pre-commit hook that applies safe lint fixes and formats staged files. See the [contributor guide](CONTRIBUTING.md) for editor setup, workflow, and validation details.

## Deployment

GitHub Actions validates pull requests targeting `main` and pushes to `main`. Successful pushes in the upstream repository deploy the tested static build to the [Cloudflare Pages demo](https://herculis-xauh-agent-demo.pages.dev).

## License

Project code and included project assets are available under the [MIT license](LICENSE). Dependencies retain their respective licenses. The project name and branding do not imply endorsement of derivatives.
