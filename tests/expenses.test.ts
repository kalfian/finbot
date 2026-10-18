import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { getCustomCategories, postCustomCategory } from "../lib/custom-category-api";
import { createCustomCategoryRepository } from "../lib/custom-categories";
import { createExpenseRepository } from "../lib/expenses";
import { deleteExpense, getExpenses, postExpense, putExpense } from "../lib/expense-api";

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

test("repository persists expenses after a file-backed database is reopened", () => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-expenses-"));
  const path = join(directory, "expenses.db");
  const firstDatabase = new Database(path);

  try {
    initializeDatabase(firstDatabase);
    const created = createExpenseRepository(firstDatabase).create({
      amountCents: 2350,
      description: "Train fare",
      category: "Transport",
      date: "2026-02-15T08:00:00.000Z",
    });
    firstDatabase.close();

    const reopenedDatabase = new Database(path);
    try {
      initializeDatabase(reopenedDatabase);
      assert.deepEqual(createExpenseRepository(reopenedDatabase).list(), [created]);
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
    assert.deepEqual(createExpenseRepository(database).list(), [{
      id: 1,
      amountCents: 1000,
      description: "Legacy expense",
      category: "Other",
      date: "2026-02-14",
      createdAt: "2026-02-14T08:30:00.000Z",
    }]);
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

test("POST accepts the Entertainment category", async () => {
  const { database, repository } = createTestRepository();
  try {
    const response = await postExpense(new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: 2500000, description: "Movie ticket", category: "Entertainment", date: "2026-02-14T08:30:00.000Z" }),
    }), repository);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).expense.category, "Entertainment");
  } finally {
    database.close();
  }
});

