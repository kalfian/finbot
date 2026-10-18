"use client";
import { type ReactNode, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/client-fetch";
import { Icon } from "./components/ui-icon";
import { Modal } from "./components/modal";
type Theme = "light" | "dark";
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem("ledger-theme", theme);
  } catch {
    /* The theme still works when browser storage is unavailable. */
  }
}
export default function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user: { username: string; role: "admin" | "user" };
}) {
  const [settings, setSettings] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const [section, setSection] = useState("overview");
  useEffect(() => {
    const preferred =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const frame = requestAnimationFrame(() => {
      setTheme(preferred);
      update();
    });
    const update = () =>
      setSection(
        location.hash === "#transactions" ? "transactions" : "overview",
      );
    window.addEventListener("hashchange", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", update);
    };
  }, []);
  function toggleTheme() {
    const value = theme === "dark" ? "light" : "dark";
    setTheme(value);
    applyTheme(value);
  }
  function closeSettings() {
    setSettings(false);
    setCurrent("");
    setNext("");
    setNotice("");
  }
  async function logout() {
    setBusy(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw Error();
      location.reload();
    } catch {
      setNotice("Unable to log out. Please try again.");
      setBusy(false);
    }
  }
  async function change(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await apiFetch("/api/auth/password", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) throw Error();
      location.reload();
    } catch {
      setNotice(
        "Unable to update password. Check your current password and try again.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link" href="#overview">
        Skip to dashboard
      </a>
      <aside className="app-rail" aria-label="Main navigation">
        <a className="app-name" href="#overview">
          <span className="brand-mark">
            <Icon name="wallet" size={24} />
          </span>
          ledger<span className="brand-dot">.</span>
        </a>
        <span className="rail-caption">PERSONAL SPACE</span>
        <nav className="rail-nav">
          <a
            href="#overview"
            aria-current={section === "overview" ? "location" : undefined}
          >
            <Icon name="overview" />
            Overview
          </a>
          <a
            href="#transactions"
            aria-current={section === "transactions" ? "location" : undefined}
          >
            <Icon name="list" />
            Transactions
          </a>
          <a href="/activity">
            <Icon name="list" />
            Calendar &amp; reports
          </a>
          <a href="/integrations">
            <Icon name="account" />
            Integrations
          </a>
          {user.role === "admin" && (
            <a href="/users">
              <Icon name="account" />
              Users
            </a>
          )}
        </nav>
        <div className="rail-note">
          <span className="note-line" />
          <p>
            A little more clarity.
            <br />A lot more possibility.
          </p>
          <Icon name="arrow" size={26} />
        </div>
        <div className="rail-bottom">
          <button
            className="theme-toggle rail-control"
            type="button"
            aria-pressed={theme === "dark"}
            onClick={toggleTheme}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <button
            className="rail-control account-button"
            type="button"
            aria-haspopup="dialog"
            onClick={() => setSettings(true)}
          >
            <Icon name="account" />
            <span>Account</span>
          </button>
          <span className="rail-footnote">A home for everyday spending.</span>
        </div>
      </aside>
      <div className="dashboard-content">{children}</div>
      <Modal
        open={settings}
        onClose={closeSettings}
        title="Account"
        id="account"
        busy={busy}
      >
        <p className="muted">
          Signed in as {user.username}. Manage your account password.
        </p>
        <form onSubmit={change} className="account-form">
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              data-autofocus
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
            <small>8-128 characters, including a letter and a number.</small>
          </label>
          {notice && (
            <p className="form-message error" role="alert">
              {notice}
            </p>
          )}
          <button disabled={busy}>
            {busy ? "Working..." : "Update password"}
          </button>
        </form>
        <button
          type="button"
          className="text-button delete-button logout-button"
          disabled={busy}
          onClick={() => void logout()}
        >
          Log out
        </button>
      </Modal>
    </>
  );
}
