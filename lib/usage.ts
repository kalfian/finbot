import type Database from "better-sqlite3";
import { createExpenseRepository } from "./expenses";
import { getUserSettings } from "./user-settings";
import { summarizeUsage } from "./timezone";

export function usageSnapshot(
  database: Database.Database,
  userId: number,
  at = new Date().toISOString(),
) {
  return summarizeUsage(
    createExpenseRepository(database, userId).list(),
    getUserSettings(database, userId).timezone,
    at,
  );
}
