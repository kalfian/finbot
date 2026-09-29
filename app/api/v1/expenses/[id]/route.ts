import { requireApiAuth } from "@/lib/api-auth";
import { budgetSnapshot } from "@/lib/budget";
import { getDatabase } from "@/lib/db";
import { deleteExpense, patchExpense } from "@/lib/expense-api";
import { createExpenseRepository } from "@/lib/expenses";
import { createCategoryRepository } from "@/lib/categories";
import { validateExpense } from "@/lib/expense-api";

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
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const categories = createCategoryRepository(database, auth.user.id).list().map(({ name }) => name);
  const validation = validateExpense(body, categories);
  if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
  const response = await patchExpense(new Request(request.url, { method: "PATCH", body: JSON.stringify(validation.value) }),
    id, createExpenseRepository(database, auth.user.id));
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
