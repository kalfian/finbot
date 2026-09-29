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
  update(id: number, expense: NewExpense): Expense | null;
  list(): Expense[];
};

/** Creates a repository backed by the supplied initialized SQLite connection. */
export function createExpenseRepository(
  database: Database.Database,
  userId: number,
): ExpenseRepository {
  const insert = database.prepare(`
    INSERT INTO expenses (user_id, amount_cents, description, category, date, created_at)
    VALUES (@userId, @amountCents, @description, @category, @date, @createdAt)
  `);
  const findById = database.prepare("SELECT expenses.*, (SELECT COUNT(*) FROM expense_proofs WHERE expense_id = expenses.id) AS proof_count FROM expenses WHERE id = ? AND user_id = ?");
  const update = database.prepare(`
    UPDATE expenses
    SET amount_cents = @amountCents, description = @description, category = @category, date = @date
    WHERE id = @id AND user_id = @userId
  `);
  const list = database.prepare(
    "SELECT expenses.*, (SELECT COUNT(*) FROM expense_proofs WHERE expense_id = expenses.id) AS proof_count FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC",
  );
  const source = database.prepare("SELECT expense_id FROM expense_sources WHERE user_id = ? AND source_id = ?");
  const insertSource = database.prepare("INSERT INTO expense_sources (user_id, source_id, expense_id) VALUES (?, ?, ?)");

  function create(expense: NewExpense): Expense {
    const createdAt = new Date().toISOString();
    const result = insert.run({ userId, ...expense, createdAt });
    const row = findById.get(result.lastInsertRowid, userId) as ExpenseRow | undefined;

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
        const existing = source.get(userId, sourceId) as { expense_id: number } | undefined;
        if (existing) {
          const saved = toExpense(findById.get(existing.expense_id, userId) as ExpenseRow);
          if (saved.amountCents !== expense.amountCents || saved.description !== expense.description
            || saved.category !== expense.category || saved.date !== expense.date) {
            throw new Error("sourceId already belongs to a different expense.");
          }
          return { expense: saved, replayed: true };
        }
        const saved = create(expense);
        insertSource.run(userId, sourceId, saved.id);
        return { expense: saved, replayed: false };
      })();
    },
    update(id, expense) {
      const result = update.run({ id, userId, ...expense });
      if (!result.changes) return null;
      return toExpense(findById.get(id, userId) as ExpenseRow);
    },
    list() {
      return (list.all(userId) as ExpenseRow[]).map(toExpense);
    },
  };
}
