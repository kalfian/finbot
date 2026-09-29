"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordManager({ required }: { required: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmation) {
      setError("Password confirmation does not match.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Password could not be changed."); return; }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      if (required) {
        router.push("/");
        router.refresh();
      } else {
        setMessage("Password changed. Other browser sessions were logged out.");
      }
    } catch {
      setError("Password could not be changed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="settings-form" onSubmit={(event) => void submit(event)}>
    <div className="field"><label htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></div>
    <div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><p className="hint">Use 8-128 characters with at least one letter and one number.</p></div>
    <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {message && <p className="form-message success" role="status">{message}</p>}
    <button className="primary-button settings-submit" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Change password"}</button>
  </form>;
}
