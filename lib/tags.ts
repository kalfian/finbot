import type Database from "better-sqlite3";

export const MAX_TAG_LENGTH = 40;
export const MAX_TAGS_PER_EXPENSE = 10;

export type ExpenseTag = {
  id: number;
  name: string;
  createdAt: string;
  expenseCount: number;
  totalCents: number;
};

type TagRow = {
  id: number;
  name: string;
  created_at: string;
  expense_count: number;
  total_cents: number;
};

export class TagConflictError extends Error {}

function toTag(row: TagRow): ExpenseTag {
  return { id: row.id, name: row.name, createdAt: row.created_at, expenseCount: row.expense_count, totalCents: row.total_cents };
}

/** Trims, collapses whitespace and strips a leading "#" so "#Liburan  Bali" becomes "Liburan Bali". */
export function validateTagName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Tag name is required.");
  const name = value.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Tag name is required.");
  if (name.length > MAX_TAG_LENGTH) throw new Error(`Tag name must contain at most ${MAX_TAG_LENGTH} characters.`);
  if (name.includes(",")) throw new Error("Tag name must not contain commas.");
  return name;
}

/** Validates an expense's tag list, removing case-insensitive duplicates while keeping first spelling. */
export function validateTagList(value: unknown): { value: string[] } | { error: string } {
  if (!Array.isArray(value)) return { error: "tags must be an array of tag names." };
  const names: string[] = [];
  for (const item of value) {
    let name: string;
    try { name = validateTagName(item); } catch (error) { return { error: `tags: ${(error as Error).message}` }; }
    if (!names.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) names.push(name);
  }
  if (names.length > MAX_TAGS_PER_EXPENSE) return { error: `An expense can have at most ${MAX_TAGS_PER_EXPENSE} tags.` };
  return { value: names };
}

const selectTags = `
  SELECT tags.id, tags.name, tags.created_at,
    COUNT(expenses.id) AS expense_count, COALESCE(SUM(expenses.amount_cents), 0) AS total_cents
  FROM tags
  LEFT JOIN expense_tags ON expense_tags.tag_id = tags.id
  LEFT JOIN expenses ON expenses.id = expense_tags.expense_id
  WHERE tags.user_id = ?`;

export function createTagRepository(database: Database.Database, userId: number) {
  const list = database.prepare(`${selectTags} GROUP BY tags.id ORDER BY tags.name COLLATE NOCASE, tags.id`);
  const byId = database.prepare(`${selectTags} AND tags.id = ? GROUP BY tags.id`);
  const byName = database.prepare("SELECT id FROM tags WHERE user_id = ? AND name = ? COLLATE NOCASE");
  const insert = database.prepare("INSERT INTO tags (user_id, name, created_at) VALUES (?, ?, ?)");
  const rename = database.prepare("UPDATE tags SET name = ? WHERE id = ? AND user_id = ?");
  const unlink = database.prepare("DELETE FROM expense_tags WHERE tag_id = ?");
  const remove = database.prepare("DELETE FROM tags WHERE id = ? AND user_id = ?");

  function get(id: number | bigint): ExpenseTag | null {
    const row = byId.get(userId, id) as TagRow | undefined;
    return row ? toTag(row) : null;
  }

  return {
    list(): ExpenseTag[] {
      return (list.all(userId) as TagRow[]).map(toTag);
    },
    create(value: unknown): ExpenseTag {
      const name = validateTagName(value);
      if (byName.get(userId, name)) throw new TagConflictError("Tag name is already in use.");
      return get(insert.run(userId, name, new Date().toISOString()).lastInsertRowid)!;
    },
    update(id: number, value: unknown): ExpenseTag | null {
      const name = validateTagName(value);
      return database.transaction(() => {
        if (!get(id)) return null;
        const duplicate = byName.get(userId, name) as { id: number } | undefined;
        if (duplicate && duplicate.id !== id) throw new TagConflictError("Tag name is already in use.");
        rename.run(name, id, userId);
        return get(id);
      })();
    },
    /** Deletes the tag and removes it from every expense; the expenses themselves remain. */
    delete(id: number): ExpenseTag | null {
      return database.transaction(() => {
        const current = get(id);
        if (!current) return null;
        unlink.run(id);
        remove.run(id, userId);
        return current;
      })();
    },
  };
}
