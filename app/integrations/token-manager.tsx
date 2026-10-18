"use client";

import { FormEvent, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

type TokenInfo = { id: number; label: string; createdAt: string };

export default function TokenManager() {
  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenLabel, setTokenLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    void fetch("/api/tokens").then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.tokens) setTokens(body.tokens); else setTokenError("Tokens could not be loaded."); })
      .catch(() => setTokenError("Tokens could not be loaded."));
  }, []);

  async function generateToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTokenError("");
    try {
      const response = await fetch("/api/tokens", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: tokenLabel }),
      });
      const body = await response.json();
      if (!response.ok) { setTokenError(body.error); return; }
      setNewToken(body.token);
      setTokens((current) => [{ id: body.id, label: body.label, createdAt: new Date().toISOString() }, ...current]);
      setTokenLabel("");
    } catch {
      setTokenError("Token could not be created.");
    }
  }

  async function revokeToken(id: number) {
    if (!window.confirm("Revoke this token? Connected clients will lose access immediately.")) return;
    setTokenError("");
    try {
      const response = await fetch("/api/tokens", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      if (response.ok) setTokens((current) => current.filter((token) => token.id !== id));
      else setTokenError("Token could not be revoked.");
    } catch {
      setTokenError("Token could not be revoked.");
    }
  }

  return <section className="access-panel" aria-labelledby="access-heading">
    <p className="section-label">Credentials</p><h2 id="access-heading">API tokens</h2>
    <p className="access-copy">Create a token for the REST API and MCP. Store it securely; it is shown only once.</p>
    <form onSubmit={(event) => void generateToken(event)} className="token-form">
      <label htmlFor="token-label">Token name</label>
      <div><input id="token-label" value={tokenLabel} maxLength={80} onChange={(event) => setTokenLabel(event.target.value)} placeholder="e.g. Personal automation" required /><button className="download-button" type="submit">Generate token</button></div>
    </form>
    {newToken && <div className="issued-token" role="status"><p>Copy this token now. It will not be shown again.</p><code>{newToken}</code><button className="inline-button" type="button" onClick={() => { void navigator.clipboard.writeText(newToken); }}>Copy token</button><button className="inline-button" type="button" onClick={() => setNewToken("")}>Dismiss</button></div>}
    {tokenError && <p className="field-error" role="alert">{tokenError}</p>}
    <ul className="token-list">{tokens.map((token) => <li key={token.id}><span>{token.label}<small>Created {new Date(token.createdAt).toLocaleDateString()}</small></span><button type="button" onClick={() => void revokeToken(token.id)} aria-label={`Revoke ${token.label}`} title="Revoke token"><Trash2 size={16} aria-hidden="true" /></button></li>)}</ul>
  </section>;
}
