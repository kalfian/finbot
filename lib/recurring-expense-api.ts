import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./expense-form";
import { RECURRING_AMOUNT_TYPES, RECURRING_FREQUENCIES, type NewRecurringExpense, type RecurringExpenseRepository, type UpdatedRecurringExpense } from "./recurring-expenses";

function isUtcDateTime(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}
function positiveId(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }

type ValidationResult = { value: NewRecurringExpense } | { error: string };
export function validateRecurringExpense(value: unknown): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Request body must be a JSON object." };
  const { amountCents, amountType, description, category, frequency, nextDueAt } = value as Record<string, unknown>;
  if (typeof amountType !== "string" || !(RECURRING_AMOUNT_TYPES as readonly string[]).includes(amountType)) return { error: "amountType must be fixed or variable." };
  if (amountType === "fixed" && (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0)) return { error: "amountCents must be a positive integer for fixed plans." };
  if (amountType === "variable" && amountCents !== null) return { error: "amountCents must be null for variable plans." };
  if (typeof description !== "string" || !description.trim()) return { error: "description is required." };
  if (typeof category !== "string" || !(EXPENSE_CATEGORIES as readonly string[]).includes(category)) return { error: "category must be a supported expense category." };
  if (typeof frequency !== "string" || !(RECURRING_FREQUENCIES as readonly string[]).includes(frequency)) return { error: "frequency must be weekly or monthly." };
  if (!isUtcDateTime(nextDueAt)) return { error: "nextDueAt must be an ISO UTC datetime." };
  return { value: { amountCents: amountCents as number | null, amountType: amountType as NewRecurringExpense["amountType"], description: description.trim(), category: category as ExpenseCategory, frequency: frequency as NewRecurringExpense["frequency"], nextDueAt } };
}
async function body(request: Request): Promise<unknown> { return request.json().catch(() => undefined); }
export function getRecurringExpenses(repository: RecurringExpenseRepository, request?: Request): Response {
  try { return Response.json({ recurringExpenses: repository.list(new URL(request?.url ?? "http://localhost").searchParams.get("includeInactive") === "true") }); }
  catch { return Response.json({ error: "We couldn't load recurring expenses. Please try again." }, { status: 500 }); }
}
export async function postRecurringExpense(request: Request, repository: RecurringExpenseRepository): Promise<Response> {
  const validation = validateRecurringExpense(await body(request));
  if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
  try { return Response.json({ recurringExpense: repository.create(validation.value) }, { status: 201 }); }
  catch { return Response.json({ error: "We couldn't save this recurring expense. Please try again." }, { status: 500 }); }
}
export async function putRecurringExpense(request: Request, repository: RecurringExpenseRepository): Promise<Response> {
  const value = await body(request) as Record<string, unknown> | undefined; const validation = validateRecurringExpense(value);
  if (!positiveId(value?.id) || "error" in validation || typeof value?.active !== "boolean") return Response.json({ error: "error" in validation ? validation.error : !positiveId(value?.id) ? "id must be a positive integer." : "active must be a boolean." }, { status: 400 });
  try { const recurringExpense = repository.update(value.id, { ...validation.value, active: value.active } as UpdatedRecurringExpense); return recurringExpense ? Response.json({ recurringExpense }) : Response.json({ error: "Recurring expense not found." }, { status: 404 }); }
  catch { return Response.json({ error: "We couldn't update this recurring expense. Please try again." }, { status: 500 }); }
}
export async function deleteRecurringExpense(request: Request, repository: RecurringExpenseRepository): Promise<Response> {
  const value = await body(request) as Record<string, unknown> | undefined;
  if (!positiveId(value?.id)) return Response.json({ error: "id must be a positive integer." }, { status: 400 });
  try { const recurringExpense = repository.delete(value.id); return recurringExpense ? Response.json({ recurringExpense }) : Response.json({ error: "Recurring expense not found." }, { status: 404 }); }
  catch { return Response.json({ error: "We couldn't delete this recurring expense. Please try again." }, { status: 500 }); }
}
export async function completeRecurringExpense(request: Request, repository: RecurringExpenseRepository): Promise<Response> {
  const value = await body(request) as Record<string, unknown> | undefined;
  if (!positiveId(value?.id) || !isUtcDateTime(value?.expectedNextDueAt)) return Response.json({ error: !positiveId(value?.id) ? "id must be a positive integer." : "expectedNextDueAt must be an ISO UTC datetime." }, { status: 400 });
  if (value.amountCents !== undefined && (typeof value.amountCents !== "number" || !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0)) return Response.json({ error: "amountCents must be a positive integer when supplied." }, { status: 400 });
  try { const result = repository.complete(value.id, value.expectedNextDueAt, value.amountCents as number | undefined); return result ? Response.json(result, { status: 201 }) : Response.json({ error: "This planned occurrence is no longer available or needs a positive paid amount." }, { status: 409 }); }
  catch { return Response.json({ error: "We couldn't record this recurring expense. Please try again." }, { status: 500 }); }
}
