import type Database from "better-sqlite3";

import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expense-form";

export type CategoryBudget = {
  category: ExpenseCategory;
  month: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
};

export type NewCategoryBudget = Pick<CategoryBudget, "category" | "month" | "amountCents">;
export type BudgetThresholdState = "no-budget" | "on-track" | "near-limit" | "at-limit" | "overspent";
export type CategoryBudgetSummary = {
  category: ExpenseCategory;
  month: string;
  budgetCents: number | null;
  spentCents: number;
  remainingCents: number | null;
  overspentCents: number | null;
  progressPercent: number | null;
  thresholdState: BudgetThresholdState;
};

type BudgetRow = { category: ExpenseCategory; month: string; amount_cents: number; created_at: string; updated_at: string };

function toBudget(row: BudgetRow): CategoryBudget {
  return { category: row.category, month: row.month, amountCents: row.amount_cents, createdAt: row.created_at, updatedAt: row.updated_at };
}

function monthBounds(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { start: `${month}-01T00:00:00.000Z`, end: end.toISOString() };
}

function thresholdState(progressPercent: number): BudgetThresholdState {
  if (progressPercent > 100) return "overspent";
  if (progressPercent === 100) return "at-limit";
  if (progressPercent >= 80) return "near-limit";
  return "on-track";
}

export type CategoryBudgetRepository = {
  list(month: string): CategoryBudget[];
  upsert(budget: NewCategoryBudget): CategoryBudget;
  summaries(month: string): CategoryBudgetSummary[];
};

/** Provides monthly targets and their matching calendar-month expense totals. */
export function createCategoryBudgetRepository(database: Database.Database): CategoryBudgetRepository {
  const find = database.prepare("SELECT * FROM category_budgets WHERE category = ? AND month = ?");
  const list = database.prepare("SELECT * FROM category_budgets WHERE month = ? ORDER BY category ASC");
  const upsert = database.prepare(`
    INSERT INTO category_budgets (category, month, amount_cents, created_at, updated_at)
    VALUES (@category, @month, @amountCents, @createdAt, @updatedAt)
    ON CONFLICT(category, month) DO UPDATE SET amount_cents = excluded.amount_cents, updated_at = excluded.updated_at
  `);
  const spentByCategory = database.prepare(`
    SELECT category, COALESCE(SUM(amount_cents), 0) AS spentCents
    FROM expenses
    WHERE julianday(date) >= julianday(@start) AND julianday(date) < julianday(@end)
    GROUP BY category
  `);

  return {
    list(month) {
      return (list.all(month) as BudgetRow[]).map(toBudget);
    },
    upsert(budget) {
      const now = new Date().toISOString();
      upsert.run({ ...budget, createdAt: now, updatedAt: now });
      const row = find.get(budget.category, budget.month) as BudgetRow | undefined;
      if (!row) throw new Error("Saved budget could not be read");
      return toBudget(row);
    },
    summaries(month) {
      const configured = new Map(this.list(month).map((budget) => [budget.category, budget.amountCents]));
      const spent = new Map((spentByCategory.all(monthBounds(month)) as Array<{ category: string; spentCents: number }>)
        .map((item) => [item.category, item.spentCents]));
      return EXPENSE_CATEGORIES.map((category) => {
        const budgetCents = configured.get(category) ?? null;
        const spentCents = spent.get(category) ?? 0;
        if (budgetCents === null) {
          return { category, month, budgetCents, spentCents, remainingCents: null, overspentCents: null, progressPercent: null, thresholdState: "no-budget" };
        }
        const progressPercent = (spentCents / budgetCents) * 100;
        return {
          category, month, budgetCents, spentCents,
          remainingCents: Math.max(0, budgetCents - spentCents),
          overspentCents: Math.max(0, spentCents - budgetCents),
          progressPercent,
          thresholdState: thresholdState(progressPercent),
        };
      });
    },
  };
}
