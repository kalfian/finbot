import Link from "next/link";
import AccountNav from "../account-nav";
import ThemeToggle from "../theme-toggle";
import { requirePageUser } from "@/lib/page-auth";
import { createUserRepository } from "@/lib/auth";
import { getDatabase } from "@/lib/db";
import UserManager from "./user-manager";

export const metadata = { title: "Users | Expense Tracker" };

export default async function UsersPage() {
  const user = await requirePageUser({ admin: true });
  const users = createUserRepository(getDatabase()).list();
  return <main className="settings-shell">
    <header className="site-header"><Link className="wordmark" href="/"><span className="wordmark-rule" aria-hidden="true" /><span>Expense Tracker</span></Link><div className="header-actions"><ThemeToggle /><AccountNav username={user.username} role={user.role} /></div></header>
    <section className="settings-panel"><div className="settings-heading"><p className="section-label">Administration</p><h1>User access</h1><p>Accounts own separate financial records and integration credentials.</p></div><UserManager initialUsers={users} /></section>
  </main>;
}
