import { requireApiAuth } from "@/lib/api-auth";
import { getDatabase } from "@/lib/db";
import { getExpenses, validateExpense } from "@/lib/expense-api";
import { createExpenseRepository } from "@/lib/expenses";
import { filterReportExpenses, validateReportRange } from "@/lib/expense-filters";
import { budgetSnapshot } from "@/lib/budget";
import { createCategoryRepository } from "@/lib/categories";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const database = getDatabase();
  const auth = requireApiAuth(request, database);
  if ("response" in auth) return auth.response;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const start = searchParams.get("from") ?? "";
  const end = searchParams.get("to") ?? "";
  if (!validateReportRange(start, end)) return Response.json({ error: "Choose a valid date range." }, { status: 400 });
  if (!query && !start && !end) return getExpenses(createExpenseRepository(database, auth.user.id));
  return Response.json({ expenses: filterReportExpenses(createExpenseRepository(database, auth.user.id).list(), { query, start, end }) });
}

export async function POST(request: Request): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const categories = createCategoryRepository(database, auth.user.id).list().map(({ name }) => name);
  const validation = validateExpense(body, categories);
  if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
  const sourceId = (body as Record<string, unknown>).sourceId;
  if (sourceId !== undefined && (typeof sourceId !== "string" || !sourceId.trim() || sourceId.length > 200)) {
    return Response.json({ error: "sourceId must contain 1-200 characters." }, { status: 400 });
  }
  try {
    const { expense, replayed } = createExpenseRepository(database, auth.user.id).record(validation.value, sourceId as string | undefined);
    return Response.json({ expense, replayed, budget: budgetSnapshot(database, auth.user.id, expense.date) },
      { status: replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message.startsWith("sourceId") ? error.message : "We couldn't save this expense." },
      { status: error instanceof Error && error.message.startsWith("sourceId") ? 409 : 500 });
  }
}
