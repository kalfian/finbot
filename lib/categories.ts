import type Database from "better-sqlite3";

export const DEFAULT_EXPENSE_CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Health", "Other"] as const;

export type ExpenseCategory = {
  id: number;
  name: string;
  createdAt: string;
};

type CategoryRow = {
  id: number;
  name: string;
  created_at: string;
};

export class CategoryConflictError extends Error {}
export class CategoryInUseError extends Error {}

function toCategory(row: CategoryRow): ExpenseCategory {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export function validateCategoryName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("Category name is required.");
  const name = value.trim();
  if (name.length > 80) throw new Error("Category name must contain at most 80 characters.");
  return name;
}

export function seedDefaultCategories(database: Database.Database, userId: number): void {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO expense_categories (user_id, name, created_at)
    VALUES (?, ?, ?)
  `);
  const createdAt = new Date().toISOString();
  for (const name of DEFAULT_EXPENSE_CATEGORIES) insert.run(userId, name, createdAt);
}

export function createCategoryRepository(database: Database.Database, userId: number) {
  const byId = database.prepare("SELECT id, name, created_at FROM expense_categories WHERE id = ? AND user_id = ?");
  const byName = database.prepare("SELECT id, name, created_at FROM expense_categories WHERE user_id = ? AND name = ? COLLATE NOCASE");
  const list = database.prepare("SELECT id, name, created_at FROM expense_categories WHERE user_id = ? ORDER BY name COLLATE NOCASE, id");
  const insert = database.prepare("INSERT INTO expense_categories (user_id, name, created_at) VALUES (?, ?, ?)");
  const update = database.prepare("UPDATE expense_categories SET name = ? WHERE id = ? AND user_id = ?");
  const renameExpenses = database.prepare("UPDATE expenses SET category = ? WHERE user_id = ? AND category = ? COLLATE NOCASE");
  const usage = database.prepare("SELECT COUNT(*) AS count FROM expenses WHERE user_id = ? AND category = ? COLLATE NOCASE");
  const remove = database.prepare("DELETE FROM expense_categories WHERE id = ? AND user_id = ?");

  return {
    list(): ExpenseCategory[] {
      return (list.all(userId) as CategoryRow[]).map(toCategory);
    },
    has(name: string): boolean {
      return !!byName.get(userId, name);
    },
    create(value: unknown): ExpenseCategory {
      const name = validateCategoryName(value);
      try {
        const result = insert.run(userId, name, new Date().toISOString());
        return toCategory(byId.get(result.lastInsertRowid, userId) as CategoryRow);
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE")) {
          throw new CategoryConflictError("Category name is already in use.");
        }
        throw error;
      }
    },
    update(id: number, value: unknown): ExpenseCategory | null {
      const name = validateCategoryName(value);
      return database.transaction(() => {
        const current = byId.get(id, userId) as CategoryRow | undefined;
        if (!current) return null;
        const duplicate = byName.get(userId, name) as CategoryRow | undefined;
        if (duplicate && duplicate.id !== id) throw new CategoryConflictError("Category name is already in use.");
        update.run(name, id, userId);
        renameExpenses.run(name, userId, current.name);
        return toCategory(byId.get(id, userId) as CategoryRow);
      })();
    },
    delete(id: number): ExpenseCategory | null {
      return database.transaction(() => {
        const current = byId.get(id, userId) as CategoryRow | undefined;
        if (!current) return null;
        const { count } = usage.get(userId, current.name) as { count: number };
        if (count > 0) throw new CategoryInUseError("Category is still used by one or more expenses.");
        remove.run(id, userId);
        return toCategory(current);
      })();
    },
  };
}
