# Herculis XAUH Agent

An interactive, responsive demo of a gold-token agent experience. Explore Home, Chat, Wallets, Activity, onboarding, and four trading strategies in light or dark mode.

All balances, wallet addresses, messages, and transactions are synthetic. The demo does not connect to wallets, blockchains, Telegram, models, or a backend. Reloading resets the session. The displayed XAUH price is a demo reference value.

## Run locally

Use Node.js 20.19+ in the 20.x series, or Node.js 22.12+ (Node.js 24 recommended), and npm.

```sh
npm ci
npm run dev
```

Open the [local demo](http://127.0.0.1:4173). Click the coin in the header to change themes, restart onboarding, or explore additional demo states.

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

## Development

[Application state](src/App.tsx) composes the [screens](src/screens/) and [shared components](src/components/). [Demo fixtures](src/demo/fixtures.ts) hold example data, [types](src/types.ts) define the model, and [styles](src/styles.css) contain the visual presentation. [Browser hooks](src/hooks/browser.ts) handle the system theme and visible viewport.

Installing dependencies enables a pre-commit hook that applies safe lint fixes and formats staged files. See the [contributor guide](CONTRIBUTING.md) for editor setup, workflow, and validation details.

## License

Project code and included project assets are available under the [MIT license](LICENSE). Dependencies retain their respective licenses. The project name and branding do not imply endorsement of derivatives.
