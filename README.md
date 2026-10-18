# Finbot

A personal expense tracker with a focused interface called **Ledger**. Record everyday spending in IDR, review totals, and find transactions without navigating a complex dashboard. Built with Next.js 16, React 19, TypeScript, and SQLite.

## Screenshots

Screenshots use synthetic transactions in an isolated database, captured from the production build. Both color themes are supported.

### Desktop · light

![Ledger desktop: monthly spending, category breakdown, and transaction history](docs/images/ledger-desktop-light.png)

### Desktop · dark

![Ledger desktop in dark mode](docs/images/ledger-desktop-dark.png)

### Mobile

<img src="docs/images/ledger-mobile.png" alt="Ledger mobile: spending overview, categories, and transaction history" width="390">

### Focused expense composer

![Ledger expense composer with amount, description, category, and date controls](docs/images/ledger-composer.png)

## What you can do

- Add, edit, delete, and undo deleted expenses with amount, description, category, and date/time.
- Check today's spending, this month's spending, the monthly transaction count, and actual spending by category.
- Choose a built-in category or create your own; use Now/Yesterday date shortcuts.
- Search descriptions and filter by category, dates, or amount. Browse results eight at a time.
- Download all matching expenses as a standalone HTML document.
- Switch between light and dark themes; the preference is saved in your browser.
- Protect the dashboard with one local administrator account; change your password or log out from Account.

Desktop uses a navigation rail, a monthly spending overview, and a searchable transaction list. Add/edit opens a focused dialog. Phone layouts stack the overview and category breakdown, with compact navigation and wrapping category controls. Typography is self-hosted Manrope and DM Serif Display. See [product and dashboard](docs/product-and-dashboard.md) for behavior and accessibility limits.

## Get started

Requires **Node.js 20.9+** and npm. `better-sqlite3` is a native dependency; installation may need a compiler toolchain if no prebuilt binary is available for your environment.

```bash
npm install
cp .env.example .env.local
```

Generate the local session secret directly into `.env.local`:

```bash
node -e 'const fs = require("node:fs"); const secret = require("node:crypto").randomBytes(48).toString("base64url"); fs.writeFileSync(".env.local", fs.readFileSync(".env.local", "utf8").replace(/^FINANCIAL_TRACKER_SESSION_SECRET=.*$/m, "FINANCIAL_TRACKER_SESSION_SECRET=" + secret));'
npm run dev -- --hostname 127.0.0.1
```

Open [localhost:3000](http://localhost:3000) and create your administrator account. The password must have at least eight characters. The app initializes its database on first access.

Keep `.env.local` private and retain the secret across restarts. Regenerating it signs existing sessions out. If it is missing or too short, the app displays a configuration screen. See [authentication and security](docs/auth-and-security.md).

### Database

`DATABASE_PATH` defaults to `./data/financial-tracker.db`. Set it in `.env.local` to use another path. The database contains transactions and account/session records; it is excluded from Git.

To initialize it explicitly with your configured path:

```bash
node --env-file=.env.local --import tsx scripts/init-db.ts
```

### Production build

```bash
npm run build
npm start -- --hostname 127.0.0.1
```

Use an intentionally configured reverse proxy and HTTPS when exposing the application beyond localhost. The app is designed for one local account; it has no password-reset email flow or automatic backups.

## Development and checks

| Command | Purpose |
| --- | --- |
| `npm run dev` | Next.js development server |
| `npm test` | Unit, repository, API, and authentication tests |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Type checking |
| `npm run build` | Production build and Next.js type checking |
| `npm run db:init` | Initialize SQLite using the shell's environment or default path |

The optional browser smoke test needs a separately provisioned `@playwright/test` and Chromium installation:

```bash
node tests/auth.e2e.mjs
# Or point to an existing Chromium binary:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chrome node tests/auth.e2e.mjs
```

It starts a temporary server with an isolated database and checks authentication, CRUD/undo, failed-save recovery, custom categories, export, filters, stale-response handling, pagination, dialog keyboard behavior, themes, and layout clipping at 320, 390, 768, and 1440 px. See [development and verification](docs/development-and-verification.md).

## API and project structure

Expense APIs require an authenticated browser session. Mutations also require the same-origin and CSRF protections used by the app. Amounts are integer minor units: `1250000` represents **Rp12,500.00**. Dates are validated date/time values; the interface converts local input to ISO timestamps.

- `app/expense-tracker.tsx`: entry form, totals, filters, transaction actions, and pagination.
- `lib/expense-recorder-design.ts`: shared styles for the dashboard and HTML export.
- `app/dashboard-shell.tsx`: account settings and theme controls.
- `lib/database.ts`: SQLite schema and initialization; `lib/db.ts` supplies the server connection.
- `app/api/`: authenticated route handlers.

See [API documentation](docs/api.md) and [data model](docs/data-model.md) for backend details. The repository also contains budget, recurring-plan, and portability APIs; these are not exposed in the focused expense dashboard.
