"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Login failed.");
        return;
      }
      router.push(body.user.mustChangePassword ? "/account" : "/");
      router.refresh();
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="auth-form" onSubmit={(event) => void submit(event)}>
    <div className="field"><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus /></div>
    <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? "Logging in…" : "Login"}</button>
  </form>;
}
