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

export function createBudgetRepository(database: Database.Database) {
  const get = database.prepare("SELECT monthly_limit_cents FROM budget_settings WHERE id = 1");
  const set = database.prepare("INSERT INTO budget_settings (id, monthly_limit_cents) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET monthly_limit_cents = excluded.monthly_limit_cents");
  const clear = database.prepare("DELETE FROM budget_settings WHERE id = 1");
  return {
    getMonthlyLimitCents(): number | null {
      return (get.get() as { monthly_limit_cents: number } | undefined)?.monthly_limit_cents ?? null;
    },
    setMonthlyLimitCents(value: number | null): number | null {
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new Error("monthlyLimitCents must be a positive integer or null.");
      }
      if (value === null) clear.run();
      else set.run(value);
      return value;
    },
  };
}

export function budgetSnapshot(database: Database.Database, at: string = new Date().toISOString()): BudgetSnapshot {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(at) && validDate(at) ? at : jakartaDateKey(at);
  const month = date.slice(0, 7);
  let todayCents = 0;
  let monthCents = 0;
  for (const expense of createExpenseRepository(database).list()) {
    const key = jakartaDateKey(expense.date);
    if (key.startsWith(month)) monthCents += expense.amountCents;
    if (key === date) todayCents += expense.amountCents;
  }
  const monthlyLimitCents = createBudgetRepository(database).getMonthlyLimitCents();
  const remainingCents = monthlyLimitCents === null ? null : monthlyLimitCents - monthCents;
  return { date, month, todayCents, monthCents, monthlyLimitCents, remainingCents, exceeded: remainingCents !== null && remainingCents < 0 };
}

export function validBudgetDate(value: string): boolean {
  return validDate(value);
}
