import type Database from "better-sqlite3";

export type Expense = {
  id: number;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
};

export type NewExpense = Omit<Expense, "id" | "createdAt">;

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
  create(expense: NewExpense): Expense;
  list(): Expense[];
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
  const list = database.prepare(
    "SELECT * FROM expenses ORDER BY date DESC, id DESC",
  );

  return {
    create(expense) {
      const createdAt = new Date().toISOString();
      const result = insert.run({ ...expense, createdAt });
      const row = findById.get(result.lastInsertRowid) as ExpenseRow | undefined;

      if (!row) {
        throw new Error("Created expense could not be read");
      }

      return toExpense(row);
    },
    list() {
      return (list.all() as ExpenseRow[]).map(toExpense);
    },
  };
}
