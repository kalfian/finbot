import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { completeRecurringExpense, deleteRecurringExpense, getRecurringExpenses, postRecurringExpense, putRecurringExpense } from "../lib/recurring-expense-api";
import { createRecurringExpenseRepository, nextRecurringDueAt } from "../lib/recurring-expenses";
import { createExpenseRepository } from "../lib/expenses";

function testRepositories() {
  const database = new Database(":memory:");
  initializeDatabase(database);
  return { database, recurring: createRecurringExpenseRepository(database), expenses: createExpenseRepository(database) };
}

const monthlyPlan = { amountCents: 150_000, amountType: "fixed", description: "  Internet  ", category: "Bills", frequency: "monthly", nextDueAt: "2026-01-31T08:30:00.000Z" } as const;
const variablePlan = { ...monthlyPlan, amountCents: null, amountType: "variable" } as const;

test("monthly schedules clamp to the following month's final day and weekly schedules retain time", () => {
  assert.equal(nextRecurringDueAt("2026-01-31T08:30:00.000Z", "monthly"), "2026-02-28T08:30:00.000Z");
  assert.equal(nextRecurringDueAt("2028-01-31T08:30:00.000Z", "monthly"), "2028-02-29T08:30:00.000Z");
  assert.equal(nextRecurringDueAt("2026-02-14T08:30:00.000Z", "weekly"), "2026-02-21T08:30:00.000Z");
});

test("a recurring plan is persisted separately and completion atomically records exactly one ledger expense", () => {
  const { database, recurring, expenses } = testRepositories();
  try {
    const plan = recurring.create(monthlyPlan);
    assert.deepEqual(recurring.list(), [{ ...plan, description: "Internet" }]);
    const completed = recurring.complete(plan.id, plan.nextDueAt);
    assert.ok(completed);
    assert.deepEqual(completed.expense, { id: 1, amountCents: 150_000, description: "Internet", category: "Bills", date: "2026-01-31T08:30:00.000Z", createdAt: completed.expense.createdAt });
    assert.equal(completed.recurringExpense.nextDueAt, "2026-02-28T08:30:00.000Z");
    assert.equal(recurring.complete(plan.id, plan.nextDueAt), undefined, "a stale repeat cannot duplicate a paid occurrence");
    assert.equal(expenses.list().length, 1);
    assert.equal(recurring.update(plan.id, { ...monthlyPlan, description: "Internet", active: false })?.active, false);
    assert.deepEqual(recurring.list(), []);
    assert.equal(recurring.list(true).length, 1);
  } finally { database.close(); }
});

test("variable plans require a positive paid amount and still reject a stale repeat", () => {
  const { database, recurring, expenses } = testRepositories();
  try {
    const plan = recurring.create(variablePlan);
    assert.equal(plan.amountCents, null);
    assert.equal(recurring.complete(plan.id, plan.nextDueAt), undefined, "a variable plan cannot create an invalid zero or null expense");
    const completed = recurring.complete(plan.id, plan.nextDueAt, 175_500);
    assert.ok(completed);
    assert.equal(completed.expense.amountCents, 175_500);
    assert.equal(recurring.complete(plan.id, plan.nextDueAt, 175_500), undefined, "the supplied amount does not weaken occurrence idempotency");
    assert.equal(expenses.list().length, 1);
  } finally { database.close(); }
});

test("existing fixed recurring rows migrate without losing their saved amount", () => {
  const database = new Database(":memory:");
  try {
    database.exec("CREATE TABLE recurring_expenses (id INTEGER PRIMARY KEY, amount_cents INTEGER NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, frequency TEXT NOT NULL, next_due_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO recurring_expenses VALUES (7, 5000, 'Legacy', 'Bills', 'monthly', '2026-02-01T00:00:00.000Z', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');");
    initializeDatabase(database);
    assert.deepEqual(createRecurringExpenseRepository(database).list(), [{ id: 7, amountCents: 5000, amountType: "fixed", description: "Legacy", category: "Bills", frequency: "monthly", nextDueAt: "2026-02-01T00:00:00.000Z", active: true, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]);
  } finally { database.close(); }
});

test("recurring expense API validates input and exposes CRUD, planned list, and stale completion safety", async () => {
  const { database, recurring } = testRepositories();
  try {
    for (const invalid of [{}, { ...monthlyPlan, frequency: "daily" }, { ...monthlyPlan, nextDueAt: "2026-02-30T08:30:00.000Z" }, { ...monthlyPlan, amountCents: 1.1 }, { ...monthlyPlan, amountType: "variable", amountCents: 10 }, { ...monthlyPlan, amountType: "fixed", amountCents: null }]) {
      assert.equal((await postRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "POST", body: JSON.stringify(invalid) }), recurring)).status, 400);
    }
    const created = await postRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "POST", body: JSON.stringify(monthlyPlan) }), recurring);
    assert.equal(created.status, 201);
    const plan = (await created.json()).recurringExpense;
    assert.equal((await getRecurringExpenses(recurring, new Request("http://localhost/api/recurring-expenses")).json()).recurringExpenses.length, 1);
    assert.equal((await putRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "PUT", body: JSON.stringify({ ...plan, active: false }) }), recurring)).status, 200);
    assert.equal((await completeRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "PATCH", body: JSON.stringify({ id: plan.id, expectedNextDueAt: plan.nextDueAt }) }), recurring)).status, 409);
    assert.equal((await deleteRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "DELETE", body: JSON.stringify({ id: plan.id }) }), recurring)).status, 200);
  } finally { database.close(); }
});

test("variable completion validates an optional paid amount at the API boundary", async () => {
  const { database, recurring } = testRepositories();
  try {
    const created = await postRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "POST", body: JSON.stringify(variablePlan) }), recurring);
    const plan = (await created.json()).recurringExpense;
    assert.equal((await completeRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "PATCH", body: JSON.stringify({ id: plan.id, expectedNextDueAt: plan.nextDueAt, amountCents: 0 }) }), recurring)).status, 400);
    assert.equal((await completeRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "PATCH", body: JSON.stringify({ id: plan.id, expectedNextDueAt: plan.nextDueAt }) }), recurring)).status, 409);
    assert.equal((await completeRecurringExpense(new Request("http://localhost/api/recurring-expenses", { method: "PATCH", body: JSON.stringify({ id: plan.id, expectedNextDueAt: plan.nextDueAt, amountCents: 2_500 }) }), recurring)).status, 201);
  } finally { database.close(); }
});
