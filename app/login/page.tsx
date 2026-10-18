import { redirect } from "next/navigation";
import { currentPageUser } from "@/lib/page-auth";
import { Icon } from "../components/ui-icon";
import LoginForm from "./login-form";

export const metadata = { title: "Login | Ledger" };
export default async function LoginPage() {
  const user = await currentPageUser();
  if (user) redirect(user.mustChangePassword ? "/account" : "/");
  return (
    <main className="auth-screen">
      <aside className="auth-story">
        <div className="app-name">
          <span className="brand-mark">
            <Icon name="wallet" size={24} />
          </span>
          ledger<span className="brand-dot">.</span>
        </div>
        <div className="auth-story-content">
          <h2>
            Small moments.
            <br />A clearer picture.
          </h2>
          <p>
            A coffee, a journey, a little something for yourself. Give everyday
            spending a place to belong.
          </p>
        </div>
        <small>Your money. Your perspective.</small>
      </aside>
      <div className="auth-form-wrap">
        <section>
          <p className="eyebrow">WELCOME TO YOUR PERSONAL LEDGER</p>
          <h1>Sign in to your ledger</h1>
          <p className="muted">
            Your expenses, receipts, and integrations stay private to your
            account.
          </p>
          <LoginForm />
          <p className="auth-footnote">
            A personal space for your expenses. No bank connection required.
          </p>
        </section>
      </div>
    </main>
  );
}
