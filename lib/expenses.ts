import type Database from "better-sqlite3";
import type { ExpenseSplit } from "./portability";
import { applyRule, type CategorizationRule } from "./portability";
import { EXPENSE_CATEGORIES } from "./expense-form";

export type Expense = {
  id: number;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
};

export type NewExpense = Omit<Expense, "id" | "createdAt">;
export type ExpenseMetadata = { tags?: string[]; splits?: ExpenseSplit[] };
export type ExpenseFilters = { start?: string; end?: string; category?: string; search?: string; minAmountCents?: number; maxAmountCents?: number; limit?: number; offset?: number };
export type ExpensePage = { expenses: Expense[]; totalCount: number; totalCents: number };
export type CategorySummary = { category: string; totalCents: number; transactionCount: number; percentage: number };
export type MonthlySummary = { month: string; totalCents: number; transactionCount: number };
export type ExpenseInsights = { categories: CategorySummary[]; months: MonthlySummary[] };

type ExpenseRow = {
  id: number;
  amount_cents: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
};

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category || "Other",
    date: row.date,
    createdAt: row.created_at,
  };
}

export type ExpenseRepository = {
  create(expense: NewExpense & ExpenseMetadata): Expense;
  list(): Expense[];
  supportsCategory?(category: string): boolean;
  query?(filters?: ExpenseFilters): ExpensePage;
  insights?(filters?: ExpenseFilters): ExpenseInsights;
  update?(id: number, expense: NewExpense): Expense | undefined;
  delete?(id: number): Expense | undefined;
  categorize?(description: string, merchant?: string): string | undefined;
};

/** Creates a repository backed by the supplied initialized SQLite connection. */
export function createExpenseRepository(
  database: Database.Database,
): ExpenseRepository {
  const insert = database.prepare(`
    INSERT INTO expenses (amount_cents, description, category, date, created_at)
    VALUES (@amountCents, @description, @category, @date, @createdAt)
  `);
  const findById = database.prepare("SELECT * FROM expenses WHERE id = ?");
  const list = database.prepare("SELECT * FROM expenses ORDER BY date DESC, id DESC");
  const addTags = database.prepare("INSERT INTO expense_tags (expense_id, tag) VALUES (?, ?)");
  const addSplit = database.prepare("INSERT INTO expense_splits (expense_id, category, amount_cents, position) VALUES (?, ?, ?, ?)");
  const customCategory = database.prepare("SELECT 1 FROM custom_expense_categories WHERE name = ?");
  const create = database.transaction((expense: NewExpense & ExpenseMetadata) => {
    const createdAt = new Date().toISOString();
    const result = insert.run({ ...expense, createdAt });
    for (const tag of expense.tags ?? []) addTags.run(result.lastInsertRowid, tag);
    (expense.splits ?? []).forEach((split, position) => addSplit.run(result.lastInsertRowid, split.category, split.amountCents, position));
    const row = findById.get(result.lastInsertRowid) as ExpenseRow | undefined;

    if (!row) {
      throw new Error("Created expense could not be read");
    }

    return toExpense(row);
  });

  return {
    create(expense) {
      return create(expense);
    },
    list() {
      return (list.all() as ExpenseRow[]).map(toExpense);
    },
    supportsCategory(category) {
      return (EXPENSE_CATEGORIES as readonly string[]).includes(category)
        || Boolean(customCategory.get(category));
    },
    query(filters = {}) {
      const clauses: string[] = [];
      const values: Record<string, string | number> = {};
      // julianday accepts both the historic YYYY-MM-DD rows and current UTC
      // timestamps. String comparison would incorrectly exclude a legacy row on
      // the first day of an otherwise valid range.
      if (filters.start) { clauses.push("julianday(date) >= julianday(@start)"); values.start = filters.start; }
      if (filters.end) { clauses.push("julianday(date) < julianday(@end)"); values.end = filters.end; }
      if (filters.category) { clauses.push("category = @category"); values.category = filters.category; }
      if (filters.search) { clauses.push("description LIKE @search COLLATE NOCASE"); values.search = `%${filters.search}%`; }
      if (filters.minAmountCents !== undefined) { clauses.push("amount_cents >= @minAmountCents"); values.minAmountCents = filters.minAmountCents; }
      if (filters.maxAmountCents !== undefined) { clauses.push("amount_cents <= @maxAmountCents"); values.maxAmountCents = filters.maxAmountCents; }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const totals = database.prepare(`SELECT COUNT(*) AS totalCount, COALESCE(SUM(amount_cents), 0) AS totalCents FROM expenses${where}`).get(values) as { totalCount: number; totalCents: number };
      const pagination = filters.limit === undefined ? "" : " LIMIT @limit OFFSET @offset";
      const rows = database.prepare(`SELECT * FROM expenses${where} ORDER BY date DESC, id DESC${pagination}`).all(filters.limit === undefined ? values : { ...values, limit: filters.limit, offset: filters.offset ?? 0 }) as ExpenseRow[];
      return { expenses: rows.map(toExpense), totalCount: totals.totalCount, totalCents: totals.totalCents };
    },
    insights(filters = {}) {
      const clauses: string[] = [];
      const values: Record<string, string | number> = {};
      if (filters.start) { clauses.push("julianday(date) >= julianday(@start)"); values.start = filters.start; }
      if (filters.end) { clauses.push("julianday(date) < julianday(@end)"); values.end = filters.end; }
      if (filters.category) { clauses.push("category = @category"); values.category = filters.category; }
      if (filters.search) { clauses.push("description LIKE @search COLLATE NOCASE"); values.search = `%${filters.search}%`; }
      if (filters.minAmountCents !== undefined) { clauses.push("amount_cents >= @minAmountCents"); values.minAmountCents = filters.minAmountCents; }
      if (filters.maxAmountCents !== undefined) { clauses.push("amount_cents <= @maxAmountCents"); values.maxAmountCents = filters.maxAmountCents; }
      const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
      const categories = database.prepare(`SELECT category, SUM(amount_cents) AS totalCents, COUNT(*) AS transactionCount FROM expenses${where} GROUP BY category ORDER BY totalCents DESC, category ASC`).all(values) as Array<{ category: string; totalCents: number; transactionCount: number }>;
      const total = categories.reduce((sum, item) => sum + item.totalCents, 0);
      const months = database.prepare(`SELECT substr(date, 1, 7) AS month, SUM(amount_cents) AS totalCents, COUNT(*) AS transactionCount FROM expenses${where} GROUP BY month ORDER BY month ASC`).all(values) as MonthlySummary[];
      return { categories: categories.map(item => ({ ...item, percentage: total ? (item.totalCents / total) * 100 : 0 })), months };
    },
    update(id, expense) {
      const result = database.prepare("UPDATE expenses SET amount_cents = @amountCents, description = @description, category = @category, date = @date WHERE id = @id").run({ ...expense, id });
      return result.changes ? toExpense(findById.get(id) as ExpenseRow) : undefined;
    },
    delete(id) {
      const row = findById.get(id) as ExpenseRow | undefined;
      if (!row) return undefined;
      database.prepare("DELETE FROM expenses WHERE id = ?").run(id);
      return toExpense(row);
    },
    categorize(description, merchant) {
      const rules = database.prepare("SELECT id, match_type AS matchType, pattern, category, position, created_at AS createdAt FROM categorization_rules ORDER BY position, id").all() as CategorizationRule[];
      return applyRule(rules, description, merchant);
    },
  };
}
