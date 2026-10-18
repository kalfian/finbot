import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { createUserRepository } from "../lib/auth";
import { CategoryConflictError, CategoryInUseError, createCategoryRepository, DEFAULT_EXPENSE_CATEGORIES } from "../lib/categories";
import { initializeDatabase } from "../lib/database";
import { validateExpense } from "../lib/expense-api";
import { createExpenseRepository } from "../lib/expenses";

test("categories are seeded and isolated for every user", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("category-user", "temporary123");
    assert.deepEqual(createCategoryRepository(database, 1).list().map(({ name }) => name).sort(), [...DEFAULT_EXPENSE_CATEGORIES].sort());
    assert.deepEqual(createCategoryRepository(database, user.id).list().map(({ name }) => name).sort(), [...DEFAULT_EXPENSE_CATEGORIES].sort());
    createCategoryRepository(database, user.id).create("Education");
    assert.equal(createCategoryRepository(database, 1).has("Education"), false);
  } finally {
    database.close();
  }
});

test("category CRUD is case-insensitive and rename updates existing expenses", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const categories = createCategoryRepository(database, 1);
    const created = categories.create("Education");
    assert.throws(() => categories.create("education"), CategoryConflictError);
    const expense = createExpenseRepository(database, 1).create({
      amountCents: 1000, description: "Book", category: "Education", date: "2026-09-29T00:00:00.000Z",
    });
    const renamed = categories.update(created.id, "Learning");
    assert.equal(renamed?.name, "Learning");
    assert.equal(createExpenseRepository(database, 1).list()[0].category, "Learning");
    assert.throws(() => categories.delete(created.id), CategoryInUseError);
    createExpenseRepository(database, 1).delete(expense.id);
    assert.equal(categories.delete(created.id)?.name, "Learning");
  } finally {
    database.close();
  }
});

test("expense validation accepts only the authenticated user's registered categories", () => {
  const input = { amountCents: 1000, description: "Course", category: "education", date: "2026-09-29T00:00:00.000Z" };
  assert.deepEqual(validateExpense(input, ["Education"]), { value: { ...input, category: "Education" } });
  assert.deepEqual(validateExpense(input, ["Food"]), { error: "category must be a supported expense category." });
});
