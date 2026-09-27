import Link from "next/link";
import ThemeToggle from "../theme-toggle";

export const metadata = { title: "API documentation | Expense Tracker" };

export default function Docs() {
  return <main className="docs-shell">
    <div className="docs-top"><Link href="/integrations" className="docs-link">← Integrations</Link><ThemeToggle /></div>
    <header><p className="section-label">Integrations</p><h1>API & MCP documentation</h1><p>Local expense records, one-time API tokens, and a Streamable HTTP MCP endpoint.</p></header>
    <nav aria-label="Documentation sections"><a href="#authentication">Authentication</a><a href="#expenses">Expenses API</a><a href="#report">PDF report</a><a href="#tokens">Token management</a><a href="#mcp">MCP</a><a href="#security">Security</a></nav>
    <section id="authentication"><h2>Authentication</h2><p>Generate a token on the <Link href="/integrations">Integrations page</Link>. The raw value appears once. Send it as <code>Authorization: Bearer &lt;TOKEN&gt;</code> to <code>/api/v1/expenses</code> and <code>/mcp</code>. Missing, invalid, and revoked tokens receive HTTP 401. Never put a token in a URL.</p></section>
    <section id="expenses"><h2>Expenses API</h2>
      <h3>GET /api/v1/expenses</h3><p>Lists records sorted by date descending, then ID descending. Optional URL parameters: <code>q</code> searches description or category (case-insensitive); <code>from</code> and <code>to</code> are inclusive dates in Asia/Jakarta, formatted YYYY-MM-DD. Either bound may be omitted. Response: <code>{"{ \"expenses\": [Expense, ...] }"}</code>.</p>
      <h3>POST /api/v1/expenses</h3><p>Send <code>Content-Type: application/json</code>. Returns HTTP 201 and <code>{"{ \"expense\": Expense }"}</code>. Validation errors return HTTP 400 with <code>{"{ \"error\": \"...\" }"}</code>.</p>
      <pre>{`curl -H "Authorization: Bearer <TOKEN>" \\
  "http://localhost:3000/api/v1/expenses?q=Food&from=2026-09-01&to=2026-09-30"

curl -X POST "http://localhost:3000/api/v1/expenses" \\
  -H "Authorization: Bearer <TOKEN>" \\
  -H "Content-Type: application/json" \\
  -d '{"amountCents":1500000,"description":"Lunch","category":"Food","date":"2026-09-24T05:00:00.000Z"}'`}</pre>
      <p><code>Expense</code> contains <code>id</code> (number), <code>amountCents</code> (positive integer; IDR minor units), <code>description</code> (string), <code>category</code> (Food, Transport, Bills, Shopping, Health, Other), <code>date</code> (ISO UTC datetime), and <code>createdAt</code> (server-generated ISO UTC datetime). A value of 1500000 cents represents IDR 15,000.00. The UI uses standard Rupiah formatting.</p>
    </section>
    <section id="report"><h2>PDF report</h2><p><code>GET /api/reports/pdf</code> downloads an A4 landscape PDF. It accepts the same <code>q</code>, <code>from</code>, and <code>to</code> filters. Empty bounds mean all dates; the report rows match the filtered list. No token is required for this local UI endpoint. Content type is <code>application/pdf</code>; invalid ranges receive HTTP 400.</p></section>
    <section id="tokens"><h2>Token management</h2><p>Local UI endpoints only: <code>GET /api/tokens</code> lists IDs, names and creation dates, never secrets. <code>POST /api/tokens</code> with <code>{"{ \"label\": \"Personal automation\" }"}</code> returns HTTP 201 with <code>id</code>, <code>label</code>, and the one-time <code>token</code>. <code>DELETE /api/tokens</code> with <code>{"{ \"id\": 1 }"}</code> immediately revokes it. Names must be 1–80 characters. These endpoints require a localhost request and reject cross-origin browser writes.</p></section>
    <section id="mcp"><h2>MCP over Streamable HTTP</h2><p>Configure your MCP client with URL <code>http://localhost:3000/mcp</code> and header <code>Authorization: Bearer &lt;TOKEN&gt;</code>. Each POST request is stateless; JSON responses are supported. GET and DELETE return 405 after authentication. No SSE sessions are maintained.</p><p>Tools: <code>list_expenses</code> accepts optional <code>query</code>, <code>from</code>, <code>to</code>; <code>create_expense</code> accepts the same fields as the REST POST; <code>expense_summary</code> accepts optional filters and returns <code>count</code>, <code>totalCents</code>, and per-category totals; <code>export_report_pdf</code> returns an embedded base64 PDF resource with the same filters. Dates use UTC+7 boundaries. Non-PDF tool results are JSON text.</p>
      <pre>{`{
  "mcpServers": {
    "expense-tracker": {
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer <TOKEN>" }
    }
  }
}`}</pre>
    </section>
    <section id="security"><h2>Security boundary</h2><p>This is a single-user local app, not a multi-user hosted service. The browser UI, legacy <code>/api/expenses</code>, and PDF route have no login. API tokens protect only <code>/api/v1/expenses</code> and <code>/mcp</code>; anyone with access to the local app can read records and create or revoke tokens. Keep the server bound to localhost; do not expose it to a network or the public internet without adding full application authentication and transport security. Tokens are stored as SHA-256 hashes in SQLite, and revocation takes effect immediately.</p></section>
  </main>;
}
