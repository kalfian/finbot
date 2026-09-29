# Expense Tracker

A local-first expense tracker for everyday spending. Record, edit, and delete expenses in a focused web UI, search by description or category, filter by date, explore a calendar, and download a matching PDF. Deleting an expense also removes its source mapping and private proof files. An external agent such as Hermes can use the token-authenticated REST API or MCP endpoint to turn a chat message into a recorded expense and a verified budget reply.

Attach receipt photos or PDFs as proof to new or existing expenses. Up to three files per expense, 5 MiB each; files stay on this machine.

> Multi-user authentication isolates each account's expenses, proofs, monthly limit, source IDs, and API tokens. The bootstrap administrator is `admin` with temporary password `123456`; the app forces a password change before any financial access. Keep the service private unless you also provide HTTPS and production-grade network controls.

## Preview

These screenshots use **synthetic demo expenses** from September 2026; they are not real financial records.

![Desktop activity view in light mode showing monthly total, searchable expenses, and entry form](docs/screenshots/desktop-light.png)

| OLED calendar and selected day | Integrations and monthly limit |
| --- | --- |
| ![Dark calendar with expenses grouped by day and selected-day details](docs/screenshots/calendar-dark.png) | ![Dark Integrations page with monthly limit, token controls, and API links](docs/screenshots/integrations-dark.png) |

![Responsive mobile activity view with expenses and filters](docs/screenshots/mobile.png)

## Run locally

Requires Node.js 20.9+ and npm.

```bash
npm ci
npm run db:init
npm run dev
```

Open <http://localhost:3000>, sign in as `admin` with temporary password `123456`, and replace it when prompted. Administrators can create standard users from the Users page; administrators manage accounts but do not automatically see another user's financial data. SQLite lives at `./data/financial-tracker.db` by default; set `DATABASE_PATH` to use another local file. Proof files live in `proofs/` beside the database; back up both together. Database files, proof files, and local environment files are ignored by Git. To run the production build locally, use `npm run build` and `npm start`.

The app has six categories (`Food`, `Transport`, `Bills`, `Shopping`, `Health`, `Other`). List search and optional dates filter the downloaded PDF too. Report dates use inclusive Asia/Jakarta (UTC+7) days; the calendar groups records by the browser's local date. Set one recurring monthly IDR limit and manage one-time API tokens on [Integrations](http://localhost:3000/integrations).

## Connect an LLM agent

Expense Tracker is the **system of record**, not a chat bot or OCR service. The agent owns message intake, interpretation, authorized-user checks, optional photo understanding, and replies. It must write through the API/MCP and use returned numbers—not generate totals itself.

For a message `Seblak 10.000`, a successful agent extracts `Seblak` / `Food` / IDR 10,000, sends `amountCents: 1000000`, and uses the message timestamp converted to ISO UTC. It sends a stable `sourceId` for retries, then formats the returned expense ID and budget snapshot as a chat reply. If the amount or receipt total is unclear, it asks before writing.

```text
Chat message → authorized agent → POST /api/v1/expenses or MCP create_expense
                                      ↓
                    { expense, replayed, budget }
                                      ↓
                    Agent formats the confirmed reply
```

Start here:

1. Set a monthly limit on [Integrations](http://localhost:3000/integrations), if wanted. No limit is configured by default.
2. Generate an integration token there and store it in the agent's secret store. A token acts only on the issuing user's records. Send `Authorization: Bearer <TOKEN>` to `/api/v1/*` or `/mcp`; never put the token in a URL, prompt, screenshot, log, or commit.
3. Give the agent [the Hermes implementation guide](docs/hermes-agent.md). It contains the message/photo decision flow, example request/response, reference reply code, category mapping, clarification rules, idempotent retries, and security boundaries.
4. Restrict the chat adapter to authorized senders. Run it on the same device or through a private authenticated connection; app login does not replace HTTPS or network hardening.

### Agent contract at a glance

| Capability | REST | MCP |
| --- | --- | --- |
| Record and get post-write budget snapshot | `POST /api/v1/expenses` | `create_expense` |
| Attach, list, and read receipt proof | `/api/v1/expenses/:id/proofs` | `attach_expense_proof`, `list_expense_proofs`, `get_expense_proof` |
| Search and list | `GET /api/v1/expenses?q=&from=&to=` | `list_expenses` |
| Read daily/monthly spending and limit | `GET /api/v1/budget?date=YYYY-MM-DD` | `budget_status` |
| Set or clear recurring limit | `PUT /api/v1/budget` | `set_monthly_limit` |
| Category summary and PDF tool | — | `expense_summary`, `export_report_pdf` |

The REST create body requires positive integer `amountCents` (IDR minor units), non-blank `description`, a supported `category`, and exact UTC `date` (`YYYY-MM-DDTHH:mm:ss.sssZ`). Optional `sourceId` identifies the incoming chat message. A first write returns HTTP 201; an identical retry returns HTTP 200 with `replayed: true`; reusing an ID for different fields returns HTTP 409. `budget` includes Jakarta `date`/`month`, `todayCents`, `monthCents`, `monthlyLimitCents`, signed `remainingCents`, and `exceeded`. An unset limit returns `null` for the limit and remaining amount; exceeding a limit informs the user but never blocks recording.

For a receipt, upload one file at a time after creating the expense via token-authenticated multipart `POST /api/v1/expenses/:id/proofs`, or use MCP `attach_expense_proof` with base64 bytes. Pass a stable proof `sourceId` for safe retries. List metadata and fetch bytes through the respective proof endpoints/tools. No OCR is performed; the agent may interpret a photo itself before recording the expense.

The MCP endpoint is Streamable HTTP at `http://localhost:3000/mcp`, authenticated by the same Bearer token. See the in-app [API & MCP documentation](http://localhost:3000/docs) for parameter details. The unversioned `/api/expenses` and `/api/reports/pdf` serve the browser session; they require login cookies instead of Bearer tokens.

## Development

```bash
npm test
npm run lint
npm run build
```

The app uses Next.js, React, and SQLite via `better-sqlite3`. `npm run db:init` initializes or migrates the local schema without erasing existing expenses. Older date-only records remain readable. `budget_settings` holds the recurring limit; `expense_sources` maps chat source IDs to recorded expenses. Tests use isolated in-memory databases. If you switch Node versions after installing dependencies, reinstall or rebuild the native SQLite module for that runtime.

The web UI uses database-backed sessions. API tokens protect the versioned REST endpoints and MCP and inherit the issuing user's ownership scope. Passwords are scrypt hashes, session and API secrets are stored only as hashes, and five failed logins lock an account for 15 minutes.
