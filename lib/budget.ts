import type Database from "better-sqlite3";
import { validDate } from "./expense-filters";
import { usageSnapshot } from "./usage";

export type BudgetSnapshot = {
  timezone: string;
  weekCents: number;
  weekStart: string;
  weekEnd: string;
  date: string;
  month: string;
  todayCents: number;
  monthCents: number;
  monthlyLimitCents: number | null;
  remainingCents: number | null;
  exceeded: boolean;
};

export function createBudgetRepository(database: Database.Database, userId: number) {
  const get = database.prepare("SELECT monthly_limit_cents FROM budget_settings WHERE user_id = ?");
  const set = database.prepare("INSERT INTO budget_settings (user_id, monthly_limit_cents) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET monthly_limit_cents = excluded.monthly_limit_cents");
  const clear = database.prepare("DELETE FROM budget_settings WHERE user_id = ?");
  return {
    getMonthlyLimitCents(): number | null {
      return (get.get(userId) as { monthly_limit_cents: number } | undefined)?.monthly_limit_cents ?? null;
    },
    setMonthlyLimitCents(value: number | null): number | null {
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new Error("monthlyLimitCents must be a positive integer or null.");
      }
      if (value === null) clear.run(userId);
      else set.run(userId, value);
      return value;
    },
  };
}

export function budgetSnapshot(database: Database.Database, userId: number, at: string = new Date().toISOString()): BudgetSnapshot {
  const usage = usageSnapshot(database, userId, at);
  const date = usage.date;
  const month = date.slice(0, 7);
  const todayCents = usage.day.totalCents;
  const monthCents = usage.month.totalCents;
  const monthlyLimitCents = createBudgetRepository(database, userId).getMonthlyLimitCents();
  const remainingCents = monthlyLimitCents === null ? null : monthlyLimitCents - monthCents;
  return { timezone: usage.timezone, weekCents: usage.week.totalCents, weekStart: usage.week.start, weekEnd: usage.week.end, date, month, todayCents, monthCents, monthlyLimitCents, remainingCents, exceeded: remainingCents !== null && remainingCents < 0 };
}

export function validBudgetDate(value: string): boolean {
  return validDate(value);
}
