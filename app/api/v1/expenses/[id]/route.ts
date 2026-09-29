import { requireApiAuth } from "@/lib/api-auth";
import { budgetSnapshot } from "@/lib/budget";
import { getDatabase } from "@/lib/db";
import { deleteExpense, patchExpense } from "@/lib/expense-api";
import { createExpenseRepository } from "@/lib/expenses";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

function parseId(value: string): number | null {
  const id = Number(value);
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export async function PATCH(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Expense not found." }, { status: 404 });
  const response = await patchExpense(request, id, createExpenseRepository(database, auth.user.id));
  if (!response.ok) return response;
  const { expense } = await response.json();
  return Response.json({ expense, budget: budgetSnapshot(database, auth.user.id, expense.date) },
    { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const database = getDatabase();
  const auth = requireApiAuth(request, database, { write: true });
  if ("response" in auth) return auth.response;
  const id = parseId((await params).id);
  if (!id) return Response.json({ error: "Expense not found." }, { status: 404 });
  const response = deleteExpense(id, createExpenseRepository(database, auth.user.id));
  if (!response.ok) return response;
  const body = await response.json();
  return Response.json({ ...body, budget: budgetSnapshot(database, auth.user.id, body.expense.date) },
    { headers: { "Cache-Control": "no-store" } });
}
