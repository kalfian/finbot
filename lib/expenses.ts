import type Database from "better-sqlite3";
import type { ProofFile } from "./expense-proofs";

export type Expense = {
  id: number;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
  proofCount: number;
  tags: string[];
};

/** Omitting tags on update keeps the expense's current tags; an array replaces them. */
export type NewExpense = Omit<Expense, "id" | "createdAt" | "proofCount" | "tags"> & { tags?: string[] };

type ExpenseRow = {
  id: number;
  amount_cents: number;
  description: string;
  category: string;
  date: string;
  created_at: string;
  proof_count: number;
  tag_names: string | null;
};

function sortTags(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  const normalize = (names: readonly string[]) => sortTags(names).map((name) => name.toLocaleLowerCase()).join(",");
  return normalize(a) === normalize(b);
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    description: row.description,
    category: row.category || "Other",
    date: row.date,
    createdAt: row.created_at,
    proofCount: row.proof_count,
    // Tag names cannot contain commas, so the aggregate splits safely.
    tags: row.tag_names ? sortTags(row.tag_names.split(",")) : [],
  };
}

export type ExpenseRepository = {
  create(expense: NewExpense): Expense;
  record(expense: NewExpense, sourceId?: string): { expense: Expense; replayed: boolean };
  update(id: number, expense: NewExpense): Expense | null;
  delete(id: number): { expense: Expense; proofs: ProofFile[] } | null;
  list(): Expense[];
  /** Adds or removes one tag on several owned expenses; returns the IDs that were found. */
  applyTag(expenseIds: readonly number[], name: string, action: "add" | "remove"): number[];
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
  const columns = `expenses.*, (SELECT COUNT(*) FROM expense_proofs WHERE expense_id = expenses.id) AS proof_count,
    (SELECT GROUP_CONCAT(tags.name, ',') FROM expense_tags JOIN tags ON tags.id = expense_tags.tag_id
      WHERE expense_tags.expense_id = expenses.id) AS tag_names`;
  const findById = database.prepare(`SELECT ${columns} FROM expenses WHERE id = ? AND user_id = ?`);
  const update = database.prepare(`
    UPDATE expenses
    SET amount_cents = @amountCents, description = @description, category = @category, date = @date
    WHERE id = @id AND user_id = @userId
  `);
  const list = database.prepare(`SELECT ${columns} FROM expenses WHERE user_id = ? ORDER BY date DESC, id DESC`);
  const source = database.prepare("SELECT expense_id FROM expense_sources WHERE user_id = ? AND source_id = ?");
  const insertSource = database.prepare("INSERT INTO expense_sources (user_id, source_id, expense_id) VALUES (?, ?, ?)");
  const proofFiles = database.prepare("SELECT id, mime_type FROM expense_proofs WHERE expense_id = ?");
  const deleteProofs = database.prepare("DELETE FROM expense_proofs WHERE expense_id = ?");
  const deleteSources = database.prepare("DELETE FROM expense_sources WHERE user_id = ? AND expense_id = ?");
  const deleteExpense = database.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?");
  const insertTag = database.prepare("INSERT OR IGNORE INTO tags (user_id, name, created_at) VALUES (?, ?, ?)");
  const tagId = database.prepare("SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE");
  const clearTags = database.prepare("DELETE FROM expense_tags WHERE expense_id = ?");
  const linkTag = database.prepare("INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)");
  const unlinkTag = database.prepare("DELETE FROM expense_tags WHERE expense_id = ? AND tag_id = ?");
  const owned = database.prepare("SELECT 1 FROM expenses WHERE id = ? AND user_id = ?");

  /** Replaces an owned expense's tags, creating missing tag names for this user. */
  function setTags(expenseId: number | bigint, names: readonly string[]): void {
    clearTags.run(expenseId);
    const createdAt = new Date().toISOString();
    for (const name of names) {
      insertTag.run(userId, name, createdAt);
      const { id } = tagId.get(userId, name) as { id: number };
      linkTag.run(expenseId, id);
    }
  }

  function create({ tags, ...expense }: NewExpense): Expense {
    return database.transaction(() => {
      const createdAt = new Date().toISOString();
      const result = insert.run({ userId, ...expense, createdAt });
      if (tags?.length) setTags(result.lastInsertRowid, tags);
      const row = findById.get(result.lastInsertRowid, userId) as ExpenseRow | undefined;

      if (!row) {
        throw new Error("Created expense could not be read");
      }

      return toExpense(row);
    })();
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
            || saved.category !== expense.category || saved.date !== expense.date
            || (expense.tags !== undefined && !sameTags(saved.tags, expense.tags))) {
            throw new Error("sourceId already belongs to a different expense.");
          }
          return { expense: saved, replayed: true };
        }
        const saved = create(expense);
        insertSource.run(userId, sourceId, saved.id);
        return { expense: saved, replayed: false };
      })();
    },
    update(id, { tags, ...expense }) {
      return database.transaction(() => {
        const result = update.run({ id, userId, ...expense });
        if (!result.changes) return null;
        if (tags !== undefined) setTags(id, tags);
        return toExpense(findById.get(id, userId) as ExpenseRow);
      })();
    },
    delete(id) {
      return database.transaction(() => {
        const row = findById.get(id, userId) as ExpenseRow | undefined;
        if (!row) return null;
        const proofs = (proofFiles.all(id) as Array<{ id: string; mime_type: string }>)
          .map((proof) => ({ id: proof.id, mimeType: proof.mime_type }));
        deleteSources.run(userId, id);
        deleteProofs.run(id);
        clearTags.run(id);
        deleteExpense.run(id, userId);
        return { expense: toExpense(row), proofs };
      })();
    },
    list() {
      return (list.all(userId) as ExpenseRow[]).map(toExpense);
    },
    applyTag(expenseIds, name, action) {
      return database.transaction(() => {
        const found = [...new Set(expenseIds)].filter((id) => owned.get(id, userId));
        if (action === "add" && found.length) insertTag.run(userId, name, new Date().toISOString());
        const tag = tagId.get(userId, name) as { id: number } | undefined;
        if (!tag) return found;
        for (const id of found) (action === "add" ? linkTag : unlinkTag).run(id, tag.id);
        return found;
      })();
    },
  };
}
