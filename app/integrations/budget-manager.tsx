"use client";

import { FormEvent, useEffect, useState } from "react";
import { formatCurrency, toAmountCents } from "@/lib/money";

type Budget = { month: string; monthCents: number; monthlyLimitCents: number | null; remainingCents: number | null; exceeded: boolean };

export default function BudgetManager() {
  const [budget, setBudget] = useState<Budget | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/budget").then((response) => response.ok ? response.json() : null)
      .then((body) => { if (body?.budget) setBudget(body.budget); else setError("Monthly limit could not be loaded."); })
      .catch(() => setError("Monthly limit could not be loaded."));
  }, []);

  async function save(monthlyLimitCents: number | null) {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/budget", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyLimitCents }),
      });
      if (!response.ok) throw new Error();
      setBudget((await response.json()).budget);
      setAmount("");
    } catch {
      setError("Monthly limit could not be saved.");
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = toAmountCents(amount);
    if (cents === null) {
      setError("Enter a positive IDR amount; use a dot only for decimals.");
      return;
    }
    void save(cents);
  }

  return <section className="access-panel budget-panel" aria-labelledby="budget-heading">
    <p className="section-label">Spending</p><h2 id="budget-heading">Monthly limit</h2>
    <p className="access-copy">One recurring IDR limit for every calendar month in Asia/Jakarta. No limit is set by default.</p>
    {budget && <div className="budget-current" role="status">
      <div><span>Current limit</span><strong>{budget.monthlyLimitCents === null ? "Not set" : formatCurrency(budget.monthlyLimitCents)}</strong></div>
      <div><span>Spent in {budget.month}</span><strong>{formatCurrency(budget.monthCents)}</strong></div>
      {budget.remainingCents !== null && <div><span>{budget.exceeded ? "Over limit" : "Remaining"}</span><strong className={budget.exceeded ? "budget-over" : ""}>{formatCurrency(Math.abs(budget.remainingCents))}</strong></div>}
    </div>}
    <form className="token-form" onSubmit={handleSubmit}>
      <label htmlFor="monthly-limit">Monthly limit (IDR)</label>
      <div><input id="monthly-limit" type="text" inputMode="decimal" placeholder="2000000" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={pending} required />
        <button className="download-button" type="submit" disabled={pending}>Save limit</button></div>
    </form>
    {budget && budget.monthlyLimitCents !== null && <button className="inline-button budget-clear" type="button" onClick={() => void save(null)} disabled={pending}>Remove limit</button>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </section>;
}
