import { getExpenses, postExpense } from "@/lib/expense-api";
import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";

export const runtime = "nodejs";

function expenseRepository() {
  return createExpenseRepository(getDatabase());
}

export function GET(): Response {
  try {
    return getExpenses(expenseRepository());
  } catch {
    return Response.json(
      { error: "We couldn't load expenses. Please try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    return await postExpense(request, expenseRepository());
  } catch {
    return Response.json(
      { error: "We couldn't save this expense. Please try again." },
      { status: 500 },
    );
  }
}
