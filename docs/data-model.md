# SQLite data model

`DATABASE_PATH` selects the SQLite file (default data/financial-tracker.db). Initialization in lib/database.ts enables foreign keys and retains upstream migration logic. Private proof bytes live in proofs/ beside the database; back up both consistently.

| Table | Purpose |
| --- | --- |
| users | Username, role, password hash, forced password change and login lockout |
| sessions | Revocable user login sessions |
| app_secrets | Persistent signing material |
| expenses | User-owned amount, description, category and UTC timestamps |
| expense_categories | User-owned category names |
| expense_proofs | Receipt metadata linked to expenses; bytes in private storage |
| expense_sources | Per-user idempotency/source mappings |
| budget_settings | Per-user recurring monthly spending limit |
| api_tokens | User-owned generated integration token hashes |

Amounts are integer minor units: 1250050 means Rp12,500.50. Expenses are ordered by date then ID descending. Repository operations require an authenticated user ID; cross-user records are not returned or mutated. Deletion removes the expense's proof metadata/files and source mappings.

Dashboard summaries and pagination are derived in the browser from the authenticated REST v1 expense snapshot. They introduce no tables or schema migrations. Retired prototype category-budget, recurring-plan, CSV/rule/tag/split and single-account tables are not part of this release's API model.
