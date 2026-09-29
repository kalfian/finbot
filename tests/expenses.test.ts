import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { deleteExpense, getExpenses, patchExpense, postExpense } from "../lib/expense-api";
import { createUserRepository } from "../lib/auth";

function createTestRepository() {
  const database = new Database(":memory:");
  initializeDatabase(database);

  return { database, repository: createExpenseRepository(database, 1) };
}

test("repository creates expenses and lists them by newest expense date", () => {
  const { database, repository } = createTestRepository();
  try {
    const older = repository.create({
      amountCents: 1250,
      description: "Coffee beans",
      category: "Food",
      date: "2026-01-01T08:00:00.000Z",
    });
    const newer = repository.create({
      amountCents: 4500,
      description: "Groceries",
      category: "Food",
      date: "2026-01-03T08:00:00.000Z",
    });

    assert.deepEqual(repository.list(), [newer, older]);
  } finally {
    database.close();
  }
});

test("repository updates an expense without changing its identity or proofs", () => {
  const { database, repository } = createTestRepository();
  try {
    const created = repository.create({
      amountCents: 1250,
      description: "Coffee beans",
      category: "Food",
      date: "2026-01-01T08:00:00.000Z",
    });
    database.prepare(`
      INSERT INTO expense_proofs (id, expense_id, filename, mime_type, size_bytes, sha256, created_at)
      VALUES ('proof-1', ?, 'receipt.pdf', 'application/pdf', 10, 'hash', '2026-01-01T09:00:00.000Z')
    `).run(created.id);

    const updated = repository.update(created.id, {
      amountCents: 5000,
      description: "Weekly groceries",
      category: "Shopping",
      date: "2026-01-03T08:00:00.000Z",
    });

    assert.deepEqual(updated, {
      ...created,
      amountCents: 5000,
      description: "Weekly groceries",
      category: "Shopping",
      date: "2026-01-03T08:00:00.000Z",
      proofCount: 1,
    });
    assert.equal(repository.update(999, {
      amountCents: 100,
      description: "Missing",
      category: "Other",
      date: "2026-01-03T08:00:00.000Z",
    }), null);
  } finally {
    database.close();
  }
});

test("expenses and source IDs are isolated by user", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("second-user", "temporary123");
    const adminExpenses = createExpenseRepository(database, 1);
    const userExpenses = createExpenseRepository(database, user.id);
    const adminInput = { amountCents: 1000, description: "Admin lunch", category: "Food", date: "2026-02-14T08:30:00.000Z" };
    const userInput = { amountCents: 2500, description: "User train", category: "Transport", date: "2026-02-14T09:30:00.000Z" };
    const adminExpense = adminExpenses.record(adminInput, "chat:shared").expense;
    const userExpense = userExpenses.record(userInput, "chat:shared").expense;

    assert.deepEqual(adminExpenses.list(), [adminExpense]);
    assert.deepEqual(userExpenses.list(), [userExpense]);
    assert.equal(userExpenses.update(adminExpense.id, userInput), null);
    assert.equal(adminExpenses.list()[0].description, "Admin lunch");
  } finally {
    database.close();
  }
});

test("repository deletion removes owned expense relations without crossing users", async () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("delete-user", "temporary123");
    const adminExpenses = createExpenseRepository(database, 1);
    const userExpenses = createExpenseRepository(database, user.id);
    const adminExpense = adminExpenses.record({ amountCents: 1000, description: "Admin", category: "Other", date: "2026-02-14T08:30:00.000Z" }, "delete:shared").expense;
    userExpenses.record({ amountCents: 2000, description: "User", category: "Other", date: "2026-02-14T09:30:00.000Z" }, "delete:shared");
    database.prepare(`INSERT INTO expense_proofs (id, expense_id, filename, mime_type, size_bytes, sha256, created_at)
      VALUES ('delete-proof', ?, 'receipt.png', 'image/png', 12, 'hash', '2026-02-14T10:00:00.000Z')`).run(adminExpense.id);

    assert.equal(userExpenses.delete(adminExpense.id), null);
    const cleaned: unknown[] = [];
    const response = deleteExpense(adminExpense.id, adminExpenses, (proofs) => cleaned.push(...proofs));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, expense: { ...adminExpense, proofCount: 1 } });
    assert.deepEqual(cleaned, [{ id: "delete-proof", mimeType: "image/png" }]);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM expense_sources WHERE expense_id = ?").get(adminExpense.id) as { count: number }).count, 0);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM expense_proofs WHERE expense_id = ?").get(adminExpense.id) as { count: number }).count, 0);
    assert.equal(adminExpenses.list().length, 0);
    assert.equal(userExpenses.list().length, 1);
    assert.equal(deleteExpense(adminExpense.id, adminExpenses).status, 404);
  } finally {
    database.close();
  }
});

