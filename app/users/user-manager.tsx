"use client";

import { FormEvent, useState } from "react";

type User = { id: number; username: string; role: "admin" | "user"; mustChangePassword: boolean; createdAt: string };

export default function UserManager({ initialUsers }: { initialUsers: User[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "User could not be created."); return; }
      setUsers((current) => [...current, body.user]);
      setUsername("");
      setPassword("");
      setMessage(`User ${body.user.username} created. They must change the temporary password after login.`);
    } catch {
      setError("User could not be created. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="user-grid">
    <section className="settings-card" aria-labelledby="create-user-heading"><h2 id="create-user-heading">Create user</h2><p className="settings-copy">New accounts are standard users and must replace their temporary password on first login.</p>
      <form className="settings-form" onSubmit={(event) => void submit(event)}>
        <div className="field"><label htmlFor="new-username">Username</label><input id="new-username" value={username} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9._-]{3,40}" required /></div>
        <div className="field"><label htmlFor="temporary-password">Temporary password</label><input id="temporary-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><p className="hint">Use 8-128 characters with at least one letter and one number.</p></div>
        {error && <p className="form-message error" role="alert">{error}</p>}
        {message && <p className="form-message success" role="status">{message}</p>}
        <button className="primary-button settings-submit" type="submit" disabled={submitting}>{submitting ? "Creating…" : "Create user"}</button>
      </form>
    </section>
    <section className="settings-card" aria-labelledby="users-heading"><h2 id="users-heading">Users</h2><ul className="user-list">{users.map((user) => <li key={user.id}><div><strong>{user.username}</strong><span>{user.role === "admin" ? "Administrator" : "User"}</span></div><small>{user.mustChangePassword ? "Password change required" : "Active"}</small></li>)}</ul></section>
  </div>;
}
