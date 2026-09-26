# Contributing

Use the [README](README.md) to install dependencies and run the app. Keep changes focused and use conventional commit messages when creating commits.

## Code organization

- Keep screen rendering in [screens](src/screens/) and reusable UI in [components](src/components/).
- Put synthetic data in [fixtures](src/demo/fixtures.ts) and shared types in [types](src/types.ts).
- Use native scrolling and form controls. Keep dialogs accessible and both themes readable.
- Keep the app responsive from 320px through desktop widths and respect safe areas and reduced motion.
- Keep all integrations simulated. Do not add credentials, real wallet addresses, personal data, internal URLs, or deployment identifiers.
- Prefer descriptive code over explanatory comments. Preserve any required dependency license notices.

## Linting and formatting

[Oxlint](https://oxc.rs/docs/guide/usage/linter) checks correctness and React hooks. [Oxfmt](https://oxc.rs/docs/guide/usage/formatter) formats code and documents using the shared project configuration. Run `npm run lint:fix` for safe lint fixes and `npm run format` to format the project.

`npm ci` installs the [Husky](https://typicode.github.io/husky/) pre-commit hook. On commit, [lint-staged](https://github.com/lint-staged/lint-staged) applies safe lint fixes to staged JavaScript and TypeScript, formats supported staged files, and stages those fixes. Unresolved lint errors block the commit. Review the resulting diff; unstaged changes remain outside the commit. The hook also works before the first commit. Generated output and the dependency lockfile are excluded from formatting.

## Format on save

- **VS Code:** install the recommended [Oxc extension](https://marketplace.visualstudio.com/items?itemName=oxc.oxc-vscode). The shared [workspace settings](.vscode/settings.json) select Oxfmt and enable format on save for supported project file types.
- **WebStorm:** install the official [Oxc plugin](https://plugins.jetbrains.com/plugin/27061-oxc). The shared [Oxfmt settings](.idea/OxfmtSettings.xml) select automatic project-local package discovery and enable formatting on save. Reopen the project if the settings are not picked up immediately. You can inspect them under **Settings > Tools > Oxfmt**.

Run `npm ci` first so both editors can use the pinned project-local tools and shared configuration. Only the shared formatting settings and extension recommendation are included in version control; personal editor state stays ignored.

## Validation

Run `npm run validate` before submitting changes. Add or update behavioral tests when changing interactions. Check affected screens at mobile, tablet, and desktop sizes in light and dark themes, including keyboard navigation and dialog dismissal.

Test output, dependencies, and builds are local artifacts excluded from version control. Never commit environment files or credentials.
