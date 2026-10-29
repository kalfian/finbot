"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { formatExpenseDate } from "@/lib/date-time";
import type { Expense } from "@/lib/expenses";
import ProofControls from "./proof-controls";
import {
  queryDashboardExpenses,
  type CategorySummary,
} from "@/lib/dashboard-expenses";
import {
  getBrowserLocalDateTime,
  saveExpense,
  validateExpenseForm,
} from "@/lib/expense-form";
import { createExpenseHtmlExport } from "@/lib/expense-html-export";
import { formatCurrency, toAmountCents } from "@/lib/money";
import { usePreferences } from "./components/preferences";
import { dateKeyInZone, type UsageSnapshot } from "@/lib/timezone";
import { Icon, categoryIcon } from "./components/ui-icon";
import { Modal } from "./components/modal";
import { apiFetch } from "@/lib/client-fetch";
import {
  TagInput,
  TagList,
  fetchTagNames,
  type TagInputHandle,
} from "./components/tag-input";

type CategoriesResult = { categories: { name: string }[] };
type Filters = {
  search: string;
  category: string;
  from: string;
  to: string;
  minAmount: string;
  maxAmount: string;
  tag: string;
  /** "true" keeps only expenses without tags; a string so active-filter counting stays uniform. */
  untagged: string;
};
type TagSummary = {
  tag: string;
  totalCents: number;
  count: number;
  first: string;
  last: string;
  days: number;
  categories: CategorySummary[];
  daily: { day: string; totalCents: number; count: number }[];
};
const PAGE_SIZE = 8;
const VISIBLE_DAYS = 7;
/** Tag names cannot contain commas, so this select value can never collide with a real tag. */
const UNTAGGED = ",untagged";
const EMPTY_FILTERS: Filters = {
  search: "",
  category: "",
  from: "",
  to: "",
  minAmount: "",
  maxAmount: "",
  tag: "",
  untagged: "",
};
const apiMessage = (body: unknown, fallback: string) =>
  body &&
  typeof body === "object" &&
  "error" in body &&
  typeof body.error === "string"
    ? body.error
    : fallback;
function amountFilter(value: string) {
  if (!value) return undefined;
  if (value === "0") return 0;
  return toAmountCents(value);
}

function filterQuery(filters: Filters, limit: number, offset = 0) {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.untagged) params.set("untagged", "true");
  const min = amountFilter(filters.minAmount);
  const max = amountFilter(filters.maxAmount);
  if (min !== undefined && min !== null)
    params.set("minAmountCents", String(min));
  if (max !== undefined && max !== null)
    params.set("maxAmountCents", String(max));
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return params;
}

