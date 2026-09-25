"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCreatedAt } from "@/lib/date-time";
import { saveExpense, validateExpenseForm } from "@/lib/expense-form";
import { calculateTotal, formatCurrency } from "@/lib/money";

type Expense = { id: number; amountCents: number; description: string; date: string; createdAt: string };

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");

  const loadExpenses = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/expenses");
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("expenses" in body) || !Array.isArray(body.expenses)) throw new Error();
      setExpenses(body.expenses as Expense[]);
    } catch {
      setLoadError("We couldn't load your expenses. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadExpenses);
  }, [loadExpenses]);
  const total = useMemo(() => calculateTotal(expenses.map((expense) => expense.amountCents)), [expenses]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSuccessMessage("");
    const validation = validateExpenseForm({ amount, description, date });
    if ("error" in validation) { setFormError(validation.error); return; }

    setIsSubmitting(true);
    try {
      await saveExpense(validation.value);
      setAmount(""); setDescription(""); setDate(""); setSuccessMessage("Expense added.");
      await loadExpenses();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't save this expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main>
    <nav aria-label="Primary navigation"><a className="wordmark" href="#top">Ledger<span>.</span></a><span className="nav-label">Expense tracker</span></nav>
    <header className="page-header" id="top"><p className="eyebrow">Your spending</p><h1>Every expense, in one place.</h1><p className="intro">Record what you spend and keep a clear view of your total.</p></header>
    <section className="tracker-grid" aria-label="Expense tracker">
      <section className="entry-panel" aria-labelledby="add-expense-heading">
        <h2 id="add-expense-heading">Add an expense</h2>
        <form onSubmit={handleSubmit} noValidate>
          <div className="field"><label htmlFor="amount">Amount (IDR)</label><div className="amount-input"><span aria-hidden="true">Rp</span><input id="amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="amount-hint" required /></div><p className="hint" id="amount-hint">Enter Indonesian Rupiah, including up to two decimal places.</p></div>
          <div className="field"><label htmlFor="description">Description</label><input id="description" name="description" type="text" placeholder="e.g. Groceries" value={description} onChange={(event) => setDescription(event.target.value)} required /></div>
          <div className="field"><label htmlFor="date">Date</label><input id="date" name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
          {formError && <p className="form-message error" role="alert">{formError}</p>}
          {successMessage && <p className="form-message success" role="status">{successMessage}</p>}
          <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding expense…" : "Add expense"}</button>
        </form>
      </section>
      <section className="expenses-panel" aria-labelledby="expenses-heading">
        <div className="expenses-heading"><div><p className="eyebrow">Total spend</p><p className="total">{formatCurrency(total)}</p></div><h2 id="expenses-heading">Expenses</h2></div>
        {isLoading ? <p className="state" role="status">Loading expenses…</p> : loadError ? <div className="state error" role="alert"><p>{loadError}</p><button className="text-button" type="button" onClick={() => void loadExpenses()}>Try again</button></div> : expenses.length === 0 ? <p className="state">No expenses recorded yet. Add your first one to get started.</p> : <ul className="expense-list">{expenses.map((expense) => <li key={expense.id}><div><p className="expense-description">{expense.description}</p><time dateTime={expense.date}>{expense.date}</time><br /><time dateTime={expense.createdAt}>Recorded locally: {formatCreatedAt(expense.createdAt)}</time></div><strong>{formatCurrency(expense.amountCents)}</strong></li>)}</ul>}
      </section>
    </section>
  </main>;
}
