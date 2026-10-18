import { deleteExpense, getExpenses, postExpense, putExpense } from "@/lib/expense-api";
import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";
import { requireApi } from "@/lib/auth-guard";

export const runtime = "nodejs";

function expenseRepository() {
  return createExpenseRepository(getDatabase());
}

export function GET(request?: Request): Response {
  if (request) { const denied = requireApi(request, false, "We couldn't load expenses. Please try again."); if (denied) return denied; }
  try {
    return getExpenses(expenseRepository(), request);
  } catch {
    return Response.json(
      { error: "We couldn't load expenses. Please try again." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<Response> {
  const denied = requireApi(request, true, "We couldn't update this expense. Please try again."); if (denied) return denied;
  try {
    return await putExpense(request, expenseRepository());
  } catch {
    return Response.json({ error: "We couldn't update this expense. Please try again." }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const denied = requireApi(request, true, "We couldn't delete this expense. Please try again."); if (denied) return denied;
  try {
    return await deleteExpense(request, expenseRepository());
  } catch {
    return Response.json({ error: "We couldn't delete this expense. Please try again." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const denied = requireApi(request, true, "We couldn't save this expense. Please try again."); if (denied) return denied;
  try {
    return await postExpense(request, expenseRepository());
  } catch {
    return Response.json(
      { error: "We couldn't save this expense. Please try again." },
      { status: 500 },
    );
  }
}
