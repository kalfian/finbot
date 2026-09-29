import { EXPENSE_CATEGORIES } from "./expense-form";
import type { ExpenseRepository, NewExpense } from "./expenses";
import { deleteProofFiles, type ProofFile } from "./expense-proofs";

type ValidationResult =
  | { value: NewExpense }
  | { error: string };

export function isUtcDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function validateExpense(value: unknown, supportedCategories: readonly string[] = EXPENSE_CATEGORIES): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Request body must be a JSON object." };
  }

  const { amountCents, description, category, date } = value as Record<string, unknown>;
  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0
  ) {
    return { error: "amountCents must be a positive integer." };
  }
  if (typeof description !== "string" || !description.trim()) {
    return { error: "description is required." };
  }
  const matchedCategory = typeof category === "string"
    ? supportedCategories.find((item) => item.toLocaleLowerCase() === category.toLocaleLowerCase())
    : undefined;
  if (!matchedCategory) {
    return { error: "category must be a supported expense category." };
  }
  if (typeof date !== "string" || !isUtcDateTime(date)) {
    return { error: "date must be an ISO UTC datetime." };
  }

  return {
    value: {
      amountCents,
      description: description.trim(),
      category: matchedCategory,
      date,
    },
  };
}

export function getExpenses(repository: Pick<ExpenseRepository, "list">): Response {
  try {
    return Response.json({ expenses: repository.list() });
  } catch {
    return Response.json(
      { error: "We couldn't load expenses. Please try again." },
      { status: 500 },
    );
  }
}

export async function postExpense(
  request: Request,
  repository: Pick<ExpenseRepository, "create">,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateExpense(body);
  if ("error" in validation) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    return Response.json(
      { expense: repository.create(validation.value) },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "We couldn't save this expense. Please try again." },
      { status: 500 },
    );
  }
}

export async function patchExpense(
  request: Request,
  id: number,
  repository: Pick<ExpenseRepository, "update">,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateExpense(body);
  if ("error" in validation) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    const expense = repository.update(id, validation.value);
    if (!expense) return Response.json({ error: "Expense not found." }, { status: 404 });
    return Response.json({ expense });
  } catch {
    return Response.json(
      { error: "We couldn't update this expense. Please try again." },
      { status: 500 },
    );
  }
}

export function deleteExpense(
  id: number,
  repository: Pick<ExpenseRepository, "delete">,
  cleanup: (proofs: ProofFile[]) => void = deleteProofFiles,
): Response {
  try {
    const deleted = repository.delete(id);
    if (!deleted) return Response.json({ error: "Expense not found." }, { status: 404 });
    cleanup(deleted.proofs);
    return Response.json({ deleted: true, expense: deleted.expense });
  } catch {
    return Response.json({ error: "We couldn't delete this expense. Please try again." }, { status: 500 });
  }
}
