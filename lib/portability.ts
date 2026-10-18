import type Database from "better-sqlite3";

import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expense-form";
import type { Expense, NewExpense } from "./expenses";

export type ExpenseSplit = { category: ExpenseCategory; amountCents: number };
export type CategorizationRule = { id: number; matchType: "description" | "merchant"; pattern: string; category: ExpenseCategory; position: number; createdAt: string };
export type NewCategorizationRule = Omit<CategorizationRule, "id" | "position" | "createdAt">;
export type ImportRow = NewExpense & { tags?: string[]; splits?: ExpenseSplit[] };
export type ImportIssue = { row: number; error: string };
export type ImportPreview = { rows: ImportRow[]; errors: ImportIssue[]; duplicates: number[] };

const headers = ["amountCents", "description", "category", "date", "tags", "splits"] as const;
const categoryValues = EXPENSE_CATEGORIES as readonly string[];

function parseCsv(text: string): string[][] | string {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell) return "Unexpected quote in an unquoted field.";
      quoted = true;
    } else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) return "Unterminated quoted field.";
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function quote(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function tagsFor(database: Database.Database, id: number): string[] {
  return (database.prepare("SELECT tag FROM expense_tags WHERE expense_id = ? ORDER BY tag").all(id) as Array<{ tag: string }>).map(row => row.tag);
}
function splitsFor(database: Database.Database, id: number): ExpenseSplit[] {
  return (database.prepare("SELECT category, amount_cents AS amountCents FROM expense_splits WHERE expense_id = ? ORDER BY position").all(id) as ExpenseSplit[]);
}

export function validateTagsAndSplits(tags: unknown, splits: unknown, amountCents: number): { tags: string[]; splits: ExpenseSplit[] } | { error: string } {
  if (tags !== undefined && (!Array.isArray(tags) || tags.some(tag => typeof tag !== "string" || !tag.trim() || tag.trim().length > 50))) return { error: "tags must be non-empty strings up to 50 characters." };
  const cleanTags = [...new Set((tags as string[] | undefined ?? []).map(tag => tag.trim()))];
  if (splits !== undefined && !Array.isArray(splits)) return { error: "splits must be an array." };
  const cleanSplits: ExpenseSplit[] = [];
  for (const split of splits as unknown[] ?? []) {
    if (!split || typeof split !== "object") return { error: "Each split must be an object." };
    const item = split as Record<string, unknown>;
    if (!categoryValues.includes(item.category as string) || !Number.isSafeInteger(item.amountCents) || (item.amountCents as number) <= 0) return { error: "Each split needs a supported category and positive integer amountCents." };
    cleanSplits.push({ category: item.category as ExpenseCategory, amountCents: item.amountCents as number });
  }
  if (cleanSplits.length && cleanSplits.reduce((total, split) => total + split.amountCents, 0) !== amountCents) return { error: "Split totals must equal the expense amount." };
  return { tags: cleanTags, splits: cleanSplits };
}

export function exportExpensesCsv(database: Database.Database, expenses: Expense[]): string {
  const lines = [headers.join(",")];
  for (const expense of expenses) {
    const tags = tagsFor(database, expense.id).join("|");
    const splits = splitsFor(database, expense.id).map(split => `${split.category}:${split.amountCents}`).join("|");
    lines.push([expense.amountCents, expense.description, expense.category, expense.date, tags, splits].map(quote).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

function parseRow(values: string[], row: number): ImportRow | ImportIssue {
  if (values.length !== headers.length) return { row, error: `Expected ${headers.length} columns, received ${values.length}.` };
  const [amount, description, category, date, rawTags, rawSplits] = values;
  const amountCents = Number(amount);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { row, error: "amountCents must be a positive integer." };
  if (!description.trim()) return { row, error: "description is required." };
  if (!categoryValues.includes(category)) return { row, error: "category must be supported." };
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date) || Number.isNaN(new Date(date).getTime())) return { row, error: "date must be an ISO UTC datetime." };
  const tags = rawTags ? rawTags.split("|") : [];
  const splits: unknown[] = rawSplits ? rawSplits.split("|").map(value => { const at = value.lastIndexOf(":"); return at < 1 ? null : { category: value.slice(0, at), amountCents: Number(value.slice(at + 1)) }; }) : [];
  const metadata = validateTagsAndSplits(tags, splits, amountCents);
  return "error" in metadata ? { row, error: metadata.error } : { amountCents, description: description.trim(), category: category as ExpenseCategory, date, ...metadata };
}

export function previewImportCsv(database: Database.Database, text: string): ImportPreview {
  if (text.length > 2_000_000) return { rows: [], errors: [{ row: 0, error: "CSV is too large." }], duplicates: [] };
  const parsed = parseCsv(text);
  if (typeof parsed === "string") return { rows: [], errors: [{ row: 0, error: parsed }], duplicates: [] };
  if (!parsed.length || parsed[0].join(",") !== headers.join(",")) return { rows: [], errors: [{ row: 1, error: `Header must be ${headers.join(",")}.` }], duplicates: [] };
  const rows: ImportRow[] = []; const errors: ImportIssue[] = []; const duplicates: number[] = []; const seen = new Set<string>();
  const exists = database.prepare("SELECT 1 FROM expenses WHERE amount_cents = ? AND description = ? AND date = ? LIMIT 1");
  parsed.slice(1).forEach((values, index) => {
    if (values.length === 1 && !values[0]) return;
    const result = parseRow(values, index + 2);
    if ("error" in result) { errors.push(result); return; }
    const key = `${result.amountCents}\u0000${result.description}\u0000${result.date}`;
    if (seen.has(key) || exists.get(result.amountCents, result.description, result.date)) duplicates.push(index + 2);
    seen.add(key); rows.push(result);
  });
  return { rows, errors, duplicates };
}

export function applyRule(rules: CategorizationRule[], description: string, merchant?: string): ExpenseCategory | undefined {
  // Rules are evaluated in their saved order; the first case-insensitive substring wins.
  for (const rule of [...rules].sort((a, b) => a.position - b.position || a.id - b.id)) {
    const target = rule.matchType === "merchant" ? merchant ?? "" : description;
    if (target.toLocaleLowerCase().includes(rule.pattern.toLocaleLowerCase())) return rule.category;
  }
  return undefined;
}

export function createPortabilityRepository(database: Database.Database) {
  const listRules = () => database.prepare("SELECT id, match_type AS matchType, pattern, category, position, created_at AS createdAt FROM categorization_rules ORDER BY position, id").all() as CategorizationRule[];
  return {
    exportCsv(expenses: Expense[]) { return exportExpensesCsv(database, expenses); },
    preview(text: string) { return previewImportCsv(database, text); },
    import(text: string, create: (expense: NewExpense & { tags?: string[]; splits?: ExpenseSplit[] }) => Expense) {
      const preview = previewImportCsv(database, text);
      if (preview.errors.length || preview.duplicates.length) return { ...preview, imported: 0 };
      database.transaction(() => preview.rows.forEach(row => create(row)))();
      return { ...preview, imported: preview.rows.length };
    },
    listRules,
    createRule(rule: NewCategorizationRule) {
      const createdAt = new Date().toISOString(); const position = listRules().length;
      const result = database.prepare("INSERT INTO categorization_rules (match_type, pattern, category, position, created_at) VALUES (?, ?, ?, ?, ?)").run(rule.matchType, rule.pattern.trim(), rule.category, position, createdAt);
      return database.prepare("SELECT id, match_type AS matchType, pattern, category, position, created_at AS createdAt FROM categorization_rules WHERE id = ?").get(result.lastInsertRowid) as CategorizationRule;
    },
    reorderRules(ids: number[]) { database.transaction(() => { const update = database.prepare("UPDATE categorization_rules SET position = ? WHERE id = ?"); ids.forEach((id, index) => update.run(1_000_000 + index, id)); ids.forEach((id, index) => update.run(index, id)); })(); return listRules(); },
    deleteRule(id: number) { const result = database.prepare("DELETE FROM categorization_rules WHERE id = ?").run(id); return result.changes > 0; },
  };
}