function filterSummary(filters: Filters) {
  const parts = [
    filters.search.trim() && `Search: ${filters.search.trim()}`,
    filters.category && `Category: ${filters.category}`,
    filters.tag && `Tag: #${filters.tag}`,
    filters.untagged && "Tag: none",
    filters.from && `From: ${filters.from}`,
    filters.to && `To: ${filters.to}`,
    filters.minAmount && `Min: Rp${filters.minAmount}`,
    filters.maxAmount && `Max: Rp${filters.maxAmount}`,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "No filters active";
}

const dayFormat = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(
    new Date(`${key}T12:00:00Z`),
  );

function spanLabel(first: string, last: string) {
  const full = { day: "numeric", month: "short", year: "numeric" } as const;
  if (first === last) return dayFormat(first, full);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${dayFormat(first, sameYear ? { day: "numeric", month: "short" } : full)} – ${dayFormat(last, full)}`;
}

/** Summarizes every expense matching the filters (not just the visible page) for one tag. */
function summarizeTag(
  records: readonly Expense[],
  filters: Filters,
  timezone: string,
): TagSummary | undefined {
  const result = queryDashboardExpenses(
    records,
    filterQuery(filters, Number.MAX_SAFE_INTEGER),
    timezone,
  );
  if (!result.totalCount) return undefined;
  const byDay = new Map<string, { totalCents: number; count: number }>();
  for (const expense of result.expenses) {
    const key = dateKeyInZone(expense.date, timezone);
    const day = byDay.get(key) ?? { totalCents: 0, count: 0 };
    day.totalCents += expense.amountCents;
    day.count += 1;
    byDay.set(key, day);
  }
  const daily = [...byDay]
    .map(([day, value]) => ({ day, ...value }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const first = daily[0].day;
  const last = daily[daily.length - 1].day;
  const wanted = filters.tag.toLocaleLowerCase();
  return {
    tag:
      result.expenses[0].tags?.find(
        (name) => name.toLocaleLowerCase() === wanted,
      ) ?? filters.tag,
    totalCents: result.summary.totalCents,
    count: result.totalCount,
    first,
    last,
    days:
      Math.round(
        (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
          86_400_000,
      ) + 1,
    categories: result.insights.categories,
    daily,
  };
}

export default function ExpenseTracker() {
  const { timezone, openSettings } = usePreferences();
  const [usage, setUsage] = useState<UsageSnapshot>();
  const [usagePeriod, setUsagePeriod] = useState<"day" | "week" | "month">(
    "month",
  );
  const [referenceDate, setReferenceDate] = useState("");
  const [items, setItems] = useState<Expense[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasSummary, setHasSummary] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Expense>();
  const [deleting, setDeleting] = useState<Expense>();
  const [undo, setUndo] = useState<Expense>();
  const [restoring, setRestoring] = useState(false);
  const loadSequence = useRef(0);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [composer, setComposer] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagNames, setTagNames] = useState<string[]>([]);
  const [tagSummary, setTagSummary] = useState<TagSummary>();
  const [showAllDays, setShowAllDays] = useState(false);
  const [tagPdfState, setTagPdfState] = useState<"idle" | "loading" | "error">(
    "idle",
  );
  const tagInput = useRef<TagInputHandle>(null);
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const focusSummary = useRef(false);
  const categories = customCategories;
  const load = useCallback(async () => {
    const request = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const [response, usageResponse] = await Promise.all([
        apiFetch("/api/v1/expenses"),
        apiFetch(
          `/api/v1/usage${referenceDate ? `?date=${referenceDate}` : ""}`,
        ),
      ]);
      const usageBody = await usageResponse.json();
      if (!usageResponse.ok || !usageBody.usage)
        throw Error("We couldn't load your spending periods.");
      const body: unknown = await response.json();
      if (request !== loadSequence.current) return;
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("expenses" in body) ||
        !Array.isArray(body.expenses)
      )
        throw Error(
          apiMessage(body, "We couldn't load your expenses. Please try again."),
        );
      const records = body.expenses as Expense[];
      const recentData = queryDashboardExpenses(
        records,
        filterQuery(filters, PAGE_SIZE, page * PAGE_SIZE),
        timezone,
      );
      if (page > 0 && page * PAGE_SIZE >= recentData.totalCount) {
        setPage(Math.max(0, Math.ceil(recentData.totalCount / PAGE_SIZE) - 1));
        return;
      }
      setItems(recentData.expenses);
      setTotalCount(recentData.totalCount);
      setTagSummary(
        filters.tag ? summarizeTag(records, filters, timezone) : undefined,
      );
      setUsage(usageBody.usage);
      setHasSummary(true);
    } catch (caught) {
      if (request === loadSequence.current)
        setError(
          caught instanceof Error
            ? caught.message
            : "We couldn't load your expenses. Please try again.",
        );
    } finally {
      if (request === loadSequence.current) setLoading(false);
    }
  }, [filters, page, timezone, referenceDate]);
  useEffect(() => {
    void load();
    return () => {
      loadSequence.current += 1;
    };
  }, [load]);
  useEffect(() => {
    if (referenceDate) return;
    const checkDay = () => {
      if (
        document.visibilityState === "visible" &&
        usage?.date &&
        dateKeyInZone(new Date(), timezone) !== usage.date
      )
        void load();
    };
    const timer = window.setInterval(checkDay, 60_000);
    window.addEventListener("focus", checkDay);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", checkDay);
    };
  }, [load, referenceDate, timezone, usage?.date]);
  useEffect(() => {
    void (async () => {
      try {
        const response = await apiFetch("/api/v1/categories");
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !body ||
          typeof body !== "object" ||
          !("categories" in body) ||
          !Array.isArray(body.categories) ||
          !body.categories.every(
            (category) =>
              category &&
              typeof category === "object" &&
              typeof category.name === "string",
          )
        )
          throw Error("We couldn't load categories.");
        const names = (body as CategoriesResult).categories.map(
          (item) => item.name,
        );
        setCustomCategories(names);
        setCategory((current) =>
          names.includes(current) ? current : (names[0] ?? ""),
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "We couldn't load categories.",
        );
      }
    })();
  }, []);
  const loadTags = useCallback(async () => {
    try {
      setTagNames((await fetchTagNames(apiFetch)).map((tag) => tag.name));
    } catch {
      // Suggestions are optional; tagging and filtering by row chips keep working.
    }
  }, []);
  useEffect(() => {
    void loadTags();
  }, [loadTags]);
  useEffect(() => {
    if (!focusSummary.current || !tagSummary) return;
    focusSummary.current = false;
    summaryHeading.current?.focus();
  }, [tagSummary]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDate(getBrowserLocalDateTime());
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function resetForm() {
    setAmount("");
    setDescription("");
    setCategory(categories[0] ?? "");
    setDate(getBrowserLocalDateTime());
    setTags([]);
    setEditing(undefined);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setNotice("");
    const valid = validateExpenseForm(
      { amount, description, category, date },
      categories,
    );
    if ("error" in valid) {
      setError(valid.error);
      return;
    }
    const finalTags = tagInput.current ? tagInput.current.commit() : tags;
    if (!finalTags) return;
    // Always send tags so an emptied list clears them on update.
    const expense = { ...valid.value, tags: finalTags };
    setSaving(true);
    try {
      if (editing) {
        const response = await apiFetch(`/api/v1/expenses/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(expense),
        });
        const body: unknown = await response.json();
        if (!response.ok)
          throw Error(apiMessage(body, "We couldn't update this expense."));
        setNotice("Expense updated.");
      } else {
        await saveExpense(expense, apiFetch);
        setNotice("Expense added.");
      }
      resetForm();
      setComposer(false);
      await Promise.all([load(), loadTags()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save this expense.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function addCategory() {
    if (addingCategory) return;
    setAddingCategory(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("/api/v1/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newCategory }),
      });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("category" in body) ||
        !body.category ||
        typeof body.category !== "object" ||
        !("name" in body.category) ||
        typeof body.category.name !== "string"
      )
        throw Error(apiMessage(body, "We couldn't save this category."));
      const created = body.category.name;
      setCustomCategories((values) =>
        values.includes(created) ? values : [...values, created],
      );
      setCategory(created);
      setNewCategory("");
      setNotice(`${created} is ready to use.`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't save this category.",
      );
    } finally {
      setAddingCategory(false);
    }
  }
  function edit(expense: Expense) {
    setEditing(expense);
    setAmount(String(expense.amountCents / 100));
    setDescription(expense.description);
    setCategory(expense.category);
    setDate(getBrowserLocalDateTime(new Date(expense.date)));
    setTags(expense.tags ?? []);
    setNotice("");
    setError("");
    setComposer(true);
  }
  async function remove() {
    if (!deleting || removing) return;
    const expense = deleting;
    setRemoving(true);
    setError("");
    try {
      const response = await apiFetch(`/api/v1/expenses/${expense.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: expense.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw Error(apiMessage(body, "We couldn't delete this expense."));
      setDeleting(undefined);
      setUndo(expense.proofCount ? undefined : expense);
      setNotice("Expense deleted.");
      await Promise.all([load(), loadTags()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't delete this expense.",
      );
    } finally {
      setRemoving(false);
    }
  }
  async function restore() {
    if (!undo || restoring) return;
    setRestoring(true);
    setError("");
    try {
      await saveExpense(
        {
          amountCents: undo.amountCents,
          description: undo.description,
          category: undo.category,
          date: undo.date,
          tags: undo.tags ?? [],
        },
        apiFetch,
      );
      setUndo(undefined);
      setNotice("Expense restored.");
      await Promise.all([load(), loadTags()]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't restore this expense.",
      );
    } finally {
      setRestoring(false);
    }
  }
  function setRelativeDate(daysAgo: number) {
    const value = new Date();
    value.setDate(value.getDate() - daysAgo);
    setDate(getBrowserLocalDateTime(value));
  }
  async function fetchFilteredExpenses() {
    const response = await apiFetch("/api/v1/expenses");
    const body: unknown = await response.json();
    if (
      !response.ok ||
      !body ||
      typeof body !== "object" ||
      !("expenses" in body) ||
      !Array.isArray(body.expenses)
    )
      throw Error(apiMessage(body, "We couldn't load all matching expenses."));
    return queryDashboardExpenses(
      body.expenses as Expense[],
      filterQuery(filters, Number.MAX_SAFE_INTEGER),
      timezone,
    ).expenses;
  }

  async function downloadHtml() {
    setExporting(true);
    try {
      const expenses = await fetchFilteredExpenses();
      const url = URL.createObjectURL(
        new Blob(
          [
            createExpenseHtmlExport(
              expenses,
              `${filterSummary(filters)}; Timezone: ${timezone}`,
              timezone,
            ),
          ],
          {
            type: "text/html;charset=utf-8",
          },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "expense-tracker-export.html";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError("We couldn't create your HTML download. Please try again.");
    } finally {
      setExporting(false);
    }
  }
  async function downloadTagPdf(tag: string) {
    setTagPdfState("loading");
    // The PDF endpoint supports tag, date range and search; category and amount stay on screen only.
    const params = new URLSearchParams({ tag });
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.search.trim()) params.set("q", filters.search.trim());
    try {
      const response = await apiFetch(`/api/v1/reports/pdf?${params}`);
      if (!response.ok) throw Error();
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `expenses_${tag.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "tag"}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setTagPdfState("idle");
    } catch {
      setTagPdfState("error");
    }
  }
  const updateFilter = (field: keyof Filters, value: string) => {
    setPage(0);
    setFilters((current) => ({ ...current, [field]: value }));
  };
  function setTagFilter(value: string, moveFocus = false) {
    setPage(0);
    setShowAllDays(false);
    setTagPdfState("idle");
    focusSummary.current = moveFocus && value !== UNTAGGED && value !== "";
    setFilters((current) => ({
      ...current,
      tag: value === UNTAGGED ? "" : value,
      untagged: value === UNTAGGED ? "true" : "",
    }));
  }
  function openComposer() {
    resetForm();
    setError("");
    setComposer(true);
  }
  const selectedUsage = usage?.[usagePeriod];
  const monthCategories = selectedUsage?.categories ?? [];
  const monthTotal = selectedUsage?.totalCents ?? 0;
  const monthCount = selectedUsage?.transactionCount ?? 0;
  const todayTotal = usage?.day.totalCents ?? 0;
  const periodLabel = { day: "Day", week: "Week", month: "Month" }[usagePeriod];
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(value + "T12:00:00Z"));
  const monthLabel = selectedUsage
    ? `${dateLabel(selectedUsage.start)}${selectedUsage.start !== selectedUsage.end ? ` – ${dateLabel(selectedUsage.end)}` : ""}`
    : "Loading period";
  const palette = ["#4564cf", "#789d83", "#c39b60", "#a28caa", "#7c9fae"];
  const visibleCategories = monthCategories.slice(0, 4);
  const remainder = monthCategories
    .slice(4)
    .reduce((sum, item) => sum + item.totalCents, 0);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const tagOptions =
    filters.tag &&
    !tagNames.some(
      (name) => name.toLocaleLowerCase() === filters.tag.toLocaleLowerCase(),
    )
      ? [...tagNames, filters.tag]
      : tagNames;
  const pdfOmitsFilters = Boolean(
    filters.category || filters.minAmount || filters.maxAmount,
  );
  const otherFilters = activeFilters - (filters.tag ? 1 : 0);
  const busiestDay = Math.max(
    1,
    ...(tagSummary?.daily.map((day) => day.totalCents) ?? []),
  );
  return (
    <main className="ledger-workspace" id="overview" tabIndex={-1}>
      <div className="workspace-topline">
        <span>
          <i className="status-dot" aria-hidden="true" />
          YOUR PERSONAL LEDGER
        </span>
        <button type="button" className="timezone-pill" onClick={openSettings}>
          <span className="status-dot" />
          {timezone.replaceAll("_", " ")}
          <span>Change</span>
        </button>
      </div>
      <header className="overview-heading">
        <div>
          <p className="eyebrow">YOUR SPENDING, IN PERSPECTIVE</p>
          <h1>Your money, at a glance.</h1>
          <p>A clear view of your everyday spending. On your time.</p>
        </div>
        <button type="button" onClick={openComposer}>
          <Icon name="plus" />
          Add expense
        </button>
      </header>
      {!composer && !deleting && error && (
        <div className="form-message error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      )}
      <div className="usage-toolbar">
        <div className="period-switch" aria-label="Spending period">
          {(["day", "week", "month"] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={usagePeriod === period}
              onClick={() => setUsagePeriod(period)}
            >
              {{ day: "Day", week: "Week", month: "Month" }[period]}
            </button>
          ))}
        </div>
        <div className="usage-date">
          <label>
            As of
            <input
              type="date"
              aria-label="Usage date"
              value={referenceDate || usage?.date || ""}
              onChange={(event) => setReferenceDate(event.target.value)}
            />
          </label>
          {referenceDate && (
            <button
              type="button"
              className="text-button"
              onClick={() => setReferenceDate("")}
            >
              Today
            </button>
          )}
        </div>
      </div>
      <section
        className="overview-grid"
        aria-label="Spending overview"
        aria-busy={loading}
      >
        <div className="spending-hero">
          <div className="hero-label">
            <span>{monthLabel}</span>
            <span>IDR</span>
          </div>
          <div
            className="hero-amount"
            key={`${usagePeriod}-${timezone}-${monthTotal}`}
            aria-live="polite"
          >
            {!hasSummary
              ? loading
                ? "..."
                : "Unavailable"
              : formatCurrency(monthTotal)}
          </div>
          <p className="hero-caption">Spent this {periodLabel.toLowerCase()}</p>
          <div className="hero-footer">
            <div>
              <span>
                {usagePeriod === "day" ? "This week" : "On selected day"}
              </span>
              <strong>
                {!hasSummary
                  ? loading
                    ? "..."
                    : "Unavailable"
                  : formatCurrency(
                      usagePeriod === "day"
                        ? (usage?.week.totalCents ?? 0)
                        : todayTotal,
                    )}
              </strong>
            </div>
            <div>
              <span>Transactions this {periodLabel.toLowerCase()}</span>
              <strong>
                {!hasSummary ? (loading ? "..." : "Unavailable") : monthCount}
              </strong>
            </div>
          </div>
        </div>
        <div className="breakdown">
          <div className="section-heading">
            <h2>Where it goes</h2>
            <span>This {periodLabel.toLowerCase()}</span>
          </div>
          {!hasSummary ? (
            <p className="breakdown-empty">
              {loading
                ? "Getting the full picture..."
                : "Your spending breakdown is temporarily unavailable."}
            </p>
          ) : monthCategories.length ? (
            <>
              <div className="mix-bar" aria-hidden="true">
                {monthCategories.map((item, index) => (
                  <span
                    key={item.category}
                    style={{
                      width: `${item.percentage}%`,
                      background: palette[Math.min(index, 4)],
                    }}
                  />
                ))}
              </div>
              <ul className="breakdown-list">
                {visibleCategories.map((item, index) => (
                  <li key={item.category}>
                    <i
                      style={{ background: palette[index] }}
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      className="category-filter-link"
                      onClick={() => {
                        updateFilter("category", item.category);
                        document
                          .getElementById("transactions")
                          ?.scrollIntoView({
                            behavior: matchMedia(
                              "(prefers-reduced-motion: reduce)",
                            ).matches
                              ? "instant"
                              : "smooth",
                          });
                      }}
                      aria-label={`Filter ${item.category} transactions`}
                    >
                      {item.category}
                    </button>
                    <strong>{formatCurrency(item.totalCents)}</strong>
                  </li>
                ))}
                {remainder > 0 && (
                  <li>
                    <i style={{ background: palette[4] }} aria-hidden="true" />
                    <span>Other categories</span>
                    <strong>{formatCurrency(remainder)}</strong>
                  </li>
                )}
              </ul>
            </>
          ) : (
            <div className="breakdown-empty">
              <Icon name="overview" size={28} />
              <p>Add an expense to see how your spending comes together.</p>
            </div>
          )}
        </div>
      </section>
      <section
        className="transactions-panel"
        id="transactions"
        aria-labelledby="recent-heading"
      >
        <div className="transactions-heading">
          <div>
            <h2 id="recent-heading">Your transactions</h2>
            <p>
              {loading
                ? "Updating your ledger..."
                : `${totalCount} expense${totalCount === 1 ? "" : "s"}`}{" "}
              {activeFilters > 0 ? "matching your filters" : "in your ledger"}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button download-button"
            disabled={loading || exporting || Boolean(error)}
            onClick={() => void downloadHtml()}
          >
            <Icon name="download" size={17} />
            {exporting ? "Preparing..." : "Download HTML"}
          </button>
        </div>
        <div className="transaction-toolbar">
          <label className="search-field" htmlFor="expense-search">
            <span className="sr-only">
              Search descriptions, categories and tags
            </span>
            <Icon name="search" size={18} />
            <input
              id="expense-search"
              type="search"
              placeholder="Find an expense..."
              value={filters.search}
              maxLength={120}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </label>
          <label htmlFor="filter-category">
            <span className="sr-only">Category</span>
            <select
              id="filter-category"
              value={filters.category}
              onChange={(event) => updateFilter("category", event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="filter-tag">
            <span className="sr-only">Tag</span>
            <select
              id="filter-tag"
              value={filters.untagged ? UNTAGGED : filters.tag}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">All tags</option>
              <option value={UNTAGGED}>No tag</option>
              {tagOptions.map((name) => (
                <option key={name} value={name}>
                  #{name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details className="filter-details">
          <summary>
            <Icon name="filter" size={16} />
            Filter expenses{" "}
            <span>
              {activeFilters ? `${activeFilters} active` : "Date & amount"}
            </span>
          </summary>
          <div className="filter-fields">
            <label htmlFor="filter-date-from">
              From date
              <input
                id="filter-date-from"
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter("from", event.target.value)}
              />
            </label>
            <label htmlFor="filter-date-to">
              To date
              <input
                id="filter-date-to"
                type="date"
                value={filters.to}
                onChange={(event) => updateFilter("to", event.target.value)}
              />
            </label>
            <label htmlFor="filter-min-amount">
              Minimum amount (IDR)
              <input
                id="filter-min-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={filters.minAmount}
                onChange={(event) =>
                  updateFilter("minAmount", event.target.value)
                }
              />
            </label>
            <label htmlFor="filter-max-amount">
              Maximum amount (IDR)
              <input
                id="filter-max-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={filters.maxAmount}
                onChange={(event) =>
                  updateFilter("maxAmount", event.target.value)
                }
              />
            </label>
          </div>
          <div className="filter-actions">
            <span>{filterSummary(filters)}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setPage(0);
                setFilters(EMPTY_FILTERS);
              }}
            >
              Clear filters
            </button>
          </div>
        </details>
        {filters.tag && tagSummary && (
          <section
            className={`tag-summary${loading ? " is-refreshing" : ""}`}
            aria-labelledby="tag-summary-heading"
            aria-busy={loading}
          >
            <div className="tag-summary-head">
              <div>
                <p className="eyebrow">TAG SUMMARY</p>
                <h3
                  id="tag-summary-heading"
                  ref={summaryHeading}
                  tabIndex={-1}
                >
                  <span aria-hidden="true">#</span>
                  {tagSummary.tag}
                </h3>
                <p className="tag-summary-span">
                  {spanLabel(tagSummary.first, tagSummary.last)} ·{" "}
                  {tagSummary.days} {tagSummary.days === 1 ? "day" : "days"}
                  {otherFilters > 0 && " · within your other filters"}
                </p>
              </div>
              <div className="tag-summary-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={tagPdfState === "loading"}
                  onClick={() => void downloadTagPdf(tagSummary.tag)}
                >
                  <Icon name="download" size={16} />
                  {tagPdfState === "loading" ? "Preparing..." : "Download PDF"}
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setTagFilter("")}
                >
                  Clear tag
                </button>
              </div>
            </div>
            {tagPdfState === "error" && (
              <p className="form-message error" role="alert">
                We couldn&apos;t create the PDF for #{tagSummary.tag}. Please
                try again.
              </p>
            )}
            {pdfOmitsFilters && (
              <p className="tag-summary-note">
                The PDF uses this tag with your date and search filters;
                category and amount filters only apply on screen.
              </p>
            )}
            <dl className="tag-summary-stats">
              <div className="tag-summary-total">
                <dt>Total spent</dt>
                <dd>{formatCurrency(tagSummary.totalCents)}</dd>
              </div>
              <div>
                <dt>Transactions</dt>
                <dd>{tagSummary.count}</dd>
              </div>
              <div>
                <dt>Average per day</dt>
                <dd>
                  {formatCurrency(
                    // Whole rupiah: an average does not need sen precision.
                    Math.round(tagSummary.totalCents / tagSummary.days / 100) *
                      100,
                  )}
                </dd>
              </div>
            </dl>
            <div className="tag-summary-body">
              <div>
                <h4>By category</h4>
                <div className="mix-bar" aria-hidden="true">
                  {tagSummary.categories.map((item, index) => (
                    <span
                      key={item.category}
                      style={{
                        width: `${item.percentage}%`,
                        background: palette[Math.min(index, 4)],
                      }}
                    />
                  ))}
                </div>
                <ul className="breakdown-list">
                  {tagSummary.categories.map((item, index) => (
                    <li key={item.category}>
                      <i
                        style={{ background: palette[Math.min(index, 4)] }}
                        aria-hidden="true"
                      />
                      <span>
                        {item.category}{" "}
                        <small>({item.transactionCount})</small>
                      </span>
                      <strong>{formatCurrency(item.totalCents)}</strong>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>By day</h4>
                <ul className="tag-days" id="tag-summary-days">
                  {(showAllDays
                    ? tagSummary.daily
                    : tagSummary.daily.slice(0, VISIBLE_DAYS)
                  ).map((day) => (
                    <li key={day.day}>
                      <time dateTime={day.day}>
                        {dayFormat(day.day, {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                      </time>
                      <span className="tag-day-bar" aria-hidden="true">
                        <span
                          style={{
                            width: `${(day.totalCents / busiestDay) * 100}%`,
                          }}
                        />
                      </span>
                      <strong>{formatCurrency(day.totalCents)}</strong>
                    </li>
                  ))}
                </ul>
                {tagSummary.daily.length > VISIBLE_DAYS && (
                  <button
                    type="button"
                    className="text-button tag-days-toggle"
                    aria-expanded={showAllDays}
                    aria-controls="tag-summary-days"
                    onClick={() => setShowAllDays((value) => !value)}
                  >
                    {showAllDays
                      ? "Show fewer days"
                      : `Show all ${tagSummary.daily.length} days with spending`}
                  </button>
                )}
              </div>
            </div>
          </section>
        )}
        {loading && !hasSummary ? (
          <p className="state" role="status">
            Loading your expenses...
          </p>
        ) : items.length === 0 ? (
          <div className="state">
            <Icon name="wallet" size={34} />
            <strong>
              {activeFilters
                ? "Nothing here just yet."
                : "Start with the little things."}
            </strong>
            <p>
              {activeFilters
                ? "Try a different search, or clear your filters."
                : "Your morning coffee is a good place to start."}
            </p>
            {activeFilters ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setPage(0);
                  setFilters(EMPTY_FILTERS);
                }}
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                className="secondary-button"
                onClick={openComposer}
              >
                Add your first expense
                <Icon name="arrow" size={16} />
              </button>
            )}
          </div>
        ) : (
          <ul
            className={`ledger-list ${loading ? "is-refreshing" : ""}`}
            aria-busy={loading}
          >
            {items.map((expense) => (
              <li
                className="ledger-row"
                data-category={expense.category}
                key={expense.id}
              >
                <span className="category-avatar">
                  <Icon name={categoryIcon(expense.category)} />
                </span>
                <div className="row-description">
                  <strong>{expense.description}</strong>
                  <div className="row-meta">
                    <span>{expense.category}</span>
                    <TagList
                      tags={expense.tags}
                      activeTag={filters.tag}
                      onSelect={(tag) => setTagFilter(tag, true)}
                    />
                  </div>
                  <ProofControls
                    expenseId={expense.id}
                    count={expense.proofCount}
                    onChange={async () => {
                      await load();
                      return true;
                    }}
                  />
                </div>
                <time className="row-date" dateTime={expense.date}>
                  {formatExpenseDate(expense.date, undefined, timezone)}
                </time>
                <span className="row-amount">
                  {formatCurrency(expense.amountCents)}
                </span>
                <div className="row-actions">
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Edit ${expense.description}`}
                    onClick={() => edit(expense)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button delete-button"
                    aria-label={`Delete ${expense.description}`}
                    onClick={() => {
                      setError("");
                      setDeleting(expense);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalCount > PAGE_SIZE && (
          <nav className="list-pagination" aria-label="Expense pages">
            <button
              type="button"
              className="secondary-button"
              disabled={loading || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={loading || (page + 1) * PAGE_SIZE >= totalCount}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
      <footer className="workspace-footer">
        <span>Made for the way you spend.</span>
        <span>Ledger / Your everyday, accounted for.</span>
      </footer>
      <Modal
        open={composer}
        onClose={() => setComposer(false)}
        title={editing ? "Edit expense" : "Add an expense"}
        id="composer"
        busy={saving}
      >
        <form onSubmit={submit} noValidate>
          <div className="recorder-fields">
            <label htmlFor="quick-amount">
              <span className="field-label">
                Amount <span>(IDR)</span>
              </span>
              <div className="amount-input">
                <span>Rp</span>
                <input
                  id="quick-amount"
                  data-autofocus
                  placeholder="0"
                  inputMode="decimal"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  aria-required="true"
                />
              </div>
            </label>
            <label htmlFor="quick-description">
              What was it?
              <input
                id="quick-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
                aria-required="true"
                placeholder="Coffee, train, groceries..."
              />
            </label>
          </div>
          <fieldset className="category-chips">
            <legend>Category</legend>
            {categories.map((value) => (
              <button
                type="button"
                key={value}
                className="category-button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
              >
                <Icon name={categoryIcon(value)} size={16} />
                {value}
              </button>
            ))}
          </fieldset>
          <details className="custom-category-details">
            <summary>+ Create a category</summary>
            <div className="new-category">
              <label htmlFor="new-category">
                New category
                <input
                  id="new-category"
                  value={newCategory}
                  maxLength={40}
                  onChange={(event) => setNewCategory(event.target.value)}
                  placeholder="Pet care"
                />
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={addingCategory}
                onClick={() => void addCategory()}
              >
                {addingCategory ? "Adding..." : "Add category"}
              </button>
            </div>
          </details>
          <TagInput
            id="quick-tags"
            ref={tagInput}
            value={tags}
            onChange={setTags}
            suggestions={tagNames}
            disabled={saving}
          />
          <details className="when-details">
            <summary>
              When <span>{date ? formatExpenseDate(date) : "Now"}</span>
            </summary>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRelativeDate(0)}
              >
                Now
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRelativeDate(1)}
              >
                Yesterday
              </button>
              <label htmlFor="quick-date">
                Date and time (device timezone)
                <input
                  id="quick-date"
                  type="datetime-local"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                  aria-required="true"
                />
              </label>
            </div>
          </details>
          {error && (
            <p className="form-message error" role="alert">
              {error}
            </p>
          )}
          <div className="quick-actions">
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add expense"}
            </button>
            {editing && (
              <button
                className="secondary-button"
                type="button"
                onClick={() => setComposer(false)}
              >
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(undefined)}
        title="Delete this expense?"
        id="delete"
        busy={removing}
      >
        <p className="muted">
          {deleting?.description} will be removed.{" "}
          {deleting?.proofCount
            ? "Its proof files will also be permanently deleted. This cannot be undone."
            : "Undo creates a replacement record with a new ID."}
        </p>
        {error && (
          <p className="form-message error" role="alert">
            {error}
          </p>
        )}
        <div className="quick-actions">
          <button
            type="button"
            className="secondary-button"
            data-autofocus
            disabled={removing}
            onClick={() => setDeleting(undefined)}
          >
            Keep it
          </button>
          <button
            type="button"
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing ? "Deleting..." : "Delete expense"}
          </button>
        </div>
      </Modal>
      {notice && !composer && (
        <div className="feedback-toast" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          {undo && (
            <button
              className="text-button"
              type="button"
              disabled={restoring}
              onClick={() => void restore()}
            >
              {restoring ? "Restoring..." : "Undo"}
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => {
              setNotice("");
              setUndo(undefined);
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
    </main>
  );
}
