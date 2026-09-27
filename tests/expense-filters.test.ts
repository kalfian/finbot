import assert from "node:assert/strict";
import test from "node:test";
import { filterReportExpenses, validateReportRange } from "../lib/expense-filters";

const expenses = [
  { id: 1, amountCents: 100, description: "Train", category: "Transport", date: "2026-09-23T17:00:00.000Z", createdAt: "" },
  { id: 2, amountCents: 200, description: "Dinner", category: "Food", date: "2026-09-24T16:59:59.000Z", createdAt: "" },
  { id: 3, amountCents: 300, description: "Train pass", category: "Transport", date: "2026-09-24T17:00:00.000Z", createdAt: "" },
];

test("one query and Jakarta date range selects exactly the visible and exported rows", () => {
  assert.deepEqual(filterReportExpenses(expenses, { query: "transport", start: "2026-09-24", end: "2026-09-24" }).map((item) => item.id), [1]);
  assert.deepEqual(filterReportExpenses(expenses, { query: "dinner", start: "2026-09-24", end: "2026-09-24" }).map((item) => item.id), [2]);
  assert.deepEqual(filterReportExpenses(expenses, { query: "train", start: "", end: "" }).map((item) => item.id), [1, 3]);
});

test("date bounds are optional for browsing, but reversed or invalid dates are rejected", () => {
  assert.deepEqual(filterReportExpenses(expenses, { query: "", start: "", end: "2026-09-24" }).map((item) => item.id), [1, 2]);
  assert.equal(validateReportRange("2026-09-25", "2026-09-24"), false);
  assert.equal(validateReportRange("2026-02-30", ""), false);
  assert.deepEqual(filterReportExpenses(expenses, { query: "", start: "2026-09-25", end: "2026-09-24" }), []);
});
