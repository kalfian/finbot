"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./components/ui-icon";
export default function AuthScreen({
  mode,
}: {
  mode: "configuration" | "login" | "setup";
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const setup = mode === "setup";
    try {
      const response = await fetch(
        setup ? "/api/auth/setup" : "/api/auth/login",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            setup ? { password, confirmation } : { password },
          ),
        },
      );
      if (!response.ok)
        throw Error(
          setup
            ? "Unable to create the administrator account."
            : "Unable to sign in. Check your password and try again.",
        );
      router.replace("/");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection unavailable. Please try again.",
      );
      setBusy(false);
    }
  }
  const setup = mode === "setup";
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
          <h1>
            {mode === "configuration"
              ? "Administrator configuration required"
              : setup
                ? "Create your local administrator"
                : "Sign in to your ledger"}
          </h1>
          <p className="muted">
            {mode === "configuration"
              ? "Set the server-only session secret, then restart the service to enable access."
              : setup
                ? "Create the only local administrator account. Your password must be at least 8 characters."
                : "This local dashboard is password protected."}
          </p>
          {mode !== "configuration" && (
            <form onSubmit={submit}>
              <label htmlFor="password">
                Password
                <input
                  id="password"
                  type="password"
                  autoComplete={setup ? "new-password" : "current-password"}
                  minLength={setup ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {setup && (
                <label htmlFor="password-confirmation">
                  Confirm password
                  <input
                    id="password-confirmation"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    required
                  />
                </label>
              )}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button disabled={busy}>
                {busy ? "Working…" : setup ? "Create administrator" : "Sign in"}
              </button>
            </form>
          )}
          <p className="auth-footnote">
            A personal space for your expenses. No bank connection required.
          </p>
        </section>
      </div>
    </main>
  );
}
