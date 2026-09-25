"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { formatCreatedAt, formatExpenseDate } from "@/lib/date-time";
import { EXPENSE_CATEGORIES, getBrowserLocalDateTime, saveExpense, validateExpenseForm } from "@/lib/expense-form";
import { calculateTotal, formatCurrency } from "@/lib/money";

type Expense = { id: number; amountCents: number; description: string; category: string; date: string; createdAt: string };
type FieldName = "amount" | "description" | "category" | "date";

export default function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [invalidField, setInvalidField] = useState<FieldName | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Food");
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDate(getBrowserLocalDateTime()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const total = useMemo(() => calculateTotal(expenses.map((expense) => expense.amountCents)), [expenses]);

  function clearFieldError(field: FieldName) {
    if (invalidField === field) {
      setInvalidField(null);
      setFormError("");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setInvalidField(null);
    setSuccessMessage("");
    const validation = validateExpenseForm({ amount, description, category, date });
    if ("error" in validation) {
      setFormError(validation.error);
      setInvalidField(validation.error.startsWith("Enter an amount") ? "amount" : validation.error.startsWith("Enter a description") ? "description" : validation.error.startsWith("Choose a category") ? "category" : "date");
      return;
    }

    setIsSubmitting(true);
    try {
      await saveExpense(validation.value);
      setAmount(""); setDescription(""); setCategory("Food"); setDate(getBrowserLocalDateTime()); setSuccessMessage("Expense added.");
      await loadExpenses();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "We couldn't save this expense. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setAmount("");
    setDescription("");
    setCategory("Food");
    setDate(getBrowserLocalDateTime());
    setFormError("");
    setInvalidField(null);
    setSuccessMessage("");
  }

  return <main>
    <header className="tracker-intro"><h1>Expense tracker</h1><p>Add an expense and see your current total.</p></header>
    <section className="tracker-grid" aria-label="Expense tracker">
      <section className="entry-panel" aria-labelledby="add-expense-heading">
        <h2 id="add-expense-heading">Add an expense</h2>
        <form onSubmit={handleSubmit} onReset={handleReset} noValidate>
          <div className="field"><label htmlFor="amount">Amount (IDR)</label><div className="amount-input"><span aria-hidden="true">Rp</span><input id="amount" name="amount" type="text" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => { setAmount(event.target.value); clearFieldError("amount"); }} aria-describedby={invalidField === "amount" ? "amount-hint form-error" : "amount-hint"} aria-invalid={invalidField === "amount"} required /></div><p className="hint" id="amount-hint">Enter Indonesian Rupiah, including up to two decimal places.</p></div>
          <div className="field"><label htmlFor="description">Description</label><input id="description" name="description" type="text" placeholder="e.g. Groceries" value={description} onChange={(event) => { setDescription(event.target.value); clearFieldError("description"); }} aria-describedby={invalidField === "description" ? "form-error" : undefined} aria-invalid={invalidField === "description"} required /></div>
          <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" value={category} onChange={(event) => { setCategory(event.target.value); clearFieldError("category"); }} aria-describedby={invalidField === "category" ? "form-error" : undefined} aria-invalid={invalidField === "category"} required>{EXPENSE_CATEGORIES.map((expenseCategory) => <option key={expenseCategory} value={expenseCategory}>{expenseCategory}</option>)}</select></div>
          <div className="field"><label htmlFor="date">Date and time</label><input id="date" name="date" type="datetime-local" step="60" value={date} onChange={(event) => { setDate(event.target.value); clearFieldError("date"); }} aria-describedby={invalidField === "date" ? "date-hint form-error" : "date-hint"} aria-invalid={invalidField === "date"} required /><p className="hint" id="date-hint">Your local time is saved as UTC and displayed in your timezone.</p></div>
          {formError && <p className="form-message error" id="form-error" role="alert">{formError}</p>}
          {successMessage && <p className="form-message success" role="status">{successMessage}</p>}
          <div className="form-actions"><button type="submit" disabled={isSubmitting}>{isSubmitting ? "Adding expense…" : "Add expense"}</button><button className="secondary-button" type="reset" disabled={isSubmitting}>Clear form</button></div>
        </form>
      </section>
      <section className="expenses-panel" aria-labelledby="expenses-heading">
        <div className="expenses-heading"><div><p className="eyebrow">Current total</p><p className="total">{formatCurrency(total)}</p></div><h2 id="expenses-heading">Expenses</h2></div>
        {isLoading ? <p className="state" role="status">Loading expenses…</p> : loadError ? <div className="state error" role="alert"><p>{loadError}</p><button className="text-button" type="button" onClick={() => void loadExpenses()}>Try again</button></div> : expenses.length === 0 ? <p className="state">No expenses recorded yet. Add your first one to get started.</p> : <ul className="expense-list">{expenses.map((expense) => <li key={expense.id}><div><p className="expense-description">{expense.description}</p><p className="expense-category">{expense.category}</p><time dateTime={expense.date}>Expense time: {formatExpenseDate(expense.date)}</time><br /><time dateTime={expense.createdAt}>Recorded: {formatCreatedAt(expense.createdAt)}</time></div><strong>{formatCurrency(expense.amountCents)}</strong></li>)}</ul>}
      </section>
    </section>
  </main>;
}
