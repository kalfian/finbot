# Ledger

A minimal, local-first expense-only financial tracker with a JSON API backed by SQLite.

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

Open [http://localhost:3000](http://localhost:3000). To expose the development server on the network, use `HOST=0.0.0.0 npm run dev`.

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

`GET /api/expenses` returns expenses sorted by expense date newest first (with newest ID first when dates are equal):

```json
{
  "expenses": [
    {
      "id": 1,
      "amountCents": 1999,
      "description": "Lunch",
      "date": "2026-02-14",
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
  "date": "2026-02-14"
}
```

Amounts are integer minor currency units (for example, `1999` means 19.99 in a two-decimal currency); they must be positive. `description` must be non-blank and `date` must be a valid `YYYY-MM-DD` date. Invalid or malformed request bodies receive a JSON `{ "error": "..." }` response with status `400`.

## Data model

The `expenses` table stores `id`, `amount_cents`, `description`, `date`, and `created_at`. API responses expose the same values as `id`, `amountCents`, `description`, `date`, and `createdAt`. The database enforces non-null fields and a positive `amount_cents`; `created_at` is generated server-side as an ISO-8601 UTC timestamp.
