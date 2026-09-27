"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Download, List, Plus, Search, X } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { formatExpenseDate } from "@/lib/date-time";
import {
  buildCalendarDays,
  getLocalDateKey,
  groupExpensesByLocalDate,
  shiftLocalMonth,
  startOfLocalMonth,
  summarizeLocalMonth,
  type CalendarExpense,
} from "@/lib/expense-calendar";
import { EXPENSE_CATEGORIES, getBrowserLocalDateTime, saveExpense, validateExpenseForm } from "@/lib/expense-form";
import { calculateTotal, formatCurrency } from "@/lib/money";
import { filterReportExpenses, validateReportRange } from "@/lib/expense-filters";

type Expense = CalendarExpense;
type FieldName = "amount" | "description" | "category" | "date";
type ActivityView = "list" | "calendar";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(year, month - 1, day));
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activityView, setActivityView] = useState<ActivityView>("list");
  const [currentMonth, setCurrentMonth] = useState(() => startOfLocalMonth(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => startOfLocalMonth(new Date()));
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [reportError, setReportError] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const listTabRef = useRef<HTMLButtonElement>(null);
  const calendarTabRef = useRef<HTMLButtonElement>(null);

  const loadExpenses = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/expenses");
      const body: unknown = await response.json();
      if (!response.ok || !body || typeof body !== "object" || !("expenses" in body) || !Array.isArray(body.expenses)) {
        throw new Error();
      }
      setExpenses(body.expenses as Expense[]);
      return true;
    } catch {
      setLoadError("We couldn't load your expenses. Please try again.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadExpenses);
  }, [loadExpenses]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDate(getBrowserLocalDateTime());
      const localMonth = startOfLocalMonth(new Date());
      setCurrentMonth(localMonth);
      setCalendarMonth(localMonth);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const total = useMemo(() => calculateTotal(expenses.map((expense) => expense.amountCents)), [expenses]);
  const monthlySummary = useMemo(() => summarizeLocalMonth(expenses, currentMonth), [expenses, currentMonth]);
  const validRange = validateReportRange(reportStart, reportEnd);
  const filteredExpenses = useMemo(() => filterReportExpenses(expenses, {
    query: searchQuery, start: reportStart, end: reportEnd,
  }), [expenses, searchQuery, reportStart, reportEnd]);
  const expensesByDay = useMemo(() => groupExpensesByLocalDate(expenses), [expenses]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonth), [calendarMonth]);
  const selectedDayExpenses = selectedDayKey ? expensesByDay.get(selectedDayKey) ?? [] : [];
  const selectedDayTotal = calculateTotal(selectedDayExpenses.map((expense) => expense.amountCents));
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(calendarMonth);
  const currentMonthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(currentMonth);
  const maxDayTotal = Math.max(1, ...calendarDays.filter((day): day is Date => day !== null).map((day) => (
    calculateTotal((expensesByDay.get(getLocalDateKey(day)) ?? []).map((expense) => expense.amountCents))
  )));
  const reportCount = filteredExpenses.length;

  function clearFieldError(field: FieldName) {
    if (invalidField === field) {
      setInvalidField(null);
      setFormError("");
    }
  }

  function fieldError(field: FieldName) {
    return invalidField === field ? <p className="field-error" id={`${field}-error`} role="alert">{formError}</p> : null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setInvalidField(null);
    setSuccessMessage("");
    const validation = validateExpenseForm({ amount, description, category, date });
    if ("error" in validation) {
      const field = validation.error.startsWith("Enter an amount") ? "amount"
        : validation.error.startsWith("Enter a description") ? "description"
          : validation.error.startsWith("Choose a category") ? "category" : "date";
      setFormError(validation.error);
      setInvalidField(field);
      ({ amount: amountRef, description: descriptionRef, category: categoryRef, date: dateRef })[field].current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      await saveExpense(validation.value);
      setAmount("");
      setDescription("");
      setCategory("Food");
      setDate(getBrowserLocalDateTime());
      const savedDate = new Date(validation.value.date);
      setCalendarMonth(startOfLocalMonth(savedDate));
      setSelectedDayKey(getLocalDateKey(savedDate));
      const refreshed = await loadExpenses();
      setSuccessMessage(refreshed ? "Expense added." : "Expense saved, but the list couldn't refresh. Try again below.");
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

  function moveCalendarMonth(offset: number) {
    setCalendarMonth((month) => shiftLocalMonth(month, offset));
    setSelectedDayKey(null);
  }

  function focusForm() {
    amountRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    amountRef.current?.focus({ preventScroll: true });
  }

  async function downloadReport() {
    if (!validRange) return;
    setReportError("");
    const params = new URLSearchParams({ q: searchQuery, from: reportStart, to: reportEnd });
    try {
      const response = await fetch(`/api/reports/pdf?${params}`);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `expense-tracker_${reportStart || "all"}_${reportEnd || "all"}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setReportError("PDF could not be downloaded. Please try again.");
    }
  }

  function handleViewKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "list" : event.key === "End" ? "calendar"
      : activityView === "list" ? "calendar" : "list";
    setActivityView(next);
    (next === "list" ? listTabRef : calendarTabRef).current?.focus();
  }

  return <main className="tracker-shell">
    <header className="site-header">
      <div className="wordmark"><span className="wordmark-rule" aria-hidden="true" /><h1>Expense Tracker</h1></div>
      <div className="header-actions">
        <Link className="header-link" href="/integrations">Integrations</Link>
        <ThemeToggle />
        <button className="header-action" type="button" onClick={focusForm}><Plus size={17} aria-hidden="true" /> Add expense</button>
      </div>
    </header>

    <section className="overview" aria-label="Spending overview">
      <div className="overview-primary">
        <p className="section-label">Spending this month</p>
        <p className="overview-amount total">{formatCurrency(monthlySummary.totalCents)}</p>
        <p className="overview-caption">{currentMonthLabel} <span aria-hidden="true">/</span> {monthlySummary.count} {monthlySummary.count === 1 ? "expense" : "expenses"}</p>
      </div>
      <div className="overview-secondary">
        <p className="section-label">All-time spending</p>
        <p className="lifetime-amount">{formatCurrency(total)}</p>
        <p className="overview-caption">{expenses.length} {expenses.length === 1 ? "expense" : "expenses"} recorded</p>
      </div>
    </section>

    <div className="tracker-grid">
      <section className="expenses-panel" aria-labelledby="expenses-heading">
        <div className="panel-heading">
          <div><p className="section-label">Your records</p><h2 id="expenses-heading">Activity</h2></div>
          <div className="view-switch" role="tablist" aria-label="Activity view" onKeyDown={handleViewKeys}>
            <button ref={listTabRef} id="list-tab" type="button" role="tab" tabIndex={activityView === "list" ? 0 : -1} aria-selected={activityView === "list"} aria-controls="list-panel" onClick={() => setActivityView("list")}><List size={16} aria-hidden="true" /> List</button>
            <button ref={calendarTabRef} id="calendar-tab" type="button" role="tab" tabIndex={activityView === "calendar" ? 0 : -1} aria-selected={activityView === "calendar"} aria-controls="calendar-panel" onClick={() => setActivityView("calendar")}><CalendarDays size={16} aria-hidden="true" /> Calendar</button>
          </div>
        </div>
        {!isLoading && !loadError && <div className="filter-panel" aria-label="Expense and report filters">
          <div className="expense-search">
            <label htmlFor="expense-search">Search expenses and report</label>
            <div className="search-control"><Search size={18} aria-hidden="true" />
              <input id="expense-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Description or category" />
              {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search" title="Clear search"><X size={17} aria-hidden="true" /></button>}
            </div>
          </div>
          <div className="filter-dates">
            <div className="report-date"><label htmlFor="report-start">From (UTC+7)</label><input id="report-start" type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} /></div>
            <div className="report-date"><label htmlFor="report-end">To (UTC+7)</label><input id="report-end" type="date" value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} /></div>
          </div>
          <p className="filter-hint">List and PDF use these filters; the calendar shows all activity.</p>
          {!validRange && <p className="report-note error" role="alert">Choose valid dates, with the end on or after the start.</p>}
          {(searchQuery || reportStart || reportEnd) && <button className="inline-button" type="button" onClick={() => { setSearchQuery(""); setReportStart(""); setReportEnd(""); }}>Clear filters</button>}
        </div>}
        {isLoading ? <p className="state" role="status">Loading expenses…</p>
          : loadError ? <div className="state error" role="alert"><p>{loadError}</p><button className="inline-button" type="button" onClick={() => void loadExpenses()}>Try again</button></div>
            : <>
              <div id="list-panel" role="tabpanel" aria-labelledby="list-tab" hidden={activityView !== "list"}>
                {expenses.length === 0 ? <div className="empty-state"><p>No expenses recorded yet.</p><button className="inline-button" type="button" onClick={focusForm}>Add your first expense</button></div> : <>
                  <p className="result-count" role="status">{`${filteredExpenses.length} of ${expenses.length} expenses`}</p>
                  {filteredExpenses.length === 0
                    ? <div className="empty-state"><p>No expenses match your filters.</p><button className="inline-button" type="button" onClick={() => { setSearchQuery(""); setReportStart(""); setReportEnd(""); }}>Clear filters</button></div>
                    : <ul className="expense-list">{filteredExpenses.map((expense) => <li key={expense.id}>
                      <div className="expense-main"><p className="expense-description">{expense.description}</p><div className="expense-meta"><span>{expense.category}</span><time dateTime={expense.date}>{formatExpenseDate(expense.date)}</time></div></div>
                      <strong>{formatCurrency(expense.amountCents)}</strong>
                    </li>)}</ul>}
                </>}
              </div>
              <div id="calendar-panel" role="tabpanel" aria-labelledby="calendar-tab" hidden={activityView !== "calendar"}>
                <div className="calendar-heading">
                  <div><h3 id="calendar-heading">{monthLabel}</h3><p>{summarizeLocalMonth(expenses, calendarMonth).count} expenses this month</p></div>
                  <div className="calendar-navigation">
                    <button type="button" onClick={() => moveCalendarMonth(-1)} aria-label="Previous month" title="Previous month"><ChevronLeft size={18} aria-hidden="true" /></button>
                    <button type="button" onClick={() => { setCalendarMonth(startOfLocalMonth(new Date())); setSelectedDayKey(null); }}>Today</button>
                    <button type="button" onClick={() => moveCalendarMonth(1)} aria-label="Next month" title="Next month"><ChevronRight size={18} aria-hidden="true" /></button>
                  </div>
                </div>
                <div className="calendar-scroll"><div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
                  <div className="calendar-grid">{calendarDays.map((day, index) => {
                    if (!day) return <span className="calendar-blank" key={`blank-${index}`} aria-hidden="true" />;
                    const dayKey = getLocalDateKey(day);
                    const dayExpenses = expensesByDay.get(dayKey) ?? [];
                    const dayTotal = calculateTotal(dayExpenses.map((expense) => expense.amountCents));
                    const level = dayTotal ? Math.max(1, Math.ceil(dayTotal / maxDayTotal * 3)) : 0;
                    const selected = selectedDayKey === dayKey;
                    return <button className={`calendar-day intensity-${level}${selected ? " selected" : ""}`} key={dayKey} type="button" onClick={() => setSelectedDayKey(dayKey)} aria-label={`Select ${dayKey}${dayExpenses.length ? `, ${dayExpenses.length} expense${dayExpenses.length === 1 ? "" : "s"}, ${formatCurrency(dayTotal)}` : ", no expenses"}`} aria-pressed={selected}>
                      <span>{day.getDate()}</span>{dayExpenses.length > 0 && <small>{dayExpenses.length}</small>}
                    </button>;
                  })}</div></div>
                {selectedDayKey && <div className="selected-day" aria-live="polite">
                  <div className="selected-day-heading"><div><p className="section-label">Selected day</p><h4>Expenses on {formatDay(selectedDayKey)}</h4></div><strong>{formatCurrency(selectedDayTotal)}</strong></div>
                  {selectedDayExpenses.length === 0 ? <p className="day-empty">No expenses recorded for this day.</p>
                    : <ul>{selectedDayExpenses.map((expense) => <li key={expense.id}><span>{expense.description}<small>{expense.category}</small></span><strong>{formatCurrency(expense.amountCents)}</strong></li>)}</ul>}
                </div>}
              </div>
            </>}
        {!isLoading && !loadError && <section className="report-export" aria-labelledby="report-heading">
          <div className="report-export-heading"><div><p className="section-label">Export</p><h3 id="report-heading">Expense report</h3></div><p>UTC+7 · IDR</p></div>
          <div className="report-controls"><button className="download-button" type="button" disabled={!validRange} onClick={() => void downloadReport()}><Download size={17} aria-hidden="true" /> Download PDF</button></div>
          {reportError && <p className="report-note error" role="alert">{reportError}</p>}
          <p className="report-note">{reportCount} {reportCount === 1 ? "expense" : "expenses"} match the filters above</p>
        </section>}
      </section>

      <section className="entry-panel" aria-labelledby="add-expense-heading">
        <div className="panel-heading"><div><p className="section-label">New record</p><h2 id="add-expense-heading">Add an expense</h2></div></div>
        <form onSubmit={handleSubmit} onReset={handleReset} noValidate>
          <div className="field">
            <label htmlFor="amount">Amount (IDR)</label>
            <div className="amount-input"><span aria-hidden="true">Rp</span><input ref={amountRef} id="amount" name="amount" type="text" inputMode="decimal" placeholder="15000" value={amount} onChange={(event) => { setAmount(event.target.value); clearFieldError("amount"); }} aria-describedby={invalidField === "amount" ? "amount-hint amount-error" : "amount-hint"} aria-invalid={invalidField === "amount"} required /></div>
            <p className="hint" id="amount-hint">Use a dot for decimals, e.g. 12500.50.</p>{fieldError("amount")}
          </div>
          <div className="field"><label htmlFor="description">Description</label><input ref={descriptionRef} id="description" name="description" type="text" placeholder="e.g. Groceries" value={description} onChange={(event) => { setDescription(event.target.value); clearFieldError("description"); }} aria-describedby={invalidField === "description" ? "description-error" : undefined} aria-invalid={invalidField === "description"} required />{fieldError("description")}</div>
          <div className="field"><label htmlFor="category">Category</label><select ref={categoryRef} id="category" name="category" value={category} onChange={(event) => { setCategory(event.target.value); clearFieldError("category"); }} aria-describedby={invalidField === "category" ? "category-error" : undefined} aria-invalid={invalidField === "category"} required>{EXPENSE_CATEGORIES.map((expenseCategory) => <option key={expenseCategory} value={expenseCategory}>{expenseCategory}</option>)}</select>{fieldError("category")}</div>
          <div className="field"><label htmlFor="date">Date and time</label><input ref={dateRef} id="date" name="date" type="datetime-local" step="60" value={date} onChange={(event) => { setDate(event.target.value); clearFieldError("date"); }} aria-describedby={invalidField === "date" ? "date-error" : undefined} aria-invalid={invalidField === "date"} required />{fieldError("date")}</div>
          {formError && !invalidField && <p className="form-message error" role="alert">{formError}</p>}
          {successMessage && <p className="form-message success" role="status">{successMessage}</p>}
          <div className="form-actions"><button className="primary-button" type="submit" disabled={isSubmitting}><Plus size={17} aria-hidden="true" />{isSubmitting ? "Adding…" : "Add expense"}</button><button className="secondary-button" type="reset" disabled={isSubmitting}>Clear form</button></div>
        </form>
      </section>
    </div>
  </main>;
}
