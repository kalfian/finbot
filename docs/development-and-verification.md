# Development and verification

## Prerequisites and local run

Use Node.js 20.9 or newer and npm. Install dependencies with `npm install`, configure local authentication as described in [local authentication and security](auth-and-security.md), initialize SQLite with `npm run db:init`, and run the development server with `npm run dev`.

Useful package commands:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run db:init` | Initialize or migrate the configured SQLite database |
| `npm run lint` | Run ESLint over the repository |
| `npm test` | Run the TypeScript Node test files under `tests/` |
| `npm run build` | Create the production Next.js build |
| `npm start` | Serve the production build |

The Next.js configuration explicitly externalizes the native SQLite package for server bundling and permits the configured development origins for Next client assets. Do not assume the production server is exposed on the network; bind and proxy it deliberately.

## Automated test coverage

`npm test` exercises money and form conversion, periods, expense validation/repository/API behavior, dashboard summaries/filters, calendar utilities, authentication, user isolation, category management, proofs, PDF, budgets, API tokens, migrations and MCP contracts. Timezone regressions cover per-user settings, UTC immutability, Monday/month/year boundaries, DST transitions and fractional offsets. The test suite uses isolated in-memory SQLite databases where appropriate.

`tests/auth.e2e.mjs` is a separate browser smoke test for administrator setup, sign-in/out, password changes, CRUD/undo, failed-save recovery, custom categories, export, filters, stale responses, pagination, keyboard dialogs, reduced motion, viewport overflow, timezone persistence/regrouping, mobile navigation and dark-theme control contrast. It creates an isolated temporary database and generated runtime-only session material, then starts the development server. It is not part of the `npm test` glob and relies on a locally available Playwright installation/browser; Playwright is a development dependency; provision Chromium with npx playwright install chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.

`tests/hydration-acceptance.mjs` is also an ad hoc browser script, not part of the package test command. It targets a pre-running base URL and a Chromium executable. Its selectors predate the current password-gated dashboard and should be updated before it is treated as a required acceptance check.

## Recommended verification sequence

1. Start from a clean dependency installation and a disposable database path.
2. Run `npm test`, `npm run lint`, and `npm run build`; each must exit successfully.
3. Run `npm start` after a successful build and manually complete configuration, first-run administrator setup, sign-out, and a subsequent sign-in.
4. Create, edit, delete, and undo an expense. Check search/category/date/amount filters, pagination, and HTML export.
5. Check the actual monthly category breakdown, empty states, failed-save feedback, and Account settings.
6. Resize from desktop to phone width, use navigation, keyboard focus, Escape dismissal, and a reduced-motion preference.

Run tests/integration-smoke.mjs against a separate fresh disposable server with TEST_BASE_URL and TEST_PDF_PATH to exercise JWT/generated tokens, multiple users, PDF and MCP over HTTP. It changes the bootstrap password and creates synthetic records; never target production.

## Documentation maintenance

When behavior changes, update the matching document in this directory in the same change. In particular, keep the API field rules synchronized with `lib/*-api.ts`, table descriptions synchronized with `lib/database.ts`, and dashboard limitations synchronized with `app/expense-tracker.tsx` and `app/dashboard-shell.tsx`. This repository currently has no documentation-specific test convention, so this documentation update adds no synthetic docs test.
