import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { createBudgetRepository, budgetSnapshot } from "../lib/budget";
import { getBudget, putBudget } from "../lib/budget-api";

test("monthly limit persists and summaries use the expense's Jakarta day and month", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const budget = createBudgetRepository(database);
    const expenses = createExpenseRepository(database);
    assert.equal(budget.getMonthlyLimitCents(), null);
    budget.setMonthlyLimitCents(2_000_000_00);
    expenses.create({ amountCents: 565_269_00, description: "Food", category: "Food", date: "2026-09-26T00:00:00.000Z" });
    expenses.create({ amountCents: 2_072_625_00, description: "Other", category: "Other", date: "2026-09-25T17:00:00.000Z" });
    const snapshot = budgetSnapshot(database, "2026-09-26T17:00:00.000Z");
    assert.deepEqual(snapshot, {
      date: "2026-09-27", month: "2026-09", todayCents: 0,
      monthCents: 263_789_400, monthlyLimitCents: 200_000_000,
      remainingCents: -63_789_400, exceeded: true,
    });
    assert.equal(budgetSnapshot(database, "2026-09-26T00:00:00.000Z").todayCents, 263_789_400);
    assert.equal(budgetSnapshot(database, "2026-10-01T00:00:00.000Z").monthCents, 0);
    budget.setMonthlyLimitCents(null);
    assert.equal(budgetSnapshot(database, "2026-09-26T00:00:00.000Z").remainingCents, null);
    assert.equal(budgetSnapshot(database, "2026-09-26T00:00:00.000Z").exceeded, false);
    assert.throws(() => budget.setMonthlyLimitCents(0));
  } finally {
    database.close();
  }
});

test("budget API validates updates and returns a no-store snapshot", async () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const base = "http://localhost/api/v1/budget";
    const invalid = await putBudget(new Request(base, { method: "PUT", body: JSON.stringify({ monthlyLimitCents: 0 }) }), database);
    assert.equal(invalid.status, 400);
    const saved = await putBudget(new Request(base, { method: "PUT", body: JSON.stringify({ monthlyLimitCents: 200_000_000 }) }), database);
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).budget.monthlyLimitCents, 200_000_000);
    const result = getBudget(new Request(`${base}?date=2026-09-26`), database);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    assert.equal((await result.json()).budget.month, "2026-09");
    assert.equal(getBudget(new Request(`${base}?date=2026-02-30`), database).status, 400);
    const cleared = await putBudget(new Request(base, { method: "PUT", body: JSON.stringify({ monthlyLimitCents: null }) }), database);
    assert.equal((await cleared.json()).budget.monthlyLimitCents, null);
  } finally {
    database.close();
  }
});

test("agent source ID replays one expense and rejects mismatched retries", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const expenses = createExpenseRepository(database);
    const input = { amountCents: 1_000_000, description: "Seblak", category: "Food", date: "2026-09-26T03:00:00.000Z" };
    const first = expenses.record(input, "telegram:123:456");
    const replay = expenses.record(input, "telegram:123:456");
    assert.equal(first.replayed, false);
    assert.equal(replay.replayed, true);
    assert.equal(replay.expense.id, first.expense.id);
    assert.equal(expenses.list().length, 1);
    assert.throws(() => expenses.record({ ...input, amountCents: 2_000_000 }, "telegram:123:456"), /sourceId/);
  } finally {
    database.close();
  }
});
