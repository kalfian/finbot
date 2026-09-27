import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import type Database from "better-sqlite3";
import { createExpenseRepository } from "./expenses";
import { buildExpensePdf } from "./expense-report";
import { filterReportExpenses, validateReportRange } from "./expense-filters";
import { EXPENSE_CATEGORIES } from "./expense-form";
import { validateExpense } from "./expense-api";
import { budgetSnapshot, createBudgetRepository, validBudgetDate } from "./budget";

export function createExpenseMcpServer(database: Database.Database): McpServer {
  const server = new McpServer({ name: "expense-tracker", version: "1.0.0" });
  const repository = createExpenseRepository(database);
  const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  server.registerTool("list_expenses", {
    title: "List expenses",
    description: "List expenses newest first, optionally filtering description or category and inclusive Asia/Jakarta calendar dates.",
    inputSchema: {
      query: z.string().default(""),
      from: z.string().default(""),
      to: z.string().default(""),
    },
  }, async ({ query, from, to }) => {
    if (!validateReportRange(from, to)) return { isError: true, ...result({ error: "Choose a valid date range (YYYY-MM-DD)." }) };
    return result({ expenses: filterReportExpenses(repository.list(), { query, start: from, end: to }) });
  });
  server.registerTool("create_expense", {
    title: "Create expense",
    description: "Record one expense. amountCents is positive IDR minor units, date is ISO UTC; sourceId identifies a chat message for safe retries. Returns budget totals for that expense's Jakarta day and month.",
    inputSchema: {
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.enum(EXPENSE_CATEGORIES),
      date: z.string(),
      sourceId: z.string().min(1).max(200).optional(),
    },
  }, async (expense) => {
    const validation = validateExpense(expense);
    if ("error" in validation) return { isError: true, ...result({ error: validation.error }) };
    try {
      const { expense: created, replayed } = repository.record(validation.value, expense.sourceId);
      return result({ expense: created, replayed, budget: budgetSnapshot(database, created.date) });
    } catch (error) {
      return { isError: true, ...result({ error: error instanceof Error ? error.message : "Expense could not be saved." }) };
    }
  });
  server.registerTool("budget_status", {
    title: "Budget status",
    description: "Return Asia/Jakarta day and month spending, recurring monthly IDR limit, signed remaining amount, and exceeded status. Defaults to today.",
    inputSchema: { date: z.string().default("") },
  }, async ({ date }) => {
    if (date && !validBudgetDate(date)) return { isError: true, ...result({ error: "date must be YYYY-MM-DD." }) };
    return result(budgetSnapshot(database, date || new Date().toISOString()));
  });
  server.registerTool("set_monthly_limit", {
    title: "Set monthly limit",
    description: "Set one recurring monthly spending limit in positive integer IDR minor units; null clears it. Changes the limit, not expenses.",
    inputSchema: { monthlyLimitCents: z.number().int().positive().safe().nullable() },
  }, async ({ monthlyLimitCents }) => {
    createBudgetRepository(database).setMonthlyLimitCents(monthlyLimitCents);
    return result(budgetSnapshot(database));
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
    if (!validateReportRange(from, to)) return { isError: true, ...result({ error: "Choose a valid date range (YYYY-MM-DD)." }) };
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
    if (!validateReportRange(from, to)) return { isError: true, ...result({ error: "Choose a valid date range (YYYY-MM-DD)." }) };
    const pdf = await buildExpensePdf(repository.list(), { query, start: from, end: to });
    return { content: [{ type: "resource", resource: {
      uri: "expense-tracker://reports/filtered.pdf", mimeType: "application/pdf", blob: pdf.toString("base64"),
    } }] };
  });
  return server;
}

export async function handleExpenseMcp(request: Request, database: Database.Database): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  const server = createExpenseMcpServer(database);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
