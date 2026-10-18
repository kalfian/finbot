import type Database from "better-sqlite3";
import { jakartaDateKey, validDate } from "./expense-filters";
import { createExpenseRepository } from "./expenses";

export type BudgetSnapshot = {
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
  const date = /^\d{4}-\d{2}-\d{2}$/.test(at) && validDate(at) ? at : jakartaDateKey(at);
  const month = date.slice(0, 7);
  let todayCents = 0;
  let monthCents = 0;
  for (const expense of createExpenseRepository(database, userId).list()) {
    const key = jakartaDateKey(expense.date);
    if (key.startsWith(month)) monthCents += expense.amountCents;
    if (key === date) todayCents += expense.amountCents;
  }
  const monthlyLimitCents = createBudgetRepository(database, userId).getMonthlyLimitCents();
  const remainingCents = monthlyLimitCents === null ? null : monthlyLimitCents - monthCents;
  return { date, month, todayCents, monthCents, monthlyLimitCents, remainingCents, exceeded: remainingCents !== null && remainingCents < 0 };
}

export function validBudgetDate(value: string): boolean {
  return validDate(value);
}
