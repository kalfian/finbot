import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { createCategoryBudgetRepository } from "../lib/category-budgets";
import { getCategoryBudgets, putCategoryBudget } from "../lib/category-budget-api";
import { createExpenseRepository } from "../lib/expenses";

function createTestRepositories() {
  const database = new Database(":memory:");
  initializeDatabase(database);
  return {
    database,
    budgets: createCategoryBudgetRepository(database),
    expenses: createExpenseRepository(database),
  };
}

test("category budget summaries report progress, warning, remaining, and overspend within month boundaries", () => {
  const { database, budgets, expenses } = createTestRepositories();
  try {
    budgets.upsert({ category: "Food", month: "2026-02", amountCents: 1_000 });
    expenses.create({ amountCents: 800, description: "February groceries", category: "Food", date: "2026-02-28T23:59:59.000Z" });
    expenses.create({ amountCents: 500, description: "March groceries", category: "Food", date: "2026-03-01T00:00:00.000Z" });

    assert.deepEqual(budgets.summaries("2026-02").find((budget) => budget.category === "Food"), {
      category: "Food",
      month: "2026-02",
      budgetCents: 1_000,
      spentCents: 800,
      remainingCents: 200,
      overspentCents: 0,
      progressPercent: 80,
      thresholdState: "near-limit",
    });

    budgets.upsert({ category: "Food", month: "2026-02", amountCents: 600 });
    assert.deepEqual(budgets.summaries("2026-02").find((budget) => budget.category === "Food"), {
      category: "Food",
      month: "2026-02",
      budgetCents: 600,
      spentCents: 800,
      remainingCents: 0,
      overspentCents: 200,
      progressPercent: 133.33333333333331,
      thresholdState: "overspent",
    });
  } finally {
    database.close();
  }
});

test("category budget summaries explicitly represent categories with no budget", () => {
  const { database, budgets, expenses } = createTestRepositories();
  try {
    expenses.create({ amountCents: 250, description: "Bus", category: "Transport", date: "2026-02-14T08:30:00.000Z" });
    assert.deepEqual(budgets.summaries("2026-02").find((budget) => budget.category === "Transport"), {
      category: "Transport",
      month: "2026-02",
      budgetCents: null,
      spentCents: 250,
      remainingCents: null,
      overspentCents: null,
      progressPercent: null,
      thresholdState: "no-budget",
    });
  } finally {
    database.close();
  }
});

test("database initialization adds budget storage to an existing expense database", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    initializeDatabase(database);
    const budgets = createCategoryBudgetRepository(database);
    assert.equal(budgets.upsert({ category: "Food", month: "2026-02", amountCents: 500 }).amountCents, 500);
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'category_budgets'").get() !== undefined, true);
  } finally {
    database.close();
  }
});

test("category budget API validates month, category, and strictly positive integer amounts", async () => {
  const { database, budgets } = createTestRepositories();
  try {
    const invalidBodies = [
      {},
      { category: "Unknown", month: "2026-02", amountCents: 100 },
      { category: "Food", month: "2026-2", amountCents: 100 },
      { category: "Food", month: "2026-02", amountCents: 0 },
      { category: "Food", month: "2026-02", amountCents: -1 },
      { category: "Food", month: "2026-02", amountCents: 1.5 },
    ];
    for (const body of invalidBodies) {
      assert.equal((await putCategoryBudget(new Request("http://localhost/api/category-budgets", { method: "PUT", body: JSON.stringify(body) }), budgets)).status, 400);
    }
    assert.equal(getCategoryBudgets(new Request("http://localhost/api/category-budgets?month=2026-02"), budgets).status, 200);
    assert.equal(getCategoryBudgets(new Request("http://localhost/api/category-budgets?month=2026-13"), budgets).status, 400);
  } finally {
    database.close();
  }
});

test("category budget API upserts a target and shields persistence failures", async () => {
  const { database, budgets } = createTestRepositories();
  try {
    const response = await putCategoryBudget(new Request("http://localhost/api/category-budgets", {
      method: "PUT",
      body: JSON.stringify({ category: "Food", month: "2026-02", amountCents: 9_000 }),
    }), budgets);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).budget.amountCents, 9_000);
    assert.equal(budgets.list("2026-02")[0].amountCents, 9_000);
  } finally {
    database.close();
  }

  const failingRepository = {
    list() { throw new Error("database path should not be exposed"); },
    summaries() { throw new Error("database path should not be exposed"); },
    upsert() { throw new Error("database path should not be exposed"); },
  };
  assert.equal(getCategoryBudgets(new Request("http://localhost/api/category-budgets?month=2026-02"), failingRepository).status, 500);
  assert.equal((await putCategoryBudget(new Request("http://localhost/api/category-budgets", { method: "PUT", body: JSON.stringify({ category: "Food", month: "2026-02", amountCents: 100 }) }), failingRepository)).status, 500);
});
