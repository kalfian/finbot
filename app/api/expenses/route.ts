import { getExpenses, postExpense } from "@/lib/expense-api";
import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";

export const runtime = "nodejs";

function expenseRepository() {
  return createExpenseRepository(getDatabase());
}

export function GET(): Response {
  return getExpenses(expenseRepository());
}

export async function POST(request: Request): Promise<Response> {
  return postExpense(request, expenseRepository());
}
