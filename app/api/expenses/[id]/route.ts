import { patchExpense } from "@/lib/expense-api";
import { getDatabase } from "@/lib/db";
import { createExpenseRepository } from "@/lib/expenses";
import { requireSameOrigin, requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const database = getDatabase();
  const auth = requireSession(request, database);
  if ("response" in auth) return auth.response;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "Expense not found." }, { status: 404 });
  }

  try {
    return await patchExpense(request, id, createExpenseRepository(database, auth.user.id));
  } catch {
    return Response.json(
      { error: "We couldn't update this expense. Please try again." },
      { status: 500 },
    );
  }
}
