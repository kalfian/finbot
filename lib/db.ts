import "server-only";

import type Database from "better-sqlite3";

import { databasePath, initializeDatabase, openDatabase } from "./database";

let database: Database.Database | undefined;

/** Returns the process-local database connection with the current schema initialized. */
export function getDatabase(): Database.Database {
  database ??= openDatabase();
  initializeDatabase(database);
  return database;
}

export { databasePath, initializeDatabase, openDatabase };
