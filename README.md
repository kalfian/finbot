# Ledger

A minimal, local-first foundation for an expense-only financial tracker. Entering or reporting expenses is intentionally not implemented yet.

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

## SQLite choice

The project uses [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), a synchronous native SQLite driver suited to a small local app that needs neither credentials nor an external service. `lib/database.ts` contains the shared SQLite implementation used by CLI initialization and opens `DATABASE_PATH`, defaulting to `./data/financial-tracker.db`. `lib/db.ts` is the Next.js server-only wrapper that re-exports it. Next.js externalizes the native module from server bundling, and database files are ignored by Git.

`npm run db:init` uses the shared implementation and creates the initial `expenses` table.
