import { redirect } from "next/navigation";
import ThemeToggle from "../theme-toggle";
import { currentPageUser } from "@/lib/page-auth";
import LoginForm from "./login-form";

export const metadata = { title: "Login | Expense Tracker" };

export default async function LoginPage() {
  const user = await currentPageUser();
  if (user) redirect(user.mustChangePassword ? "/account" : "/");
  return <main className="auth-shell">
    <header className="auth-header"><div className="wordmark"><span className="wordmark-rule" aria-hidden="true" /><h1>Expense Tracker</h1></div><ThemeToggle /></header>
    <section className="auth-panel" aria-labelledby="login-heading">
      <div className="auth-copy"><p className="section-label">Private ledger</p><h2 id="login-heading">Login</h2><p>Each account has separate expenses, proofs, monthly limits, and integration tokens.</p></div>
      <LoginForm />
    </section>
  </main>;
}
