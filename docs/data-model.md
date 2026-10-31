# SQLite data model

`DATABASE_PATH` selects the SQLite file (default data/financial-tracker.db). Initialization in lib/database.ts enables foreign keys and retains upstream migration logic. Private proof bytes live in proofs/ beside the database; back up both consistently.

| Table | Purpose |
| --- | --- |
| user_settings | Per-user IANA display/grouping timezone; defaults to Asia/Jakarta |
| users | Username, role, password hash, forced password change and login lockout |
| sessions | Revocable user login sessions |
| app_secrets | Persistent signing material |
| expenses | User-owned amount, description, category and UTC timestamps |
| expense_categories | User-owned category names |
| tags | User-owned tag names, case-insensitively unique per user |
| expense_tags | Expense-to-tag links; cascade when either side is deleted |
| expense_proofs | Proofs linked to expenses; kind is file (bytes in private storage), text or link (content in text_content, no file) |
| expense_sources | Per-user idempotency/source mappings |
| budget_settings | Per-user recurring monthly spending limit |
| api_tokens | User-owned generated integration token hashes |

Amounts are integer minor units: 1250050 means Rp12,500.50. Expenses are ordered by date then ID descending. Repository operations require an authenticated user ID; cross-user records are not returned or mutated. Deletion removes the expense's proof metadata/files and source mappings.

Dashboard summaries and pagination are derived in the browser from the authenticated REST v1 expense snapshot. The timezone feature adds user_settings with a foreign key to users; no expense timestamp migration occurs. Tags are additive labels beside the single category, created by initialization on existing databases without changing expenses. Retired prototype category-budget, recurring-plan, CSV/rule/split and single-account tables are not part of this release's API model.
