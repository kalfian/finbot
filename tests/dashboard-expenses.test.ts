import assert from "node:assert/strict";
import test from "node:test";
import { queryDashboardExpenses } from "../lib/dashboard-expenses";
import type { Expense } from "../lib/expenses";

const records: Expense[] = [
  {
    id: 1,
    description: "Lunch",
    category: "Food",
    amountCents: 1250050,
    date: "2026-10-18T05:00:00.000Z",
    createdAt: "",
    proofCount: 1,
  },
  {
    id: 2,
    description: "Train",
    category: "Transport",
    amountCents: 200000,
    date: "2026-10-17T17:00:00.000Z",
    createdAt: "",
    proofCount: 0,
  },
  {
    id: 3,
    description: "Dinner",
    category: "Food",
    amountCents: 300000,
    date: "2026-10-18T17:00:00.000Z",
    createdAt: "",
    proofCount: 0,
  },
];
test("dashboard aggregates complete results before slicing and preserves fractional IDR", () => {
  const result = queryDashboardExpenses(
    records,
    new URLSearchParams({ limit: "1", offset: "1" }),
  );
  assert.deepEqual(
    result.expenses.map((item) => item.id),
    [2],
  );
  assert.equal(result.totalCount, 3);
  assert.equal(result.summary.totalCents, 1750050);
  assert.equal(result.insights.categories[0].totalCents, 1550050);
  assert.equal(result.insights.categories[0].transactionCount, 2);
});
test("dashboard date boundaries are inclusive start, exclusive end", () => {
  const result = queryDashboardExpenses(
    records,
    new URLSearchParams({
      start: "2026-10-17T17:00:00.000Z",
      end: "2026-10-18T17:00:00.000Z",
    }),
  );
  assert.deepEqual(
    result.expenses.map((item) => item.id),
    [1, 2],
  );
});
test("dashboard combines search, category, and exact amount bounds", () => {
  const result = queryDashboardExpenses(
    records,
    new URLSearchParams({
      search: "FOOD",
      category: "Food",
      minAmountCents: "300000",
      maxAmountCents: "300000",
    }),
  );
  assert.deepEqual(
    result.expenses.map((item) => item.id),
    [3],
  );
  assert.equal(result.insights.categories[0].percentage, 100);
  assert.equal(
    queryDashboardExpenses([], new URLSearchParams()).summary.totalCents,
    0,
  );
});
