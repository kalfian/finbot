import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ExpenseTracker from "../app/expense-tracker";
import nextConfig from "../next.config";
import { getBrowserLocalDate, saveExpense, validateExpenseForm } from "../lib/expense-form";

test("the tracker is a focused expense page with a browser-local date default", () => {
  const markup = renderToStaticMarkup(createElement(ExpenseTracker));
  const source = readFileSync(new URL("../app/expense-tracker.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(markup, /<nav\b/);
  assert.doesNotMatch(source, /Every expense, in one place\./);
  assert.match(source, /getBrowserLocalDate\(\)/);
  assert.match(source, /setDate\(getBrowserLocalDate\(\)\)/);
});

test("getBrowserLocalDate creates a date-input value from local calendar values", () => {
  const localDate = new Date(0);
  localDate.setFullYear(2026, 1, 3);
  assert.equal(getBrowserLocalDate(localDate), "2026-02-03");
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
  assert.match(source, /<form onSubmit=\{handleSubmit\} noValidate>/);
  assert.match(source, /async function handleSubmit\(event: FormEvent<HTMLFormElement>\) \{\s+event\.preventDefault\(\);/);
});

test("validateExpenseForm converts valid IDR input to the API request shape", () => {
  assert.deepEqual(validateExpenseForm({
    amount: "12500.50",
    description: "  Train fare  ",
    date: "2026-02-14",
  }), {
    value: { amountCents: 1250050, description: "Train fare", date: "2026-02-14" },
  });
});

test("validateExpenseForm reports each client-side validation boundary", () => {
  assert.deepEqual(validateExpenseForm({ amount: "0", description: "Lunch", date: "2026-02-14" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1.234", description: "Lunch", date: "2026-02-14" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "   ", date: "2026-02-14" }), {
    error: "Enter a description for this expense.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "Lunch", date: "" }), {
    error: "Choose the date of this expense.",
  });
});

test("saveExpense posts the request and handles success and API errors", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const successfulFetch: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ expense: { id: 1 } }), { status: 201 });
  };

  await saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, successfulFetch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/expenses");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), {
    amountCents: 1500,
    description: "Coffee",
    date: "2026-02-14",
  });

  const failingFetch: typeof fetch = async () => new Response(JSON.stringify({ error: "Date is unavailable." }), { status: 400 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, failingFetch),
    { message: "Date is unavailable." },
  );

  const malformedErrorFetch: typeof fetch = async () => new Response("not json", { status: 500 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, malformedErrorFetch),
    { message: "We couldn't save this expense. Please try again." },
  );
});
