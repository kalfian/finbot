import type Database from "better-sqlite3";
import { EXPENSE_CATEGORIES } from "./expense-form";

export const CUSTOM_CATEGORY_MAX_LENGTH = 40;

export type CustomCategoryRepository = {
  create(name: string): string | undefined;
  list(): string[];
  supports(name: string): boolean;
};

/** Canonicalize before validation so spacing and case variants cannot create duplicates. */
export function normalizeCustomCategoryName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function customCategoryKey(value: string): string {
  return normalizeCustomCategoryName(value).toLocaleLowerCase("en-US");
}

export function validateCustomCategoryName(value: unknown): { value: string } | { error: string } {
  if (typeof value !== "string") return { error: "Category name is required." };
  const name = normalizeCustomCategoryName(value);
  if (!name) return { error: "Category name is required." };
  if (Array.from(name).length > CUSTOM_CATEGORY_MAX_LENGTH) return { error: `Category names must be ${CUSTOM_CATEGORY_MAX_LENGTH} characters or fewer.` };
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N} &'().,/-]*[\p{L}\p{N}])?$/u.test(name)) return { error: "Category names may only use letters, numbers, spaces, and common punctuation." };
  if ((EXPENSE_CATEGORIES as readonly string[]).some((category) => category.toLocaleLowerCase("en-US") === customCategoryKey(name))) return { error: "That is already a built-in category." };
  return { value: name };
}

export function createCustomCategoryRepository(database: Database.Database): CustomCategoryRepository {
  const list = database.prepare("SELECT name FROM custom_expense_categories ORDER BY created_at, name");
  const insert = database.prepare("INSERT INTO custom_expense_categories (name, normalized_name, created_at) VALUES (?, ?, ?)");
  const supports = database.prepare("SELECT 1 FROM custom_expense_categories WHERE normalized_name = ?");
  return {
    create(name) {
      try {
        insert.run(name, customCategoryKey(name), new Date().toISOString());
        return name;
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) return undefined;
        throw error;
      }
    },
    list() { return (list.all() as Array<{ name: string }>).map((row) => row.name); },
    supports(name) { return Boolean(supports.get(customCategoryKey(name))); },
  };
}
