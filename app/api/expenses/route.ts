import { getExpenses, postExpense } from "@/lib/expense-api";
import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";
import { requireSameOrigin, requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  try {
    const database = getDatabase();
    const auth = requireSession(request, database);
    if ("response" in auth) return auth.response;
    return getExpenses(createExpenseRepository(database, auth.user.id));
  } catch {
    return Response.json(
      { error: "We couldn't load expenses. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  try {
    const database = getDatabase();
    const auth = requireSession(request, database);
    if ("response" in auth) return auth.response;
    return await postExpense(request, createExpenseRepository(database, auth.user.id));
  } catch {
    return Response.json(
      { error: "We couldn't save this expense. Please try again." },
      { status: 500 },
    );
  }
}
