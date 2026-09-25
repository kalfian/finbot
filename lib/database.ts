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
    return;
  }

  createExpensesTable(database);
  if (columns.length > 0 && !columns.some((column) => column.name === "category")) {
    database.exec("ALTER TABLE expenses ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';");
  }
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