test("repository persists expenses after a file-backed database is reopened", () => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-expenses-"));
  const path = join(directory, "expenses.db");
  const firstDatabase = new Database(path);

  try {
    initializeDatabase(firstDatabase);
    const created = createExpenseRepository(firstDatabase, 1).create({
      amountCents: 2350,
      description: "Train fare",
      category: "Transport",
      date: "2026-02-15T08:00:00.000Z",
    });
    firstDatabase.close();

    const reopenedDatabase = new Database(path);
    try {
      initializeDatabase(reopenedDatabase);
      assert.deepEqual(createExpenseRepository(reopenedDatabase, 1).list(), [created]);
    } finally {
      reopenedDatabase.close();
    }
  } finally {
    if (firstDatabase.open) firstDatabase.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database migration gives existing expenses the backwards-compatible Other category", () => {
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
      INSERT INTO expenses (amount_cents, description, date, created_at)
      VALUES (1000, 'Legacy expense', '2026-02-14', '2026-02-14T08:30:00.000Z');
    `);
    initializeDatabase(database);
    assert.deepEqual(createExpenseRepository(database, 1).list(), [{
      id: 1,
      amountCents: 1000,
      description: "Legacy expense",
      category: "Other",
      date: "2026-02-14",
      createdAt: "2026-02-14T08:30:00.000Z",
      proofCount: 0,
    }]);
  } finally {
    database.close();
  }
});

test("POST creates an expense and GET returns the JSON list", async () => {
  const { database, repository } = createTestRepository();
  try {
    const createResponse = await postExpense(
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountCents: 1999,
          description: "Lunch",
          category: "Food",
          date: "2026-02-14T08:30:00.000Z",
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
        category: "Food",
        date: "2026-02-14T08:30:00.000Z",
        createdAt: created.expense.createdAt,
        proofCount: 0,
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

test("POST rejects invalid input without creating an expense", async () => {
  const { database, repository } = createTestRepository();
  try {
    const requests = [
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100 }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Coffee", category: "Unknown", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 1.5, description: "Fraction", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: Number.MAX_SAFE_INTEGER + 1, description: "Unsafe", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 0, description: "Free", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: -100, description: "Refund", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "   ", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Impossible date", category: "Food", date: "2026-02-30T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/v1/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(["not", "an", "object"]),
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

test("PATCH updates an expense and returns validation and not-found errors", async () => {
  const { database, repository } = createTestRepository();
  try {
    const created = repository.create({
      amountCents: 1000,
      description: "Lunch",
      category: "Food",
      date: "2026-02-14T08:30:00.000Z",
    });
    const response = await patchExpense(
      new Request(`http://localhost/api/v1/expenses/${created.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 2500, description: "Dinner", category: "Food", date: "2026-02-14T12:30:00.000Z" }),
      }),
      created.id,
      repository,
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      expense: { ...created, amountCents: 2500, description: "Dinner", date: "2026-02-14T12:30:00.000Z" },
    });

    const invalid = await patchExpense(
      new Request(`http://localhost/api/v1/expenses/${created.id}`, { method: "PATCH", body: JSON.stringify({ amountCents: 0 }) }),
      created.id,
      repository,
    );
    assert.equal(invalid.status, 400);

    const missing = await patchExpense(
      new Request("http://localhost/api/v1/expenses/999", {
        method: "PATCH",
        body: JSON.stringify({ amountCents: 2500, description: "Dinner", category: "Food", date: "2026-02-14T12:30:00.000Z" }),
      }),
      999,
      repository,
    );
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "Expense not found." });
  } finally {
    database.close();
  }
});

test("API returns a generic error when persistence fails", async () => {
  const failingRepository = {
    create() {
      throw new Error("database path should not be exposed");
    },
    list() {
      throw new Error("database path should not be exposed");
    },
    update() {
      throw new Error("database path should not be exposed");
    },
    delete() {
      throw new Error("database path should not be exposed");
    },
  };

  const createResponse = await postExpense(
    new Request("http://localhost/api/v1/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
    }),
    failingRepository,
  );
  assert.equal(createResponse.status, 500);
  assert.deepEqual(await createResponse.json(), {
    error: "We couldn't save this expense. Please try again.",
  });

  const listResponse = getExpenses(failingRepository);
  assert.equal(listResponse.status, 500);
  assert.deepEqual(await listResponse.json(), {
    error: "We couldn't load expenses. Please try again.",
  });

  const updateResponse = await patchExpense(
    new Request("http://localhost/api/v1/expenses/1", {
      method: "PATCH",
      body: JSON.stringify({ amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
    }),
    1,
    failingRepository,
  );
  assert.equal(updateResponse.status, 500);
  assert.deepEqual(await updateResponse.json(), {
    error: "We couldn't update this expense. Please try again.",
  });

  const deleteResponse = deleteExpense(1, failingRepository);
  assert.equal(deleteResponse.status, 500);
  assert.deepEqual(await deleteResponse.json(), {
    error: "We couldn't delete this expense. Please try again.",
  });
});
