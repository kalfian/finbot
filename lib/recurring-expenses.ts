import type Database from "better-sqlite3";

import type { ExpenseCategory } from "./expense-form";
import type { Expense } from "./expenses";

export const RECURRING_FREQUENCIES = ["weekly", "monthly"] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];
export const RECURRING_AMOUNT_TYPES = ["fixed", "variable"] as const;
export type RecurringAmountType = (typeof RECURRING_AMOUNT_TYPES)[number];

export type RecurringExpense = {
  id: number;
  amountCents: number | null;
  amountType: RecurringAmountType;
  description: string;
  category: ExpenseCategory;
  frequency: RecurringFrequency;
  nextDueAt: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type NewRecurringExpense = Omit<RecurringExpense, "id" | "active" | "createdAt" | "updatedAt">;
export type UpdatedRecurringExpense = NewRecurringExpense & { active: boolean };

type RecurringExpenseRow = {
  id: number; amount_cents: number | null; amount_type: RecurringAmountType; description: string; category: ExpenseCategory;
  frequency: RecurringFrequency; next_due_at: string; active: number; created_at: string; updated_at: string;
};

function toRecurringExpense(row: RecurringExpenseRow): RecurringExpense {
  return { id: row.id, amountCents: row.amount_cents, amountType: row.amount_type, description: row.description, category: row.category, frequency: row.frequency, nextDueAt: row.next_due_at, active: row.active === 1, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Advances in UTC while clamping e.g. January 31 to February's last day. */
export function nextRecurringDueAt(dueAt: string, frequency: RecurringFrequency): string {
  const date = new Date(dueAt);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString();
}

export type RecurringExpenseRepository = {
  list(includeInactive?: boolean): RecurringExpense[];
  create(expense: NewRecurringExpense): RecurringExpense;
  update(id: number, expense: UpdatedRecurringExpense): RecurringExpense | undefined;
  delete(id: number): RecurringExpense | undefined;
  complete(id: number, expectedNextDueAt: string, amountCents?: number): { recurringExpense: RecurringExpense; expense: Expense } | undefined;
};

export function createRecurringExpenseRepository(database: Database.Database): RecurringExpenseRepository {
  const find = database.prepare("SELECT * FROM recurring_expenses WHERE id = ?");
  const toExpense = (row: { id: number; amount_cents: number; description: string; category: ExpenseCategory; date: string; created_at: string }): Expense => ({ id: row.id, amountCents: row.amount_cents, description: row.description, category: row.category, date: row.date, createdAt: row.created_at });
  return {
    list(includeInactive = false) {
      const query = includeInactive ? "SELECT * FROM recurring_expenses ORDER BY active DESC, next_due_at ASC, id ASC" : "SELECT * FROM recurring_expenses WHERE active = 1 ORDER BY next_due_at ASC, id ASC";
      return (database.prepare(query).all() as RecurringExpenseRow[]).map(toRecurringExpense);
    },
    create(expense) {
      const now = new Date().toISOString();
      const result = database.prepare("INSERT INTO recurring_expenses (amount_cents, amount_type, description, category, frequency, next_due_at, created_at, updated_at) VALUES (@amountCents, @amountType, @description, @category, @frequency, @nextDueAt, @createdAt, @updatedAt)").run({ ...expense, description: expense.description.trim(), createdAt: now, updatedAt: now });
      return toRecurringExpense(find.get(result.lastInsertRowid) as RecurringExpenseRow);
    },
    update(id, expense) {
      const now = new Date().toISOString();
      const result = database.prepare("UPDATE recurring_expenses SET amount_cents = @amountCents, amount_type = @amountType, description = @description, category = @category, frequency = @frequency, next_due_at = @nextDueAt, active = @active, updated_at = @updatedAt WHERE id = @id").run({ ...expense, description: expense.description.trim(), id, active: expense.active ? 1 : 0, updatedAt: now });
      return result.changes ? toRecurringExpense(find.get(id) as RecurringExpenseRow) : undefined;
    },
    delete(id) {
      const row = find.get(id) as RecurringExpenseRow | undefined;
      if (!row) return undefined;
      database.prepare("DELETE FROM recurring_expenses WHERE id = ?").run(id);
      return toRecurringExpense(row);
    },
    complete: database.transaction((id: number, expectedNextDueAt: string, amountCents?: number) => {
      const row = find.get(id) as RecurringExpenseRow | undefined;
      if (!row || row.active !== 1 || row.next_due_at !== expectedNextDueAt) return undefined;
      const paidAmountCents = row.amount_type === "fixed" ? row.amount_cents : amountCents;
      if (!paidAmountCents || !Number.isSafeInteger(paidAmountCents) || paidAmountCents <= 0) return undefined;
      const now = new Date().toISOString();
      const expenseResult = database.prepare("INSERT INTO expenses (amount_cents, description, category, date, created_at) VALUES (?, ?, ?, ?, ?)").run(paidAmountCents, row.description, row.category, row.next_due_at, now);
      const nextDueAt = nextRecurringDueAt(row.next_due_at, row.frequency);
      database.prepare("UPDATE recurring_expenses SET next_due_at = ?, updated_at = ? WHERE id = ?").run(nextDueAt, now, id);
      return { recurringExpense: toRecurringExpense(find.get(id) as RecurringExpenseRow), expense: toExpense(database.prepare("SELECT * FROM expenses WHERE id = ?").get(expenseResult.lastInsertRowid) as { id: number; amount_cents: number; description: string; category: ExpenseCategory; date: string; created_at: string }) };
    }),
  };
}
