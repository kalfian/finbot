import type { ExpenseRepository, NewExpense } from "./expenses";

type ValidationResult =
  | { value: NewExpense }
  | { error: string };

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validateExpense(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Request body must be a JSON object." };
  }

  const { amountCents, description, date } = value as Record<string, unknown>;
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
  if (typeof date !== "string" || !isIsoDate(date)) {
    return { error: "date must be an ISO date in YYYY-MM-DD format." };
  }

  return {
    value: {
      amountCents,
      description: description.trim(),
      date,
    },
  };
}

export function getExpenses(repository: ExpenseRepository): Response {
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
  repository: ExpenseRepository,
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