test("custom categories persist, reject unsafe duplicates, and can be used for an expense", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-categories-"));
  const path = join(directory, "categories.db");
  const database = new Database(path);
  try {
    initializeDatabase(database);
    const categories = createCustomCategoryRepository(database);
    const create = await postCustomCategory(new Request("http://localhost/api/categories", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "  Pet   Care  " }),
    }), categories);
    assert.equal(create.status, 201);
    assert.deepEqual(await create.json(), { category: "Pet Care" });
    assert.deepEqual(await getCustomCategories(categories).json(), { categories: ["Pet Care"] });

    for (const name of ["pet care", "Food", "", "x".repeat(41), "<img src=x onerror=alert(1)>"]) {
      const response = await postCustomCategory(new Request("http://localhost/api/categories", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }),
      }), categories);
      assert.equal(response.status, 400);
    }

    const expense = await postExpense(new Request("http://localhost/api/expenses", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ amountCents: 1200, description: "Vet visit", category: "Pet Care", date: "2026-02-14T08:30:00.000Z" }),
    }), createExpenseRepository(database));
    assert.equal(expense.status, 201);
    assert.equal((await expense.json()).expense.category, "Pet Care");
    database.close();

    const reopened = new Database(path);
    try {
      initializeDatabase(reopened);
      assert.deepEqual(createCustomCategoryRepository(reopened).list(), ["Pet Care"]);
      assert.equal(createExpenseRepository(reopened).list()[0].category, "Pet Care");
    } finally { reopened.close(); }
  } finally {
    if (database.open) database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("POST rejects invalid input without creating an expense", async () => {
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
        body: JSON.stringify({ amountCents: 100, description: "Coffee", category: "Unknown", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 1.5, description: "Fraction", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: Number.MAX_SAFE_INTEGER + 1, description: "Unsafe", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 0, description: "Free", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: -100, description: "Refund", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "   ", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Impossible date", category: "Food", date: "2026-02-30T08:30:00.000Z" }),
      }),
      new Request("http://localhost/api/expenses", {
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

test("query applies the active filters to both page data and summary totals", async () => {
  const { database, repository } = createTestRepository();
  try {
    repository.create({ amountCents: 100, description: "Old food", category: "Food", date: "2026-02-01T08:00:00.000Z" });
    repository.create({ amountCents: 200, description: "Current food", category: "Food", date: "2026-02-10T08:00:00.000Z" });
    repository.create({ amountCents: 400, description: "Current travel", category: "Transport", date: "2026-02-11T08:00:00.000Z" });
    const response = getExpenses(repository, new Request("http://localhost/api/expenses?start=2026-02-10T00%3A00%3A00.000Z&end=2026-02-12T00%3A00%3A00.000Z&priorStart=2026-02-08T00%3A00%3A00.000Z&priorEnd=2026-02-10T00%3A00%3A00.000Z&category=Food&limit=1&offset=0"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      expenses: [repository.list()[1]], totalCount: 1, totalCents: 200,
      insights: {
        categories: [{ category: "Food", totalCents: 200, transactionCount: 1, percentage: 100 }],
        months: [{ month: "2026-02", totalCents: 200, transactionCount: 1 }],
      },
      summary: { totalCents: 200, transactionCount: 1, priorTotalCents: 0, priorTransactionCount: 0 },
    });
  } finally { database.close(); }
});

test("query combines case-insensitive description, custom category, date, and amount filters", async () => {
  const { database, repository } = createTestRepository();
  try {
    const categories = createCustomCategoryRepository(database);
    categories.create("Pet Care");
    repository.create({ amountCents: 1200, description: "Vet Visit", category: "Pet Care", date: "2026-02-10T08:00:00.000Z" });
    repository.create({ amountCents: 900, description: "Vet medicine", category: "Pet Care", date: "2026-02-10T08:00:00.000Z" });
    repository.create({ amountCents: 1200, description: "Vet Visit", category: "Food", date: "2026-02-10T08:00:00.000Z" });
    const response = getExpenses(repository, new Request("http://localhost/api/expenses?search=VET&category=Pet%20Care&start=2026-02-10T00%3A00%3A00.000Z&end=2026-02-11T00%3A00%3A00.000Z&minAmountCents=1000&maxAmountCents=1300"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.totalCount, 1);
    assert.equal(body.expenses[0].description, "Vet Visit");
    assert.equal(body.expenses[0].category, "Pet Care");
  } finally { database.close(); }
});

test("query rejects invalid or inverted filter ranges", async () => {
  const { database, repository } = createTestRepository();
  try {
    for (const query of ["start=not-a-date", "start=2026-02-11T00%3A00%3A00.000Z&end=2026-02-10T00%3A00%3A00.000Z", "minAmountCents=9&maxAmountCents=8", "priorStart=2026-02-01T00%3A00%3A00.000Z", "category=Unknown", "search=" + "x".repeat(121), "limit=0"]) {
      assert.equal(getExpenses(repository, new Request(`http://localhost/api/expenses?${query}`)).status, 400);
    }
  } finally { database.close(); }
});

test("date-filtered queries retain legacy calendar-only rows and paginate independently from totals", async () => {
  const { database, repository } = createTestRepository();
  try {
    database.prepare("INSERT INTO expenses (amount_cents, description, category, date, created_at) VALUES (?, ?, ?, ?, ?)").run(100, "Legacy", "Other", "2026-02-10", "2026-02-10T00:00:00.000Z");
    repository.create({ amountCents: 200, description: "First", category: "Food", date: "2026-02-10T08:00:00.000Z" });
    repository.create({ amountCents: 300, description: "Second", category: "Food", date: "2026-02-10T09:00:00.000Z" });
    const response = getExpenses(repository, new Request("http://localhost/api/expenses?start=2026-02-10T00%3A00%3A00.000Z&end=2026-02-11T00%3A00%3A00.000Z&limit=1&offset=1"));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.expenses.length, 1);
    assert.equal(body.totalCount, 3);
    assert.equal(body.totalCents, 600);
    assert.equal(body.summary.totalCents, 600);
  } finally { database.close(); }
});

test("PUT and DELETE update or remove exactly one expense", async () => {
  const { database, repository } = createTestRepository();
  try {
    const created = repository.create({ amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" });
    const update = await putExpense(new Request("http://localhost/api/expenses", { method: "PUT", body: JSON.stringify({ id: created.id, amountCents: 250, description: "Tea", category: "Food", date: "2026-02-15T08:30:00.000Z" }) }), repository);
    assert.equal(update.status, 200);
    assert.deepEqual((await update.json()).expense, { ...created, amountCents: 250, description: "Tea", date: "2026-02-15T08:30:00.000Z" });
    const remove = await deleteExpense(new Request("http://localhost/api/expenses", { method: "DELETE", body: JSON.stringify({ id: created.id }) }), repository);
    assert.equal(remove.status, 200);
    assert.equal((await remove.json()).expense.date, "2026-02-15T08:30:00.000Z");
    assert.deepEqual(repository.list(), []);
    assert.equal((await deleteExpense(new Request("http://localhost/api/expenses", { method: "DELETE", body: JSON.stringify({ id: created.id }) }), repository)).status, 404);
  } finally { database.close(); }
});

test("PUT and DELETE reject malformed requests without changing the ledger", async () => {
  const { database, repository } = createTestRepository();
  try {
    const created = repository.create({ amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" });
    const invalidUpdate = await putExpense(new Request("http://localhost/api/expenses", { method: "PUT", body: JSON.stringify({ id: created.id, amountCents: 0, description: "Coffee", category: "Food", date: created.date }) }), repository);
    const invalidDelete = await deleteExpense(new Request("http://localhost/api/expenses", { method: "DELETE", body: "{" }), repository);
    assert.equal(invalidUpdate.status, 400);
    assert.equal(invalidDelete.status, 400);
    assert.deepEqual(repository.list(), [created]);
  } finally { database.close(); }
});

test("API returns a generic error when persistence fails", async () => {
  const failingRepository = {
    create() {
      throw new Error("database path should not be exposed");
    },
    list() {
      throw new Error("database path should not be exposed");
    },
  };

  const createResponse = await postExpense(
    new Request("http://localhost/api/expenses", {
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
});

test("route handlers return generic errors when database setup fails", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-route-"));
  const blockedDirectory = join(directory, "not-a-directory");
  const originalDatabasePath = process.env.DATABASE_PATH;
  const moduleWithResolver = Module as unknown as {
    _resolveFilename: (
      request: string,
      parent: unknown,
      isMain: boolean,
      options: unknown,
    ) => string;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  writeFileSync(blockedDirectory, "");
  process.env.DATABASE_PATH = join(blockedDirectory, "expenses.db");
  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => {
    if (request === "server-only") {
      return join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js");
    }
    return originalResolveFilename(request, parent, isMain, options);
  };

  try {
    const { DELETE, GET, POST, PUT } = await import("../app/api/expenses/route");

    const getResponse = GET();
    assert.equal(getResponse.status, 500);
    assert.deepEqual(await getResponse.json(), {
      error: "We couldn't load expenses. Please try again.",
    });

    const postResponse = await POST(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
    );
    assert.equal(postResponse.status, 500);
    assert.deepEqual(await postResponse.json(), {
      error: "We couldn't save this expense. Please try again.",
    });

    const putResponse = await PUT(
      new Request("http://localhost/api/expenses", {
        method: "PUT",
        body: JSON.stringify({ id: 1, amountCents: 100, description: "Coffee", category: "Food", date: "2026-02-14T08:30:00.000Z" }),
      }),
    );
    assert.equal(putResponse.status, 500);
    assert.deepEqual(await putResponse.json(), {
      error: "We couldn't update this expense. Please try again.",
    });

    const deleteResponse = await DELETE(
      new Request("http://localhost/api/expenses", {
        method: "DELETE",
        body: JSON.stringify({ id: 1 }),
      }),
    );
    assert.equal(deleteResponse.status, 500);
    assert.deepEqual(await deleteResponse.json(), {
      error: "We couldn't delete this expense. Please try again.",
    });
  } finally {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    if (originalDatabasePath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDatabasePath;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
