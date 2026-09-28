import type Database from "better-sqlite3";

export type Expense = {
  id: number;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
  proofCount: number;
};

export type NewExpense = Omit<Expense, "id" | "createdAt" | "proofCount">;

type ExpenseRow = {
  id: number;
  amount_cents: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
  proof_count: number;
};

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category || "Other",
    date: row.date,
    createdAt: row.created_at,
    proofCount: row.proof_count,
  };
}

export type ExpenseRepository = {
  create(expense: NewExpense): Expense;
  record(expense: NewExpense, sourceId?: string): { expense: Expense; replayed: boolean };
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
  const findById = database.prepare("SELECT expenses.*, (SELECT COUNT(*) FROM expense_proofs WHERE expense_id = expenses.id) AS proof_count FROM expenses WHERE id = ?");
  const list = database.prepare(
    "SELECT expenses.*, (SELECT COUNT(*) FROM expense_proofs WHERE expense_id = expenses.id) AS proof_count FROM expenses ORDER BY date DESC, id DESC",
  );
  const source = database.prepare("SELECT expense_id FROM expense_sources WHERE source_id = ?");
  const insertSource = database.prepare("INSERT INTO expense_sources (source_id, expense_id) VALUES (?, ?)");

  function create(expense: NewExpense): Expense {
    const createdAt = new Date().toISOString();
    const result = insert.run({ ...expense, createdAt });
    const row = findById.get(result.lastInsertRowid) as ExpenseRow | undefined;

    if (!row) {
      throw new Error("Created expense could not be read");
    }

    return toExpense(row);
  }
  return {
    create,
    record(expense, sourceId) {
      if (!sourceId) return { expense: create(expense), replayed: false };
      return database.transaction(() => {
        const existing = source.get(sourceId) as { expense_id: number } | undefined;
        if (existing) {
          const saved = toExpense(findById.get(existing.expense_id) as ExpenseRow);
          if (saved.amountCents !== expense.amountCents || saved.description !== expense.description
            || saved.category !== expense.category || saved.date !== expense.date) {
            throw new Error("sourceId already belongs to a different expense.");
          }
          return { expense: saved, replayed: true };
        }
        const saved = create(expense);
        insertSource.run(sourceId, saved.id);
        return { expense: saved, replayed: false };
      })();
    },
    list() {
      return (list.all() as ExpenseRow[]).map(toExpense);
    },
  };
}
