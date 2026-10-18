import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ExpenseTracker from "../app/expense-tracker";
import { EXPENSE_RECORDER_DESIGN_CSS } from "../lib/expense-recorder-design";
import nextConfig from "../next.config";
import { createExpenseHtmlExport } from "../lib/expense-html-export";
import { getBrowserLocalDateTime, localDateTimeToUtc, saveExpense, validateExpenseForm } from "../lib/expense-form";

test("the tracker is a focused expense recorder with a browser-local datetime default", () => {
  const markup = renderToStaticMarkup(createElement(ExpenseTracker));
  const source = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(markup, /<nav\b/);
  assert.match(markup, /Your money, at a glance/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /getBrowserLocalDateTime\(\)/);
  assert.match(source, /setDate\(getBrowserLocalDateTime\(\)\)/);
  assert.match(source, /Add expense/);
  assert.match(markup, /Your transactions/);
  assert.match(markup, /This month/);
  assert.match(source, /aria-pressed/);
  assert.doesNotMatch(source, /category-budgets/);
  assert.doesNotMatch(source, /recurring-expenses/);
  assert.doesNotMatch(source, /Expense calendar/);
});

test("getBrowserLocalDateTime creates a datetime-local value from local calendar values", () => {
  const localDate = new Date(0);
  localDate.setFullYear(2026, 1, 3);
  localDate.setHours(9, 7, 0, 0);
  assert.equal(getBrowserLocalDateTime(localDate), "2026-02-03T09:07");
});

test("localDateTimeToUtc converts the browser-local datetime before persistence", () => {
  const localDate = new Date(0);
  localDate.setFullYear(2026, 1, 3);
  localDate.setHours(9, 7, 0, 0);
  const localValue = getBrowserLocalDateTime(localDate);
  assert.equal(localDateTimeToUtc(localValue), localDate.toISOString());
  assert.equal(localDateTimeToUtc("2026-02-30T09:07"), null);
});

test("the dev server permits the browser and workspace proxy to load client assets", () => {
  assert.deepEqual(nextConfig.allowedDevOrigins, ["127.0.0.1", "10.20.30.105"]);
});

test("the expense form uses the client submit handler without a native action", () => {
  const markup = renderToStaticMarkup(createElement(ExpenseTracker));
  const source = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");
  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(markup, /<form\b[^>]*\saction=/);
  assert.match(source, /^"use client";/);
  assert.match(pageSource, /import ExpenseTracker from "\.\/expense-tracker";/);
  assert.match(source, /<form onSubmit=\{submit\} noValidate>/);
  assert.match(source, /async function submit\(event: FormEvent\) \{\s*event\.preventDefault\(\);/);
});

test("validateExpenseForm converts valid IDR input to the API request shape", () => {
  assert.deepEqual(validateExpenseForm({
    amount: "12500.50",
    description: "  Train fare  ",
    category: "Transport",
    date: "2026-02-14T08:30",
  }), {
    value: { amountCents: 1250050, description: "Train fare", category: "Transport", date: new Date("2026-02-14T08:30").toISOString() },
  });
});

test("Entertainment is available as a built-in category in the recorder and client validation", () => {
  const source = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");
  assert.match(source, /const categories = \[\.\.\.EXPENSE_CATEGORIES, \.\.\.customCategories\]/);
  assert.match(source, /Add category/);
  assert.deepEqual(validateExpenseForm({
    amount: "25000",
    description: "Movie ticket",
    category: "Entertainment",
    date: "2026-02-14T08:30",
  }), {
    value: { amountCents: 2500000, description: "Movie ticket", category: "Entertainment", date: new Date("2026-02-14T08:30").toISOString() },
  });
});

test("the recorder accepts a newly loaded custom category immediately", () => {
  assert.deepEqual(validateExpenseForm({
    amount: "12000",
    description: "Vet visit",
    category: "Pet Care",
    date: "2026-02-14T08:30",
  }, ["Food", "Pet Care"]), {
    value: { amountCents: 1200000, description: "Vet visit", category: "Pet Care", date: new Date("2026-02-14T08:30").toISOString() },
  });
});

test("HTML export is standalone, shares the recorder design, summarizes active filters, and escapes user supplied content", () => {
  const html = createExpenseHtmlExport([
    { id: 1, amountCents: 1250000, description: "Tickets <script>alert('x')</script> & snacks", category: "Entertainment", date: "2026-02-14T08:30:00.000Z" },
    { id: 2, amountCents: 500000, description: "Coffee", category: "Food", date: "2026-02-13T08:30:00.000Z" },
  ], "Search: tickets; Category: Entertainment");

  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /Expense tracker/);
  assert.match(html, /2 expenses/);
  assert.match(html, /Rp\s?17\.500,00/);
  assert.match(html, /Entertainment/);
  assert.match(html, /Search: tickets; Category: Entertainment/);
  assert.match(html, /Tickets &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt; &amp; snacks/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /class="expense-page export-page"/);
  assert.ok(html.includes(EXPENSE_RECORDER_DESIGN_CSS));
});

