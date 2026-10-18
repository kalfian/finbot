# SQLite data model

## Storage and initialization

The Node.js runtime uses `better-sqlite3`. `DATABASE_PATH` selects the SQLite file; when it is absent the resolved default is `data/financial-tracker.db` below the process working directory. Parent directories are created automatically. Run `npm run db:init` to create the file and apply the additive initialization/migration logic.

The database is a local operational asset. Stop the service or use a SQLite-consistent backup method before copying it. Do not commit database files or environment files containing access material.

## Tables

| Table | Purpose | Key fields |
| --- | --- | --- |
| `expenses` | Core immutable-ID ledger records, whose non-ID fields may be edited | positive `amount_cents`, `description`, `category`, UTC `date`, UTC `created_at` |
| `category_budgets` | One positive monthly target per category | composite primary key `category, month`, amount, created/updated UTC timestamps |
| `recurring_expenses` | Planned, separately managed recurring records | nullable amount plus fixed/variable type, description, category, weekly/monthly frequency, due UTC time, active flag, audit timestamps |
| `expense_tags` | Optional tag rows for an expense | expense ID plus tag, unique per expense/tag |
| `expense_splits` | Optional categorized allocations for an expense | expense ID, category, positive amount, ordered position |
| `categorization_rules` | Ordered automatic-category rules | match type, pattern, category, unique position, creation UTC time |
| `auth_account` | One local account's password verifier | fixed primary key, verifier, audit timestamps |
| `auth_sessions` | Server-side, revocable session records | opaque ID, CSRF verifier, expiry/revocation and creation timestamps |
| `auth_throttle` | Per-scope failed-login counters and temporary lock time | scope primary key, attempts, lock time, update timestamp |

The schema declares cascading foreign-key relationships from tags and splits to expenses, plus indexes for tag lookup, split ordering, rule ordering, recurring due scans, and session expiry. Verify the SQLite connection's foreign-key enforcement setting before relying on cascade behavior for external maintenance; application deletes do not manually clean metadata.

## Integrity rules

- Expense, split, budget, and fixed recurring amounts must be positive integer minor units.
- Categories are validated by application code against the six supported values. The database keeps category text rather than a separate category table.
- Tags are one to 50 characters at schema level and are deduplicated by application validation.
- Split position is non-negative and unique per expense. The application enforces that all split totals equal the parent expense amount.
- Recurring amount consistency is enforced by a database check: fixed plans have a positive amount and variable plans have no stored amount.
- Rule match type is constrained to description or merchant, and recurring frequency to weekly or monthly.

## Existing-database migration behavior

Initialization is intentionally additive. It creates missing feature tables and adds a default Other category column to prior expense tables. For an older ledger that used `spent_on` instead of `date`, it performs a table rebuild, migrates the records with Other as category, and then creates the newer feature tables. Recurring plans created before amount type support are rebuilt as fixed plans while preserving their original values.

Run initialization against a copy first when upgrading an important local database, then inspect record counts and a CSV export. There is no down-migration command.

## Time and money conventions

The API and database use canonical UTC ISO datetimes. Presentation converts values to the browser's local time for entry, reporting periods, and the calendar. Money enters the browser as decimal IDR notation, is converted to integer minor units for storage, and is formatted with the `id-ID` locale and IDR currency. No currency code or exchange-rate table exists; this is a single-currency presentation.
