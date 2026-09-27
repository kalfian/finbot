import { requireToken } from "@/lib/api-tokens";
import { getDatabase } from "@/lib/db";
import { getExpenses, postExpense } from "@/lib/expense-api";
import { createExpenseRepository } from "@/lib/expenses";
import { filterReportExpenses, validateReportRange } from "@/lib/expense-filters";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const denied = requireToken(request, database);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const start = searchParams.get("from") ?? "";
  const end = searchParams.get("to") ?? "";
  if (!validateReportRange(start, end)) return Response.json({ error: "Choose a valid date range." }, { status: 400 });
  if (!query && !start && !end) return getExpenses(createExpenseRepository(database));
  return Response.json({ expenses: filterReportExpenses(createExpenseRepository(database).list(), { query, start, end }) });
}

export async function POST(request: Request): Promise<Response> {
  const database = getDatabase();
  const denied = requireToken(request, database);
  if (denied) return denied;
  return postExpense(request, createExpenseRepository(database));
}
