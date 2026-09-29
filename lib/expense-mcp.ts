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

export function createExpenseMcpServer(database: Database.Database, userId: number, proofDirectory?: string): McpServer {
  const server = new McpServer({ name: "expense-tracker", version: "1.0.0" });
  const repository = createExpenseRepository(database, userId);
  const categories = createCategoryRepository(database, userId);
  const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  const failure = (code: string, error: string, hint: string) => ({ isError: true, ...result({ error, code, hint }) });
  server.registerTool("list_expenses", {
    title: "List expenses",
    description: "List expenses newest first, optionally filtering description or category and inclusive Asia/Jakarta calendar dates.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
    },
  }, async ({ query, from, to }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    return result({ expenses: filterReportExpenses(repository.list(), { query, start: from, end: to }) });
  });
  server.registerTool("create_expense", {
    title: "Create expense",
    description: "Record one expense. Call list_categories first. amountCents is positive IDR minor units and date is ISO UTC. sourceId is an optional caller-generated idempotency key: use transport metadata when already available, otherwise omit it; never ask the end user for sourceId. Returns budget totals for the expense's Jakarta day and month.",
    inputSchema: {
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.string().trim().min(1).max(80),
      date: z.string(),
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
    description: "Replace an owned expense's amount, description, category, and date. Returns the updated expense and recalculated budget snapshot.",
    inputSchema: {
      expenseId: z.number().int().positive().safe(),
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.string().trim().min(1).max(80),
      date: z.string(),
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
    description: "Return Asia/Jakarta day and month spending, recurring monthly IDR limit, signed remaining amount, and exceeded status. Defaults to today.",
    inputSchema: { date: z.string().default("") },
  }, async ({ date }) => {
    if (date && !validBudgetDate(date)) return failure("INVALID_BUDGET_DATE", "date must use YYYY-MM-DD.",
      "Pass an Asia/Jakarta calendar date or leave date empty for today.");
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
  server.registerTool("expense_summary", {
    title: "Expense summary",
    description: "Total spend and counts by category using the same search and Asia/Jakarta date filters.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
    },
  }, async ({ query, from, to }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    const expenses = filterReportExpenses(repository.list(), { query, start: from, end: to });
    const categories: Record<string, { count: number; amountCents: number }> = {};
    for (const expense of expenses) {
      const category = categories[expense.category] ?? { count: 0, amountCents: 0 };
      category.count += 1;
      category.amountCents += expense.amountCents;
      categories[expense.category] = category;
    }
    return result({ count: expenses.length, totalCents: expenses.reduce((sum, item) => sum + item.amountCents, 0), categories });
  });
  server.registerTool("export_report_pdf", {
    title: "Export expense report",
    description: "Generate a PDF report of filtered expenses, including all matching rows and summary totals.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
    },
  }, async ({ query, from, to }) => {
    if (!validateReportRange(from, to)) return failure("INVALID_DATE_RANGE",
      "Choose a valid date range using YYYY-MM-DD.", "Ensure from is on or before to, or leave either value empty.");
    const pdf = await buildExpensePdf(repository.list(), { query, start: from, end: to });
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
