import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

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

  return new Database(path);
}

export function initializeDatabase(database = openDatabase()): void {
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
        INSERT INTO expenses (id, amount_cents, description, category, date, created_at)
        SELECT id, amount_cents, description, 'Other', spent_on, created_at
        FROM expenses_legacy;
        DROP TABLE expenses_legacy;
      `);
    })();
    createCategoryBudgetsTable(database);
    createCustomExpenseCategoriesTable(database);
    createRecurringExpensesTable(database);
    createPortabilityTables(database);
    createAuthTables(database);
    return;
  }

  createExpensesTable(database);
  if (columns.length > 0 && !columns.some((column) => column.name === "category")) {
    database.exec("ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';");
  }
  createCategoryBudgetsTable(database);
  createCustomExpenseCategoriesTable(database);
  createRecurringExpensesTable(database);
  createPortabilityTables(database);
  createAuthTables(database);
}

/** Authentication is deliberately separate from financial records. */
function createAuthTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_throttle (
      scope TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}

/** Additive metadata tables keep the original expense ledger readable by older clients. */
function createPortabilityTables(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expense_tags (
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      tag TEXT NOT NULL CHECK (length(tag) BETWEEN 1 AND 50),
      PRIMARY KEY (expense_id, tag)
    );
    CREATE TABLE IF NOT EXISTS expense_splits (
      id INTEGER PRIMARY KEY,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      position INTEGER NOT NULL CHECK (position >= 0),
      UNIQUE (expense_id, position)
    );
    CREATE TABLE IF NOT EXISTS categorization_rules (
      id INTEGER PRIMARY KEY,
      match_type TEXT NOT NULL CHECK (match_type IN ('description', 'merchant')),
      pattern TEXT NOT NULL CHECK (length(pattern) BETWEEN 1 AND 120),
      category TEXT NOT NULL,
      position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expense_tags_tag_idx ON expense_tags(tag);
    CREATE INDEX IF NOT EXISTS expense_splits_expense_idx ON expense_splits(expense_id, position);
    CREATE INDEX IF NOT EXISTS categorization_rules_position_idx ON categorization_rules(position);
  `);
}

/** This is additive so databases created before budgets retain every expense. */
function createCategoryBudgetsTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS category_budgets (
      category TEXT NOT NULL,
      month TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (category, month)
    );
  `);
}

/** Custom categories are additive metadata; existing ledger rows remain untouched. */
function createCustomExpenseCategoriesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS custom_expense_categories (
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
}

/** Kept separate from the ledger: a plan only becomes an expense when completed. */
function createRecurringExpensesTable(database: Database.Database): void {
  const columns = database.prepare("SELECT name FROM pragma_table_info('recurring_expenses')").all() as Array<{ name: string }>;
  // Older plans always had an amount, so preserve them as fixed while making
  // room for variable plans whose amount is supplied only when paid.
  if (columns.length > 0 && !columns.some((column) => column.name === "amount_type")) {
    database.transaction(() => {
      database.exec("DROP INDEX IF EXISTS recurring_expenses_due_idx;");
      database.exec("ALTER TABLE recurring_expenses RENAME TO recurring_expenses_legacy;");
      createRecurringExpensesTableSchema(database);
      database.exec(`
        INSERT INTO recurring_expenses (id, amount_cents, amount_type, description, category, frequency, next_due_at, active, created_at, updated_at)
        SELECT id, amount_cents, 'fixed', description, category, frequency, next_due_at, active, created_at, updated_at
        FROM recurring_expenses_legacy;
        DROP TABLE recurring_expenses_legacy;
      `);
    })();
    return;
  }
  createRecurringExpensesTableSchema(database);
}

function createRecurringExpensesTableSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS recurring_expenses (
      id INTEGER PRIMARY KEY,
      amount_cents INTEGER,
      amount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (amount_type IN ('fixed', 'variable')),
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
      next_due_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (amount_type = 'fixed' AND amount_cents > 0)
        OR (amount_type = 'variable' AND amount_cents IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS recurring_expenses_due_idx
      ON recurring_expenses (active, next_due_at, id);
  `);
}

function createExpensesTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
