import Link from "next/link";
import AccountNav from "../account-nav";
import ThemeToggle from "../theme-toggle";
import { requirePageUser } from "@/lib/page-auth";
import PasswordManager from "./password-manager";

export const metadata = { title: "Account | Expense Tracker" };

export default async function AccountPage() {
  const user = await requirePageUser({ allowPasswordChange: true });
  return <main className="settings-shell">
    <header className="site-header"><Link className="wordmark" href="/"><span className="wordmark-rule" aria-hidden="true" /><span>Expense Tracker</span></Link><div className="header-actions"><ThemeToggle /><AccountNav username={user.username} role={user.role} /></div></header>
    <section className="settings-panel" aria-labelledby="account-heading">
      <div className="settings-heading"><p className="section-label">Signed in as {user.username}</p><h1 id="account-heading">Account</h1><p>Role: {user.role === "admin" ? "Administrator" : "User"}</p></div>
      {user.mustChangePassword && <div className="security-notice" role="alert"><strong>Password change required</strong><p>Replace the temporary password before accessing financial data or creating API tokens.</p></div>}
      <div className="settings-card"><h2>Change password</h2><PasswordManager required={user.mustChangePassword} /></div>
    </section>
  </main>;
}
