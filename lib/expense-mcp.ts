import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as z from "zod/v4";
import type Database from "better-sqlite3";
import { createExpenseRepository } from "./expenses";
import { buildExpensePdf } from "./expense-report";
import { filterReportExpenses, validateReportRange } from "./expense-filters";
import { EXPENSE_CATEGORIES } from "./expense-form";
import { validateExpense } from "./expense-api";

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
    description: "Record one expense. amountCents is a positive integer, date is an ISO UTC datetime.",
    inputSchema: {
      amountCents: z.number().int().positive().safe(),
      description: z.string().trim().min(1),
      category: z.enum(EXPENSE_CATEGORIES),
      date: z.string(),
    },
  }, async (expense) => {
    const validation = validateExpense(expense);
    if ("error" in validation) return { isError: true, ...result({ error: validation.error }) };
    return result({ expense: repository.create(validation.value) });
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
