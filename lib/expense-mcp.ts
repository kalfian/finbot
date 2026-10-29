import { getUserSettings, setUserTimezone } from "./user-settings";
import { usageSnapshot } from "./usage";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import type Database from "better-sqlite3";
import { createExpenseRepository } from "./expenses";
import { buildExpensePdf } from "./expense-report";
import { filterReportExpenses, validateReportRange } from "./expense-filters";
import { validateExpense } from "./expense-api";
import { budgetSnapshot, createBudgetRepository, validBudgetDate } from "./budget";
import { deleteProofFiles, listProofs, ProofError, readProof, saveProof } from "./expense-proofs";
import { CategoryConflictError, CategoryInUseError, createCategoryRepository } from "./categories";
import { createTagRepository, MAX_TAG_LENGTH, MAX_TAGS_PER_EXPENSE, TagConflictError, validateTagName } from "./tags";
import { dateKeyInZone } from "./timezone";

export function createExpenseMcpServer(database: Database.Database, userId: number, proofDirectory?: string): McpServer {
  const server = new McpServer({ name: "expense-tracker", version: "1.0.0" });
  const repository = createExpenseRepository(database, userId);
  const categories = createCategoryRepository(database, userId);
  const tags = createTagRepository(database, userId);
  const tagList = z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH + 1)).max(MAX_TAGS_PER_EXPENSE);
  const tagFilter = {
    tag: z.string().default("").describe("Only include expenses carrying this tag name (case-insensitive). Empty means any."),
    untagged: z.boolean().default(false).describe("Only include expenses without any tag."),
  };
  const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  const failure = (code: string, error: string, hint: string) => ({ isError: true, ...result({ error, code, hint }) });
  server.registerTool("get_settings", {
    title: "Get display settings", description: "Get the authenticated user's IANA timezone used for dates, reports and daily/weekly/monthly usage. Expense timestamps remain UTC.", inputSchema: {},
  }, async () => result({ settings: getUserSettings(database, userId) }));
  server.registerTool("set_timezone", {
    title: "Set display timezone", description: "Set the authenticated user's IANA display/grouping timezone, only when requested by the user. This changes calendar usage and reports, never stored expense timestamps.",
    inputSchema: { timezone: z.string() },
  }, async ({ timezone }) => {
    try { return result({ settings: setUserTimezone(database, userId, timezone) }); }
    catch { return failure("INVALID_TIMEZONE", "Choose a valid IANA timezone.", "Use a name such as Asia/Jakarta, America/New_York or UTC."); }
  });
  server.registerTool("usage_summary", {
    title: "Daily, weekly and monthly usage", description: "Return spending totals, counts and categories for a date's day, Monday-Sunday week and month in the account timezone. Defaults to today there; UTC expense timestamps remain unchanged.",
    inputSchema: { date: z.string().default("") },
  }, async ({ date }) => {
    if (date && !validBudgetDate(date)) return failure("INVALID_USAGE_DATE", "date must use YYYY-MM-DD.", "Pass a calendar date in the account timezone or omit it for today.");
    return result({ usage: usageSnapshot(database, userId, date || undefined) });
  });
  server.registerTool("list_expenses", {
    title: "List expenses",
    description: "List expenses newest first, optionally filtering description, category or tag text, an exact tag, untagged expenses, and inclusive calendar dates in the account timezone.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
      ...tagFilter,
    },
  }, async ({ query, from, to, tag, untagged }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    return result({ timezone: getUserSettings(database,userId).timezone, expenses: filterReportExpenses(repository.list(), { query, start: from, end: to, tag, untagged, timezone: getUserSettings(database, userId).timezone }) });
  });
  server.registerTool("create_expense", {
    title: "Create expense",
    description: "Record one expense. Call list_categories first. amountCents is positive IDR minor units and date is ISO UTC. sourceId is an optional caller-generated idempotency key: use transport metadata when already available, otherwise omit it; never ask the end user for sourceId. tags is an optional list of free-form labels such as a trip name (\"liburan-bali\"); missing tags are created automatically, so call list_tags to reuse existing spellings. Returns budget totals for the expense's day, Monday-based week and month in the account timezone.",
    inputSchema: {
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.string().trim().min(1).max(80),
      date: z.string(),
      tags: tagList.optional(),
      sourceId: z.string().min(1).max(200).optional(),
    },
  }, async (expense) => {
    const validation = validateExpense(expense, categories.list().map(({ name }) => name));
    if ("error" in validation) return failure("INVALID_EXPENSE", validation.error,
      "Correct the expense fields and retry create_expense.");
    try {
      const { expense: created, replayed } = repository.record(validation.value, expense.sourceId);
      return result({ expense: created, replayed, budget: budgetSnapshot(database, userId, created.date) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Expense could not be saved.";
      return failure(message.startsWith("sourceId") ? "SOURCE_ID_CONFLICT" : "EXPENSE_CREATE_FAILED", message,
        message.startsWith("sourceId") ? "Reuse a sourceId only for an identical expense." : "Retry once, then check the finbot MCP server log.");
    }
  });
  server.registerTool("update_expense", {
    title: "Update expense",
    description: "Replace an owned expense's amount, description, category, and date. tags, when given, replaces the expense's tags ([] clears them); omit tags to keep them. Returns the updated expense and recalculated budget snapshot.",
    inputSchema: {
      expenseId: z.number().int().positive().safe(),
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.string().trim().min(1).max(80),
      date: z.string(),
      tags: tagList.optional(),
    },
  }, async ({ expenseId, ...expense }) => {
    const validation = validateExpense(expense, categories.list().map(({ name }) => name));
    if ("error" in validation) return failure("INVALID_EXPENSE", validation.error,
      "Provide expenseId and all four editable expense fields, then retry update_expense.");
    try {
      const updated = repository.update(expenseId, validation.value);
      if (!updated) return failure("EXPENSE_NOT_FOUND", "Expense not found or not owned by this user.",
        "Call list_expenses and verify the expenseId before retrying.");
      return result({ expense: updated, budget: budgetSnapshot(database, userId, updated.date) });
    } catch {
      return failure("EXPENSE_UPDATE_FAILED", "Expense could not be updated.",
        "Retry once. If it still fails, inspect the finbot server log using the MCP request ID.");
    }
  });
  server.registerTool("delete_expense", {
    title: "Delete expense",
    description: "Permanently delete an owned expense, its source mapping, and private proof files. Invoke only after the user explicitly confirms deletion.",
    inputSchema: {
      expenseId: z.number().int().positive().safe(),
      confirm: z.boolean(),
    },
  }, async ({ expenseId, confirm }) => {
    if (!confirm) return failure("DELETE_CONFIRMATION_REQUIRED", "Deletion was not confirmed.",
      "Ask the user to confirm the exact expense, then retry with confirm=true.");
    try {
      const deleted = repository.delete(expenseId);
      if (!deleted) return failure("EXPENSE_NOT_FOUND", "Expense not found or not owned by this user.",
        "Call list_expenses and verify the expenseId before retrying.");
      deleteProofFiles(deleted.proofs, proofDirectory);
      return result({ deleted: true, expense: deleted.expense,
        budget: budgetSnapshot(database, userId, deleted.expense.date) });
    } catch {
      return failure("EXPENSE_DELETE_FAILED", "Expense could not be deleted.",
        "Retry once. If it still fails, inspect the finbot server log using the MCP request ID.");
    }
  });
  server.registerTool("list_expense_proofs", {
    title: "List expense proofs",
    description: "List receipt/photo metadata attached to an expense.",
    inputSchema: { expenseId: z.number().int().positive().safe() },
  }, async ({ expenseId }) => {
    try { return result({ proofs: listProofs(database, userId, expenseId) }); }
    catch (error) { return failure("PROOF_LIST_FAILED", error instanceof Error ? error.message : "Proofs unavailable.",
      "Verify the expenseId belongs to this user, then retry."); }
  });
  server.registerTool("attach_expense_proof", {
    title: "Attach expense proof",
    description: "Save a JPEG, PNG, WebP, or PDF proof to an existing expense. 5 MB maximum, 3 proofs per expense. sourceId is optional; use an existing transport event ID for safe retries or omit it, and never ask the end user for one.",
    inputSchema: {
      expenseId: z.number().int().positive().safe(),
      filename: z.string().min(1).max(120),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
      base64: z.string().max(7_000_000),
      sourceId: z.string().min(1).max(200).optional(),
    },
  }, async ({ expenseId, filename, mimeType, base64, sourceId }) => {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
      return failure("INVALID_BASE64", "base64 must contain valid encoded file bytes.",
        "Encode the complete file bytes as standard base64 and retry.");
    }
    try {
      const file = new File([Buffer.from(base64, "base64")], filename, { type: mimeType });
      const saved = await saveProof(database, userId, expenseId, file, proofDirectory, sourceId);
      return result(saved);
    } catch (error) {
      return failure(error instanceof ProofError ? "PROOF_REJECTED" : "PROOF_SAVE_FAILED",
        error instanceof ProofError ? error.message : "Proof could not be saved.",
        "Verify the expenseId, file type, 5 MB size limit, three-proof limit, and sourceId before retrying.");
    }
  });
  server.registerTool("get_expense_proof", {
    title: "Read expense proof",
    description: "Return the attached proof as a base64 embedded resource.",
    inputSchema: { expenseId: z.number().int().positive().safe(), proofId: z.string().uuid() },
  }, async ({ expenseId, proofId }) => {
    try {
      const { proof, bytes } = readProof(database, userId, expenseId, proofId, proofDirectory);
      return { content: [{ type: "resource", resource: {
        uri: `expense-tracker://expenses/${expenseId}/proofs/${proof.id}`, mimeType: proof.mimeType, blob: Buffer.from(bytes).toString("base64"),
      } }] };
    } catch (error) {
      return failure(error instanceof ProofError ? "PROOF_NOT_FOUND" : "PROOF_READ_FAILED",
        error instanceof ProofError ? error.message : "Proof could not be read.",
        "Call list_expense_proofs and verify both expenseId and proofId before retrying.");
    }
  });
  server.registerTool("budget_status", {
    title: "Budget status",
    description: "Return account-timezone day, week and month spending, recurring monthly IDR limit, signed remaining amount, and exceeded status. Defaults to today.",
    inputSchema: { date: z.string().default("") },
  }, async ({ date }) => {
    if (date && !validBudgetDate(date)) return failure("INVALID_BUDGET_DATE", "date must use YYYY-MM-DD.",
      "Pass a calendar date in the account timezone or leave date empty for today.");
    return result(budgetSnapshot(database, userId, date || new Date().toISOString()));
  });
  server.registerTool("set_monthly_limit", {
    title: "Set monthly limit",
    description: "Set one recurring monthly spending limit in positive integer IDR minor units; null clears it. Changes the limit, not expenses.",
    inputSchema: { monthlyLimitCents: z.number().int().positive().safe().nullable() },
  }, async ({ monthlyLimitCents }) => {
    createBudgetRepository(database, userId).setMonthlyLimitCents(monthlyLimitCents);
    return result(budgetSnapshot(database, userId));
  });
  server.registerTool("list_categories", {
    title: "List categories",
    description: "List the authenticated user's valid expense categories. Call this before choosing a category for create_expense or update_expense.",
    inputSchema: {},
  }, async () => result({ categories: categories.list() }));
  server.registerTool("create_category", {
    title: "Create category",
    description: "Create one expense category for the authenticated user. Names are case-insensitively unique and contain at most 80 characters.",
    inputSchema: { name: z.string().trim().min(1).max(80) },
  }, async ({ name }) => {
    try { return result({ category: categories.create(name) }); }
    catch (error) {
      return failure(error instanceof CategoryConflictError ? "CATEGORY_NAME_CONFLICT" : "INVALID_CATEGORY",
        error instanceof Error ? error.message : "Category could not be created.",
        "Call list_categories, then choose a new non-empty category name up to 80 characters.");
    }
  });
  server.registerTool("update_category", {
    title: "Update category",
    description: "Rename an owned category and all existing expenses that use it.",
    inputSchema: { categoryId: z.number().int().positive().safe(), name: z.string().trim().min(1).max(80) },
  }, async ({ categoryId, name }) => {
    try {
      const category = categories.update(categoryId, name);
      return category ? result({ category }) : failure("CATEGORY_NOT_FOUND", "Category not found or not owned by this user.",
        "Call list_categories and verify the categoryId before retrying.");
    } catch (error) {
      return failure(error instanceof CategoryConflictError ? "CATEGORY_NAME_CONFLICT" : "INVALID_CATEGORY",
        error instanceof Error ? error.message : "Category could not be updated.",
        "Use a unique non-empty name up to 80 characters, then retry.");
    }
  });
  server.registerTool("delete_category", {
    title: "Delete category",
    description: "Delete an unused owned category. This fails while any expense still uses the category and requires explicit confirmation.",
    inputSchema: { categoryId: z.number().int().positive().safe(), confirm: z.boolean() },
  }, async ({ categoryId, confirm }) => {
    if (!confirm) return failure("DELETE_CONFIRMATION_REQUIRED", "Category deletion was not confirmed.",
      "Ask the user to confirm the exact category, then retry with confirm=true.");
    try {
      const category = categories.delete(categoryId);
      return category ? result({ deleted: true, category }) : failure("CATEGORY_NOT_FOUND", "Category not found or not owned by this user.",
        "Call list_categories and verify the categoryId before retrying.");
    } catch (error) {
      return failure(error instanceof CategoryInUseError ? "CATEGORY_IN_USE" : "CATEGORY_DELETE_FAILED",
        error instanceof Error ? error.message : "Category could not be deleted.",
        error instanceof CategoryInUseError
          ? "Move or delete every expense using this category, then retry."
          : "Retry once, then inspect the finbot server log using the MCP request ID.");
    }
  });
  server.registerTool("list_tags", {
    title: "List tags",
    description: "List the authenticated user's expense tags with expenseCount and totalCents across all time. Call before tagging so existing spellings are reused.",
    inputSchema: {},
  }, async () => result({ tags: tags.list() }));
  server.registerTool("tag_expenses", {
    title: "Tag or untag expenses",
    description: "Add or remove one tag on several owned expenses at once, e.g. tagging every expense of a holiday after calling list_expenses for its dates. Adding creates the tag if missing; other tags are untouched.",
    inputSchema: {
      tag: z.string().trim().min(1).max(MAX_TAG_LENGTH + 1),
      expenseIds: z.array(z.number().int().positive().safe()).min(1).max(500),
      action: z.enum(["add", "remove"]).default("add"),
    },
  }, async ({ tag, expenseIds, action }) => {
    let name: string;
    try { name = validateTagName(tag); }
    catch (error) { return failure("INVALID_TAG", (error as Error).message, `Use a tag name up to ${MAX_TAG_LENGTH} characters without commas.`); }
    try {
      const updated = repository.applyTag(expenseIds, name, action);
      const missing = expenseIds.filter((id) => !updated.includes(id));
      return result({ tag: name, action, updatedExpenseIds: updated, notFoundExpenseIds: [...new Set(missing)] });
    } catch {
      return failure("TAG_APPLY_FAILED", "Tags could not be updated.", "Retry once, then inspect the finbot server log using the MCP request ID.");
    }
  });
  server.registerTool("rename_tag", {
    title: "Rename tag",
    description: "Rename an owned tag; every expense carrying it shows the new name.",
    inputSchema: { tagId: z.number().int().positive().safe(), name: z.string().trim().min(1).max(MAX_TAG_LENGTH + 1) },
  }, async ({ tagId, name }) => {
    try {
      const tag = tags.update(tagId, name);
      return tag ? result({ tag }) : failure("TAG_NOT_FOUND", "Tag not found or not owned by this user.",
        "Call list_tags and verify the tagId before retrying.");
    } catch (error) {
      return failure(error instanceof TagConflictError ? "TAG_NAME_CONFLICT" : "INVALID_TAG",
        error instanceof Error ? error.message : "Tag could not be renamed.",
        `Use a unique name up to ${MAX_TAG_LENGTH} characters without commas, then retry.`);
    }
  });
  server.registerTool("delete_tag", {
    title: "Delete tag",
    description: "Delete an owned tag and remove it from every expense. The expenses themselves are kept. Requires explicit user confirmation.",
    inputSchema: { tagId: z.number().int().positive().safe(), confirm: z.boolean() },
  }, async ({ tagId, confirm }) => {
    if (!confirm) return failure("DELETE_CONFIRMATION_REQUIRED", "Tag deletion was not confirmed.",
      "Ask the user to confirm the exact tag, then retry with confirm=true.");
    try {
      const tag = tags.delete(tagId);
      return tag ? result({ deleted: true, tag }) : failure("TAG_NOT_FOUND", "Tag not found or not owned by this user.",
        "Call list_tags and verify the tagId before retrying.");
    } catch {
      return failure("TAG_DELETE_FAILED", "Tag could not be deleted.", "Retry once, then inspect the finbot server log using the MCP request ID.");
    }
  });
  server.registerTool("expense_summary", {
    title: "Expense summary",
    description: "Total spend, counts by category and spend per account-timezone day using the same search, tag and date filters. Use tag to answer how much a trip or event cost.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
      ...tagFilter,
    },
  }, async ({ query, from, to, tag, untagged }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    const timezone = getUserSettings(database, userId).timezone;
    const expenses = filterReportExpenses(repository.list(), { query, start: from, end: to, tag, untagged, timezone });
    const categories: Record<string, { count: number; amountCents: number }> = {};
    for (const expense of expenses) {
      const category = categories[expense.category] ?? { count: 0, amountCents: 0 };
      category.count += 1;
      category.amountCents += expense.amountCents;
      categories[expense.category] = category;
    }
    const days: Record<string, { count: number; amountCents: number }> = {};
    for (const expense of [...expenses].reverse()) {
      const key = dateKeyInZone(expense.date, timezone);
      const day = days[key] ?? { count: 0, amountCents: 0 };
      day.count += 1;
      day.amountCents += expense.amountCents;
      days[key] = day;
    }
    return result({ timezone, count: expenses.length, totalCents: expenses.reduce((sum, item) => sum + item.amountCents, 0), categories, days });
  });
  server.registerTool("export_report_pdf", {
    title: "Export expense report",
    description: "Generate a PDF report of filtered expenses, including all matching rows and summary totals.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
      ...tagFilter,
    },
  }, async ({ query, from, to, tag, untagged }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    const pdf = await buildExpensePdf(repository.list(), { query, start: from, end: to, tag, untagged, timezone: getUserSettings(database, userId).timezone });
    return { content: [{ type: "resource", resource: {
      uri: "expense-tracker://reports/filtered.pdf", mimeType: "application/pdf", blob: pdf.toString("base64"),
    } }] };
  });
  return server;
}

export async function handleExpenseMcp(request: Request, database: Database.Database, userId: number, proofDirectory?: string): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createExpenseMcpServer(database, userId, proofDirectory);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
