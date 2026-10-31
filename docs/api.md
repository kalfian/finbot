# REST v1 and MCP

All financial endpoints require a login cookie or Bearer credential. Browser mutations use same-origin validation. Authorization, required password changes and user ownership are enforced server-side.

| Operation | Endpoint |
| --- | --- |
| Login | POST /api/auth/login with username/password |
| Change password | PUT /api/auth/password with currentPassword/newPassword |
| Logout | POST /api/auth/logout |
| List/create expenses | GET/POST /api/v1/expenses |
| Update/delete expense | PATCH/DELETE /api/v1/expenses/:id |
| List/attach proofs | GET/POST /api/v1/expenses/:id/proofs |
| Read proof content | GET /api/v1/expenses/:id/proofs/:proofId |
| Categories | GET/POST /api/v1/categories; PATCH/DELETE /api/v1/categories/:id |
| Tags | GET/POST /api/v1/tags; PATCH/DELETE /api/v1/tags/:id |
| Budget status/limit | GET/PUT /api/v1/budget |
| Filtered PDF | GET /api/v1/reports/pdf |
| Integration tokens | /api/tokens |
| Administrator user management | /api/users |
| Streamable HTTP MCP | /mcp |

Expense GET and the PDF report accept q, from, to, tag and untagged; q also matches tag names, tag selects one exact tag case-insensitively and untagged=true keeps expenses without tags. Dates use inclusive calendar days in the authenticated user's saved timezone. The new dashboard reads the full user-owned snapshot and derives transaction filters and pagination in the client; usage summaries come from /api/v1/usage. Those additional dashboard filters are not REST query parameters.

Create/PATCH require positive integer amountCents, description, a user-owned category and canonical UTC date. POST optionally accepts sourceId for idempotency. Both accept optional tags (array of names, at most 10; each 1-40 characters without commas, leading # stripped); unknown names are created. PATCH without tags keeps the current tags and [] clears them. Every Expense includes a sorted tags array.

GET /api/v1/tags returns { "tags": [{ id, name, createdAt, expenseCount, totalCents }] }; totals cover all dates. POST and PATCH take { "name" } and return 409 for a case-insensitive duplicate. DELETE removes the tag from every expense and keeps the expenses. Mutation responses include the affected expense and budget snapshot. Category objects include IDs and names; clients must use the signed-in user's category list rather than hardcoded defaults.

Proofs have a kind: file, text or link (at most three per expense across kinds). POST multipart/form-data with file (JPEG, PNG, WebP or PDF, 5 MB) for a file proof, or application/json { "kind": "text" | "link", "text", "sourceId"? } for text (1-2000 characters) or an http(s) URL without spaces. Proof metadata includes kind, and text/link proofs include textContent. Reading a proof returns file bytes, text/plain for text, or text/uri-list for link, always with nosniff and a sandbox CSP.

Old /api/expenses and the prototype's unversioned category-budget, recurring-plan and portability routes are absent. See the [README contract table](../README.md), [MCP specification](mcp-end-to-end.md), and [Hermes guide](hermes-agent.md) for full integration examples and error behavior.

## Display timezone and usage

`GET /api/v1/settings` returns `{ "settings": { "timezone": "Asia/Jakarta" } }` with no-store caching. `PUT` accepts `{ "timezone": "America/New_York" }` and returns the same shape. Valid named IANA zones and UTC are accepted; invalid values return 400 without changing the setting. Same-origin checks apply to browser writes; JWT and generated tokens use normal ownership checks. No userId field can select another user's settings.

`GET /api/v1/usage?date=YYYY-MM-DD` returns `{ "usage": { "timezone", "date", "weekStartsOn": "monday", "day", "week", "month" } }`. Omit date for today in that timezone. Each period includes inclusive local `start`/`end`, integer `totalCents`, `transactionCount`, and category totals/counts/percentages. Week is Monday-Sunday, including across month/year boundaries. Invalid dates return 400; missing authentication returns 401. Forced-password-change restrictions remain in force.

Expense GET and MCP list/summary responses identify the timezone; all date filtering follows it. Budget snapshots add timezone, weekCents, weekStart and weekEnd while retaining previous fields. Monthly limits now use the account's timezone month. PDF timestamps/filter bounds and HTML export timestamps use the same preference. UTC expense date/createdAt values remain unchanged.

The display setting does not change expense-create/PATCH semantics: those still require UTC instants. Web date/time entry is explicitly device-local, with existing UTC conversion. Settings change no transaction dates or amounts.
