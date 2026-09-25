import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const defaultDatabasePath = "data/financial-tracker.db";

export function databasePath(): string {
  const configuredPath = process.env.DATABASE_PATH || defaultDatabasePath;

  return isAbsolute(configuredPath)
    ? configuredPath
    : resolve(process.cwd(), configuredPath);
}

export function openDatabase(): Database.Database {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });

  return new Database(path);
}

export function initializeDatabase(database = openDatabase()): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      description TEXT NOT NULL,
      spent_on TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
