# Ledger guide

## Transactions, periods, and filters

Transactions contain amount, description, category, occurrence time, and recorded time. The ledger orders them by occurrence time descending, then ID descending. The dashboard loads ten matching records per page and supplies Previous/Next controls only when another page exists.

Choose Today, Last 7 days, This month, or Custom range. Date ranges are calculated from the browser's local calendar and sent as UTC boundaries; custom ranges are inclusive of the selected end date. The overview shows total spend, transaction count, average per active day, and the difference from the immediately preceding equivalent range. Category, minimum amount, and maximum amount filters apply to the transaction list, totals, category breakdown, monthly trend, and prior-period comparison. Changing scope or filters returns to the first page.

The amount filters accept the same positive decimal entry format as expense forms. Empty filters are ignored. The application has no free-text search at present.

## Reports

Category breakdown ranks categories by the active filtered scope, with transaction count, spend share, and total. Selecting a category row sets the category filter for the ledger. Monthly trend totals the same scope grouped by `YYYY-MM`; it is text-based rather than a canvas chart.

## Category budgets

Budgets are monthly category targets, not constraints on creating expenses. They are available only when the selected period is exactly one complete local calendar month: This month or a custom range that starts on day one and ends at the following month boundary.

Save one positive target per category and month. Existing targets are updated rather than duplicated. The budget view always lists every supported category. A category with no target is reported as `No budget`, never as a zero budget. Target states are on track below 80%, near limit from 80% to below 100%, at limit at 100%, and overspent above 100%.

Budget spend is calculated from all ledger expenses in that UTC calendar-month interval, regardless of the current transaction category or amount filters.

## Recurring plans

Recurring plans are separate from the ledger until marked paid. A plan has description, category, weekly or monthly frequency, active/paused state, next due UTC time, and either:

- Fixed amount: stores one positive planned amount.
- Variable amount: stores no planned amount and requires a positive paid amount when recording an occurrence.

Marking a paid active plan atomically creates one normal ledger expense at its due time and advances the plan. Weekly plans advance seven UTC days. Monthly plans advance one UTC month and clamp dates such as the 31st to the final day of a shorter month. The request includes the expected due time, so a stale duplicate completion is rejected instead of producing another expense. Plans can be paused, resumed, or removed. The overview lists up to three active plans ordered by due time and identifies overdue, due-soon (within seven days), and upcoming plans.

## Calendar

The calendar is a Sunday-first local-calendar month grid. Previous and Next change the viewed month; selecting a date shows loaded expense details and active plans due that day. Plan markers include their due state.

Expense markers are intentionally bounded by the loaded transaction page and active filters, while plan markers come from active plans. Use ledger pagination and filters with that distinction in mind; the calendar is not a complete unfiltered historical query.

## CSV, tags, splits, and rules

Open `More tools: CSV, rules, tags and splits` to reach the local-data utilities.

### CSV portability

Export downloads all ledger expenses, including tags and splits, as CSV. The exact header and column order are:

```text
amountCents,description,category,date,tags,splits
```

- `amountCents` is a positive integer minor-unit amount.
- `date` is an ISO UTC datetime.
- `tags` uses a vertical bar between tags.
- `splits` uses `Category:amountCents` entries separated by vertical bars.

Paste CSV for preview before importing. The parser supports standard quoted commas, quote escaping, and newlines. The import accepts at most 2,000,000 characters. It checks every row, detects duplicates against both the upload and existing ledger using amount, description, and date, and performs no writes if any invalid or duplicate row exists. A valid import is one database transaction, so an unexpected write failure rolls back all imported rows.

### Tags and splits

The tagged split form creates one expense with optional comma-separated tags and two editable split rows. Tags are trimmed, deduplicated, non-empty, and limited to 50 characters. Every split requires a supported category and positive integer minor-unit amount; split totals must exactly equal the parent expense amount.

Tags and splits are persisted and round-trip through CSV. They are not displayed in the normal transaction list or returned as fields of the normal expense response. Editing the parent transaction changes its core fields only; use export before database-level maintenance if metadata preservation matters.

### Categorization rules

Rules match case-insensitive substrings in saved order; the first match wins. Create description or merchant rules, move them earlier/later to change precedence, and remove them through the API. When a normal expense is created with category Other, the server applies the first matching description rule.

Merchant rules are stored and are available to the repository helper when a merchant value is supplied by a caller. The present browser form and expense POST body do not include a merchant field, so merchant rules do not auto-categorize ordinary dashboard-created expenses.
