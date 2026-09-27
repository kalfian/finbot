import Link from "next/link";
import TokenManager from "./token-manager";
import ThemeToggle from "../theme-toggle";

export const metadata = { title: "Integrations | Expense Tracker" };

export default function Integrations() {
  return <main className="integrations-shell">
    <header className="site-header">
      <Link className="wordmark" href="/"><span className="wordmark-rule" aria-hidden="true" /><span>Expense Tracker</span></Link>
      <div className="header-actions"><ThemeToggle /><Link href="/" className="header-link">Back to activity</Link></div>
    </header>
    <div className="integrations-heading"><p className="section-label">Settings</p><h1>Integrations</h1><p>Manage access for external tools on this device.</p></div>
    <div className="integrations-grid">
      <TokenManager />
      <section className="integration-guide" aria-labelledby="connection-heading">
        <p className="section-label">Connect</p><h2 id="connection-heading">REST API & MCP</h2>
        <p>Use a generated token as a Bearer credential. REST provides filtered expenses and creation; MCP adds summary and PDF export tools.</p>
        <div className="integration-endpoint"><span>REST API</span><code>/api/v1/expenses</code></div>
        <div className="integration-endpoint"><span>MCP endpoint</span><code>/mcp</code></div>
        <Link href="/docs" className="docs-link">Read full API and MCP documentation →</Link>
      </section>
    </div>
  </main>;
}