test("HTML export clearly represents an empty filtered result", () => {
  const html = createExpenseHtmlExport([], "Category: Pet Care");
  assert.match(html, /Category: Pet Care/);
  assert.match(html, /No expenses match these filters/);
});

test("the recorder preserves its amount focus indicator and releases export URLs", () => {
  const trackerSource = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");
  assert.match(trackerSource, /Download HTML/);
  assert.match(trackerSource, /URL\.revokeObjectURL/);
  assert.match(EXPENSE_RECORDER_DESIGN_CSS, /\.amount-input:focus-within \{[^}]*box-shadow: 0 0 0 3px var\(--focus-ring\)/);
  assert.match(EXPENSE_RECORDER_DESIGN_CSS, /\.amount-input input:focus-visible \{ outline: 0;/);
});

test("the recorder exposes an accessible, collapsible complete filter set and exports all matching pages", () => {
  const source = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");
  assert.match(source, /<details className="filter-details">/);
  assert.match(source, /htmlFor="expense-search"/);
  assert.match(source, /htmlFor="filter-category"/);
  assert.match(source, /htmlFor="filter-date-from"/);
  assert.match(source, /htmlFor="filter-date-to"/);
  assert.match(source, /htmlFor="filter-min-amount"/);
  assert.match(source, /htmlFor="filter-max-amount"/);
  assert.match(source, /Clear filters/);
  assert.match(source, /totalCount/);
  assert.match(source, /fetchFilteredExpenses/);
  assert.match(source, /localDateRange/);
});

test("validateExpenseForm reports each client-side validation boundary", () => {
  assert.deepEqual(validateExpenseForm({ amount: "0", description: "Lunch", category: "Food", date: "2026-02-14T08:30" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1.234", description: "Lunch", category: "Food", date: "2026-02-14T08:30" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "   ", category: "Food", date: "2026-02-14T08:30" }), {
    error: "Enter a description for this expense.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "Lunch", category: "Food", date: "" }), {
    error: "Choose the date and time of this expense.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "Lunch", category: "Unknown", date: "2026-02-14T08:30" }), {
    error: "Choose a category for this expense.",
  });
});

test("saveExpense posts the request and handles success and API errors", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const successfulFetch: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ expense: { id: 1 } }), { status: 201 });
  };

  await saveExpense({ amountCents: 1500, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }, successfulFetch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/expenses");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), {
    amountCents: 1500,
    description: "Coffee",
    category: "Food",
    date: "2026-02-14T08:30:00.000Z",
  });

  const failingFetch: typeof fetch = async () => new Response(JSON.stringify({ error: "Date is unavailable." }), { status: 400 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }, failingFetch),
    { message: "Date is unavailable." },
  );

  const malformedErrorFetch: typeof fetch = async () => new Response("not json", { status: 500 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }, malformedErrorFetch),
    { message: "We couldn't save this expense. Please try again." },
  );
});
