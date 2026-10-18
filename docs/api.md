# API reference

All endpoints are same-origin Next.js route handlers and return JSON unless noted. Every ledger, budget, plan, portability, and rules endpoint requires an authenticated request. State-changing endpoints also require the current session's CSRF request header and same-origin validation. See [local authentication and security](auth-and-security.md).

Amounts use positive integer minor units. Supported categories are Food, Transport, Bills, Shopping, Health, and Other. Datetimes must be canonical ISO-8601 UTC instants with millisecond precision.

## Expenses

### `GET /api/expenses`

Returns a page ordered by date descending then ID descending. Optional query parameters are `start`, `end`, `priorStart`, `priorEnd`, `category`, `search`, `minAmountCents`, `maxAmountCents`, `limit`, and `offset`.

- `start` is inclusive and `end` is exclusive. Both must be supplied together when defining a range, and end must be later than start.
- `search` case-insensitively matches the expense description and is limited to 120 characters.
- `priorStart` and `priorEnd` must be supplied together and are used only for the prior-period summary.
- `limit` is from 1 through 100; `offset`, amounts, and IDs are non-negative or positive integers as appropriate.
- The response includes `expenses`, `totalCount`, `totalCents`, `insights.categories`, `insights.months`, and `summary`. Summary includes current totals plus nullable prior totals.

An expense object contains `id`, `amountCents`, `description`, `category`, `date`, and `createdAt`.

### `POST /api/expenses`

Creates an expense and returns `201` with `{ "expense": ... }`. Required fields are `amountCents`, non-blank `description`, supported `category`, and UTC `date`. Optional `tags` is an array of unique non-empty strings up to 50 characters after normalization. Optional `splits` is an array of `{ "category", "amountCents" }`; its positive amounts must add up to the expense amount.

If submitted category is Other, the first matching description categorization rule may replace it before storage.

### `PUT /api/expenses`

Updates one expense. Send the positive `id` plus the same core fields required by POST. Returns the updated object or `404` when the ID is absent. Core updates do not replace tags or splits.

### `DELETE /api/expenses`

Deletes one expense by positive `id`; returns the deleted core object or `404`. The UI uses this endpoint for undoing a newly added expense.

## Category budgets

### `GET /api/category-budgets?month=YYYY-MM`

Returns `{ "month", "budgets" }`, with a summary for every supported category. Each summary includes configured target, spend, remaining/overspent values, percentage, and threshold state; fields that require a configured target are null when no target exists.

### `PUT` or `POST /api/category-budgets`

Upserts `{ "category", "month", "amountCents" }` and returns `{ "budget": ... }`. Month must be a real `YYYY-MM` value and amount must be positive.

## Recurring expenses

### `GET /api/recurring-expenses`

Returns active plans in `{ "recurringExpenses": [...] }`, ordered by next due time. Add `includeInactive=true` to include paused plans, with active plans first.

### `POST /api/recurring-expenses`

Creates a plan and returns `201`. Required fields are description, category, `frequency` (`weekly` or `monthly`), `nextDueAt`, and `amountType` (`fixed` or `variable`). Fixed plans require positive `amountCents`; variable plans require `amountCents` to be null.

### `PUT /api/recurring-expenses`

Updates a plan with its positive `id`, all POST fields, and boolean `active`.

### `PATCH /api/recurring-expenses`

Completes one occurrence. Send `id`, `expectedNextDueAt`, and a positive `amountCents` only for a variable plan. A successful completion returns `201` with the advanced `recurringExpense` and created ledger `expense`. A stale, paused, missing, or insufficiently specified occurrence returns `409`.

### `DELETE /api/recurring-expenses`

Removes a plan by positive `id` and returns it, or `404`.

## Portability and categorization rules

### `GET /api/portability`

Returns all ledger records as a downloadable CSV response. It uses `text/csv`, requests download as `expenses.csv`, and disables response caching.

### `POST /api/portability`

Send `{ "action": "preview" | "import", "csv": "..." }`. Preview returns valid rows, validation errors, and duplicate row numbers without writes. Import returns the same plus `imported`; it returns `422` when errors or duplicates block the whole import.

### `GET /api/categorization-rules`

Returns `{ "rules": [...] }` in precedence order.

### `POST /api/categorization-rules`

Creates a rule from `matchType` (`description` or `merchant`), non-empty `pattern` up to 120 characters, and supported `category`. Returns `201`.

### `PUT /api/categorization-rules`

Replaces precedence with `{ "ids": [positive integer, ...] }` and returns the ordered rules. The IDs must represent the existing rule set; invalid orderings return `400`.

### `DELETE /api/categorization-rules`

Deletes a rule by positive `id`; returns `{ "ok": true }` or `404`.

## Authentication endpoints

- `POST /api/auth/setup` accepts a confirmed initial password on a fresh database and, on successful same-origin setup, creates the sole account and establishes a session.
- `POST /api/auth/login` accepts a password and, on successful same-origin login, establishes a session.
- `GET /api/auth/session` returns the current CSRF value for an authenticated session, otherwise `401`.
- `POST /api/auth/password` changes an existing password after verifying the current password; use the dashboard rather than scripting this route.
- `POST /api/auth/logout` revokes the active session and clears its browser cookie.

Validation failures generally return `{ "error": "..." }` with `400`; authentication failures use `401`, CSRF/origin failures use `403`, missing resources use `404`, and unexpected failures use `500`.
