import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, hashPassword } from "./auth";

const defaultDatabasePath = "data/financial-tracker.db";

export function databasePath(): string {
  const configuredPath = process.env.DATABASE_PATH || defaultDatabasePath;

  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(/* turbopackIgnore: true */ configuredPath);
}

export function openDatabase(): Database.Database {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  const database = new Database(path);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  return database;
}

export function initializeDatabase(database = openDatabase()): void {
  database.pragma("foreign_keys = ON");
  createUsersTable(database);
  createBootstrapAdmin(database);
  const columns = database
    .prepare("SELECT name FROM pragma_table_info('expenses')")
    .all() as Array<{ name: string }>;

  if (
    columns.some((column) => column.name === "spent_on") &&
    !columns.some((column) => column.name === "date")
  ) {
    database.transaction(() => {
      database.exec("ALTER TABLE expenses RENAME TO expenses_legacy;");
      createExpensesTable(database);
      database.exec(`
        INSERT INTO expenses (id, user_id, amount_cents, description, category, date, created_at)
        SELECT id, 1, amount_cents, description, 'Other', spent_on, created_at
        FROM expenses_legacy;
        DROP TABLE expenses_legacy;
      `);
    })();
  } else {
    createExpensesTable(database);
    if (columns.length > 0 && !columns.some((column) => column.name === "category")) {
      database.exec("ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';");
    }
    if (columns.length > 0 && !columns.some((column) => column.name === "user_id")) {
      database.exec("ALTER TABLE expenses ADD COLUMN user_id INTEGER REFERENCES users(id);");
      database.exec("UPDATE expenses SET user_id = 1 WHERE user_id IS NULL;");
    }
  }
  createTokensTable(database);
  migrateTokens(database);
  migrateBudgetTable(database);
  createExpenseSources(database);
  createProofsTable(database);
  createSessionsTable(database);
  createIndexes(database);
}

function createUsersTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
      failed_login_count INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username COLLATE NOCASE);
  `);
}

function createBootstrapAdmin(database: Database.Database): void {
  if (database.prepare("SELECT 1 FROM users WHERE id = 1").get()) return;
  database.prepare(`
    INSERT INTO users (id, username, role, password_hash, must_change_password, created_at)
    VALUES (1, ?, 'admin', ?, 1, ?)
  `).run(DEFAULT_ADMIN_USERNAME, hashPassword(DEFAULT_ADMIN_PASSWORD), new Date().toISOString());
}

function createProofsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expense_proofs (
      id TEXT PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id),
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      source_id TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (expense_id, source_id)
    );
    CREATE INDEX IF NOT EXISTS expense_proofs_expense_id ON expense_proofs(expense_id);
  `);
}

function createExpenseSources(database: Database.Database): void {
  const columns = database.prepare("SELECT name FROM pragma_table_info('expense_sources')").all() as Array<{ name: string }>;
  if (columns.length > 0 && !columns.some((column) => column.name === "user_id")) {
    database.transaction(() => {
      database.exec("ALTER TABLE expense_sources RENAME TO expense_sources_legacy;");
      database.exec(`
        CREATE TABLE expense_sources (
          user_id INTEGER NOT NULL REFERENCES users(id),
          source_id TEXT NOT NULL,
          expense_id INTEGER NOT NULL REFERENCES expenses(id),
          PRIMARY KEY (user_id, source_id)
        );
        INSERT INTO expense_sources (user_id, source_id, expense_id)
        SELECT expenses.user_id, expense_sources_legacy.source_id, expense_sources_legacy.expense_id
        FROM expense_sources_legacy JOIN expenses ON expenses.id = expense_sources_legacy.expense_id;
        DROP TABLE expense_sources_legacy;
      `);
    })();
    return;
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS expense_sources (
      user_id INTEGER NOT NULL REFERENCES users(id),
      source_id TEXT NOT NULL,
      expense_id INTEGER NOT NULL REFERENCES expenses(id),
      PRIMARY KEY (user_id, source_id)
    );
  `);
}

function migrateBudgetTable(database: Database.Database): void {
  const columns = database.prepare("SELECT name FROM pragma_table_info('budget_settings')").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "id")) {
    database.transaction(() => {
      database.exec("ALTER TABLE budget_settings RENAME TO budget_settings_legacy;");
      database.exec(`
        CREATE TABLE budget_settings (
          user_id INTEGER PRIMARY KEY REFERENCES users(id),
          monthly_limit_cents INTEGER NOT NULL CHECK (monthly_limit_cents > 0)
        );
        INSERT INTO budget_settings (user_id, monthly_limit_cents)
        SELECT 1, monthly_limit_cents FROM budget_settings_legacy WHERE id = 1;
        DROP TABLE budget_settings_legacy;
      `);
    })();
    return;
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS budget_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      monthly_limit_cents INTEGER NOT NULL CHECK (monthly_limit_cents > 0)
    );
  `);
}

function createTokensTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      label TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);
}

function migrateTokens(database: Database.Database): void {
  const columns = database.prepare("SELECT name FROM pragma_table_info('api_tokens')").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "user_id")) {
    database.exec("ALTER TABLE api_tokens ADD COLUMN user_id INTEGER REFERENCES users(id);");
    database.exec("UPDATE api_tokens SET user_id = 1 WHERE user_id IS NULL;");
  }
}

function createSessionsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function createIndexes(database: Database.Database): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS expenses_user_date_id ON expenses(user_id, date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS api_tokens_user_id_id ON api_tokens(user_id, id DESC);
    CREATE INDEX IF NOT EXISTS expense_sources_expense_id ON expense_sources(expense_id);
    CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions(expires_at);
    CREATE TRIGGER IF NOT EXISTS expenses_require_user_insert
      BEFORE INSERT ON expenses WHEN NEW.user_id IS NULL
      BEGIN SELECT RAISE(ABORT, 'expenses.user_id is required'); END;
    CREATE TRIGGER IF NOT EXISTS expenses_require_user_update
      BEFORE UPDATE OF user_id ON expenses WHEN NEW.user_id IS NULL
      BEGIN SELECT RAISE(ABORT, 'expenses.user_id is required'); END;
    CREATE TRIGGER IF NOT EXISTS api_tokens_require_user_insert
      BEFORE INSERT ON api_tokens WHEN NEW.user_id IS NULL
      BEGIN SELECT RAISE(ABORT, 'api_tokens.user_id is required'); END;
    CREATE TRIGGER IF NOT EXISTS api_tokens_require_user_update
      BEFORE UPDATE OF user_id ON api_tokens WHEN NEW.user_id IS NULL
      BEGIN SELECT RAISE(ABORT, 'api_tokens.user_id is required'); END;
  `);
}

function createExpensesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
