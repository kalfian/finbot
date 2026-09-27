# Expense Tracker

Expense Tracker is a local-first Next.js expense tracker backed by SQLite.

The app records expenses with an amount, description, category, and date/time. It includes a light/dark theme, filtered PDF reports, token-authenticated REST API, and Streamable HTTP MCP.

## Requirements

- Node.js 20.9 or newer
- npm

## Local setup

```bash
npm install
cp .env.example .env.local # optional; the default database path works without it
npm run db:init
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep the app bound to localhost: its UI and legacy routes have no account login.

The UI shows this month's spending and the all-time total, a searchable transaction list, and a calendar grouped by browser-local date. Search and optional dates jointly filter the list and downloaded PDF. Reports use Asia/Jakarta (UTC+7) calendar dates and IDR; the selected range includes both endpoints. The calendar remains independent. Theme preference persists in the browser.

Full REST and MCP documentation is available at [http://localhost:3000/docs](http://localhost:3000/docs). Generate and revoke integration tokens on the [Integrations page](http://localhost:3000/integrations). The raw token appears only once and is stored hashed; never paste it into a URL or commit it.

To run the production build locally:

```bash
npm run build
npm start
```

To run the complete test suite:

```bash
npm test
```

## Commands

- `npm run dev` — run the development server
- `npm run lint` — check the source with ESLint
- `npm run build` — create the production build
- `npm run db:init` — create the local SQLite file and initialize its schema
- `npm test` — run repository and API tests against isolated in-memory databases

## SQLite choice

The project uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), a synchronous native SQLite driver suited to a small local app that needs neither credentials nor an external service. `lib/database.ts` contains the shared SQLite implementation used by CLI initialization and opens `DATABASE_PATH`, defaulting to `./data/financial-tracker.db`. `lib/db.ts` is the Next.js server-only wrapper that re-exports it. Next.js externalizes the native module from server bundling, and database files are ignored by Git.

`npm run db:init` uses the shared implementation and creates the initial `expenses` table.

## Expense API

The browser uses the legacy local `GET`/`POST /api/expenses` endpoint. Integrations use token-authenticated `GET`/`POST /api/v1/expenses` with `Authorization: Bearer <TOKEN>`. The versioned GET supports optional `q`, `from`, and `to` parameters, with inclusive Asia/Jakarta YYYY-MM-DD dates. Both endpoints use the same JSON shape and validation.

`GET /api/expenses` returns expenses sorted by expense date newest first (with newest ID first when dates are equal):

```json
{
  "expenses": [
    {
      "id": 1,
      "amountCents": 1999,
      "description": "Lunch",
      "category": "Food",
      "date": "2026-02-14T12:34:00.000Z",
      "createdAt": "2026-02-14T12:34:56.789Z"
    }
  ]
}
```

`POST /api/expenses` accepts this JSON request body and returns `201 Created` with the created record in `{ "expense": ... }`:

```json
{
  "amountCents": 1999,
  "description": "Lunch",
  "category": "Food",
  "date": "2026-02-14T12:34:00.000Z"
}
```

Amounts are integer minor currency units (`1999` means IDR 19.99); they must be positive. `description` must be non-blank, `category` must be one of Food, Transport, Bills, Shopping, Health, or Other, and `date` must be an ISO UTC datetime. The browser form converts local date/time to UTC before saving. Invalid or malformed request bodies receive a JSON `{ "error": "..." }` response with status `400`.

## Data model

The `expenses` table stores `id`, `amount_cents`, `description`, `category`, `date`, and `created_at`. API responses expose the same values as `id`, `amountCents`, `description`, `category`, `date`, and `createdAt`. The database enforces non-null fields and a positive `amount_cents`; `created_at` is generated server-side as an ISO-8601 UTC timestamp. Older date-only rows remain readable.

## Security boundary

This is a single-user local application. The UI, legacy `/api/expenses`, PDF download, and local token-management endpoints have no user authentication. Tokens protect `/api/v1/expenses` and `/mcp` only. Do not expose the app beyond localhost without adding full app authentication and HTTPS.
