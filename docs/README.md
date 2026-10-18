# Financial Tracker documentation

This documentation describes the Financial Tracker implementation in this repository. It is a local, single-user Ledger application: a Next.js dashboard backed by SQLite, with password-gated local access.

| Document | Covers |
| --- | --- |
| [Product and dashboard](product-and-dashboard.md) | Product direction, navigation, responsive layout, accessibility, and dashboard behavior |
| [Ledger guide](ledger-guide.md) | Expenses, periods, filters, reporting, budgets, plans, calendar, CSV, rules, tags, and splits |
| [API reference](api.md) | JSON and CSV endpoints, query parameters, request rules, and response shapes |
| [Data model](data-model.md) | SQLite location, initialization, schema, migrations, and data conventions |
| [Local authentication and security](auth-and-security.md) | Secure setup, local operations, sessions, request protection, and recovery considerations |
| [Development and verification](development-and-verification.md) | Prerequisites, commands, automated tests, browser checks, and release verification |

## Scope and terminology

- Amounts are positive integer minor units in the API and database. The browser formats them as Indonesian rupiah (IDR) with two fractional digits.
- Ledger timestamps are ISO-8601 UTC instants. Browser `datetime-local` inputs are converted from the viewer's local time before saving.
- The supported expense categories are Food, Transport, Bills, Shopping, Health, and Other.
- This is local-first storage, not a hosted multi-account service. Back up the SQLite database before operating on it outside the application.

The root [README](../README.md) is retained for the repository's original quick-start context. These documents reflect the current implemented dashboard and APIs.
