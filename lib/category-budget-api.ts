import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expense-form";
import type { CategoryBudgetRepository, NewCategoryBudget } from "./category-budgets";

type ValidationResult = { value: NewCategoryBudget } | { error: string };

export function isValidBudgetMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

export function validateCategoryBudget(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Request body must be a JSON object." };
  const { category, month, amountCents } = value as Record<string, unknown>;
  if (typeof category !== "string" || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "category must be a supported expense category." };
  if (typeof month !== "string" || !isValidBudgetMonth(month)) return { error: "month must be a valid YYYY-MM calendar month." };
  if (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0) return { error: "amountCents must be a positive integer." };
  return { value: { category: category as ExpenseCategory, month, amountCents } };
}

export function getCategoryBudgets(request: Request, repository: CategoryBudgetRepository): Response {
  const month = new URL(request.url).searchParams.get("month");
  if (!month || !isValidBudgetMonth(month)) return Response.json({ error: "month must be a valid YYYY-MM calendar month." }, { status: 400 });
  try {
    return Response.json({ month, budgets: repository.summaries(month) });
  } catch {
    return Response.json({ error: "We couldn't load category budgets. Please try again." }, { status: 500 });
  }
}

export async function putCategoryBudget(request: Request, repository: CategoryBudgetRepository): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const validation = validateCategoryBudget(body);
  if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
  try {
    return Response.json({ budget: repository.upsert(validation.value) });
  } catch {
    return Response.json({ error: "We couldn't save this category budget. Please try again." }, { status: 500 });
  }
}
