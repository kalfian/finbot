import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";

test("legacy data migrates to admin ownership with required isolation indexes", () => {
  const database = new Database(":memory:");
  try {
    database.exec(`
      CREATE TABLE expenses (
        id INTEGER PRIMARY KEY,
        amount_cents INTEGER NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Other',
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO expenses VALUES (7, 1000, 'Legacy expense', 'Other', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      CREATE TABLE api_tokens (
        id INTEGER PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      INSERT INTO api_tokens VALUES (8, 'Legacy token', 'legacy-hash', '2026-01-01T00:00:00.000Z');
      CREATE TABLE budget_settings (id INTEGER PRIMARY KEY, monthly_limit_cents INTEGER NOT NULL);
      INSERT INTO budget_settings VALUES (1, 5000);
      CREATE TABLE expense_sources (source_id TEXT PRIMARY KEY, expense_id INTEGER NOT NULL REFERENCES expenses(id));
      INSERT INTO expense_sources VALUES ('legacy-source', 7);
    `);

    initializeDatabase(database);

    assert.equal((database.prepare("SELECT user_id FROM expenses WHERE id = 7").get() as { user_id: number }).user_id, 1);
    assert.equal((database.prepare("SELECT user_id FROM api_tokens WHERE id = 8").get() as { user_id: number }).user_id, 1);
    assert.equal((database.prepare("SELECT user_id FROM budget_settings").get() as { user_id: number }).user_id, 1);
    assert.equal((database.prepare("SELECT user_id FROM expense_sources").get() as { user_id: number }).user_id, 1);
    assert.equal((database.prepare("SELECT length(value) AS length FROM app_secrets WHERE name = 'session_jwt'").get() as { length: number }).length >= 43, true);

    const indexes = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>).map(({ name }) => name));
    for (const name of ["users_username_unique", "expenses_user_date_id", "expenses_user_category", "expense_categories_user_name", "api_tokens_user_id_id", "expense_sources_expense_id", "sessions_user_id", "sessions_expires_at"]) {
      assert.equal(indexes.has(name), true, `${name} should exist`);
    }
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM expense_categories WHERE user_id = 1").get() as { count: number }).count, 6);
    const plan = database.prepare("EXPLAIN QUERY PLAN SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC").all(1) as Array<{ detail: string }>;
    assert.equal(plan.some(({ detail }) => detail.includes("expenses_user_date_id")), true);
    assert.throws(() => database.prepare("UPDATE expenses SET user_id = NULL WHERE id = 7").run(), /user_id is required/);
    assert.throws(() => database.prepare("UPDATE api_tokens SET user_id = NULL WHERE id = 8").run(), /user_id is required/);
  } finally {
    database.close();
  }
});
