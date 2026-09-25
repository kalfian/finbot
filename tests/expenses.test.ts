import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("repository persists expenses after a file-backed database is reopened", () => {
  const directory = mkdtempSync(join(tmpdir(), "ledger-expenses-"));
  const path = join(directory, "expenses.db");
  const firstDatabase = new Database(path);

  try {
    initializeDatabase(firstDatabase);
    const created = createExpenseRepository(firstDatabase).create({
      amountCents: 2350,
      description: "Train fare",
      date: "2026-02-15",
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
        body: JSON.stringify({ amountCents: 1.5, description: "Fraction", date: "2026-02-14" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: Number.MAX_SAFE_INTEGER + 1, description: "Unsafe", date: "2026-02-14" }),
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
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "   ", date: "2026-02-14" }),
      }),
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Impossible date", date: "2026-02-30" }),
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
      body: JSON.stringify({ amountCents: 100, description: "Coffee", date: "2026-02-14" }),
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
    const { GET, POST } = await import("../app/api/expenses/route");

    const getResponse = GET();
    assert.equal(getResponse.status, 500);
    assert.deepEqual(await getResponse.json(), {
      error: "We couldn't load expenses. Please try again.",
    });

    const postResponse = await POST(
      new Request("http://localhost/api/expenses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100, description: "Coffee", date: "2026-02-14" }),
      }),
    );
    assert.equal(postResponse.status, 500);
    assert.deepEqual(await postResponse.json(), {
      error: "We couldn't save this expense. Please try again.",
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
