# Project guide

Read the [README](README.md) and [contributor guide](CONTRIBUTING.md) before editing.

- Preserve the full-page responsive layout, native scrolling, and native inputs.
- Keep all wallet, transaction, chat, and account behavior simulated.
- Separate screens, shared components, demo fixtures, and types.
- Preserve accessible dialogs, theme contrast, and browser safe-area handling.
- Keep project source free of comments, personal data, task references, and internal infrastructure details. Preserve required third-party notices.
- Run `npm run format` after edits, then `npm run validate`, and visually inspect affected interactions before handoff.
- Keep Oxlint and Oxfmt configuration authoritative for linting and formatting. Preserve automatic formatting on save and on commit.
- Do not publish or deploy without an explicit request.
- Use conventional commit messages when commits are requested.
