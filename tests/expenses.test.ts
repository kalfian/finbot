import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { getExpenses, postExpense } from "../lib/expense-api";

function createTestRepository() {
  const database = new Database(":memory:");
  initializeDatabase(database);

  return { database, repository: createExpenseRepository(database) };
}

test("repository creates expenses and lists them by newest expense date", () => {
  const { database, repository } = createTestRepository();
  try {
    const older = repository.create({
      amountCents: 1250,
      description: "Coffee beans",
      date: "2026-01-01",
    });
    const newer = repository.create({
      amountCents: 4500,
      description: "Groceries",
      date: "2026-01-03",
    });

    assert.deepEqual(repository.list(), [newer, older]);
  } finally {
    database.close();
  }
});

test("POST creates an expense and GET returns the JSON list", async () => {
  const { database, repository } = createTestRepository();
  try {
    const createResponse = await postExpense(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents: 1999,
          description: "Lunch",
          date: "2026-02-14",
        }),
      }),
      repository,
    );

    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.deepEqual(created, {
      expense: {
        id: 1,
        amountCents: 1999,
        description: "Lunch",
        date: "2026-02-14",
        createdAt: created.expense.createdAt,
      },
    });
    assert.match(created.expense.createdAt, /^\d{4}-\d{2}-\d{2}T/);

    const listResponse = getExpenses(repository);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), { expenses: [created.expense] });
  } finally {
    database.close();
  }
});

test("POST rejects malformed, missing, zero, and negative expense input", async () => {
  const { database, repository } = createTestRepository();
  try {
    const requests = [
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100 }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 0, description: "Free", date: "2026-02-14" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: -100, description: "Refund", date: "2026-02-14" }),
      }),
    ];

    for (const request of requests) {
      const response = await postExpense(request, repository);
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(typeof body.error, "string");
    }
    assert.deepEqual(repository.list(), []);
  } finally {
    database.close();
  }
});
