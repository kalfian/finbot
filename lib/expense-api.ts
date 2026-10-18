import { EXPENSE_CATEGORIES } from "./expense-form";
import type { ExpenseFilters, ExpenseRepository, NewExpense } from "./expenses";
import { validateTagsAndSplits } from "./portability";

type ValidationResult =
  | { value: NewExpense }
  | { error: string };

function isUtcDateTime(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function validateExpense(value: unknown, supportsCategory: (category: string) => boolean = (category) => (EXPENSE_CATEGORIES as readonly string[]).includes(category)): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: "Request body must be a JSON object." };
  }

  const { amountCents, description, category, date, tags, splits } = value as Record<string, unknown>;
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
  if (typeof category !== "string" || !supportsCategory(category)) {
    return { error: "category must be a supported expense category." };
  }
  if (typeof date !== "string" || !isUtcDateTime(date)) {
    return { error: "date must be an ISO UTC datetime." };
  }

  const metadata = validateTagsAndSplits(tags, splits, amountCents);
  if ("error" in metadata) return metadata;
  return {
    value: {
      amountCents,
      description: description.trim(),
      category,
      date,
      ...metadata,
    },
  };
}

function nonNegativeInteger(value: string | null, field: string): number | undefined | string {
  if (value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : `${field} must be a non-negative integer.`;
}

function pageLimit(value: string | null): number | undefined | string {
  const parsed = nonNegativeInteger(value, "limit");
  if (typeof parsed === "string" || parsed === undefined) return parsed;
  return parsed > 0 && parsed <= 100 ? parsed : "limit must be between 1 and 100.";
}

export function getExpenses(repository: ExpenseRepository, request?: Request): Response {
  try {
    if (!request) return Response.json({ expenses: repository.list() });
    const params = new URL(request.url).searchParams;
    const limit = pageLimit(params.get("limit")); const offset = nonNegativeInteger(params.get("offset"), "offset");
    const minAmountCents = nonNegativeInteger(params.get("minAmountCents"), "minAmountCents"); const maxAmountCents = nonNegativeInteger(params.get("maxAmountCents"), "maxAmountCents");
    const start = params.get("start") || undefined; const end = params.get("end") || undefined;
    const priorStart = params.get("priorStart") || undefined; const priorEnd = params.get("priorEnd") || undefined;
    const search = params.get("search")?.trim() || undefined;
    const error = [limit, offset, minAmountCents, maxAmountCents].find((item) => typeof item === "string") as string | undefined;
    if (error) return Response.json({ error }, { status: 400 });
    for (const [field, value] of [["start", start], ["end", end], ["priorStart", priorStart], ["priorEnd", priorEnd]] as const) {
      if (value && !isUtcDateTime(value)) return Response.json({ error: `${field} must be an ISO UTC datetime.` }, { status: 400 });
    }
    if ((start && end && start >= end) || (priorStart && priorEnd && priorStart >= priorEnd)) return Response.json({ error: "Date range end must be after its start." }, { status: 400 });
    if ((priorStart === undefined) !== (priorEnd === undefined)) return Response.json({ error: "priorStart and priorEnd must be provided together." }, { status: 400 });
    if (minAmountCents !== undefined && maxAmountCents !== undefined && minAmountCents > maxAmountCents) return Response.json({ error: "minAmountCents cannot exceed maxAmountCents." }, { status: 400 });
    if (search && search.length > 120) return Response.json({ error: "search must be 120 characters or fewer." }, { status: 400 });
    const category = params.get("category") || undefined;
    if (category && !(repository.supportsCategory?.(category) ?? (EXPENSE_CATEGORIES as readonly string[]).includes(category))) return Response.json({ error: "category must be a supported expense category." }, { status: 400 });
    const filters: ExpenseFilters = { start, end, category, search, limit: limit as number | undefined, offset: offset as number | undefined, minAmountCents: minAmountCents as number | undefined, maxAmountCents: maxAmountCents as number | undefined };
    if (!repository.query) return Response.json({ expenses: repository.list() });
    const page = repository.query(filters);
    const { limit: _limit, offset: _offset, ...summaryFilters } = filters;
    const prior = priorStart && priorEnd ? repository.query({ ...summaryFilters, start: priorStart, end: priorEnd }) : undefined;
    const insights = repository.insights?.(summaryFilters) ?? { categories: [], months: [] };
    return Response.json({ ...page, insights, summary: { totalCents: page.totalCents, transactionCount: page.totalCount, priorTotalCents: prior?.totalCents ?? null, priorTransactionCount: prior?.totalCount ?? null } });
  } catch {
    return Response.json(
      { error: "We couldn't load expenses. Please try again." },
      { status: 500 },
    );
  }
}

export async function putExpense(request: Request, repository: ExpenseRepository): Promise<Response> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = body?.id;
  const validation = validateExpense(body, (category) => repository.supportsCategory?.(category) ?? (EXPENSE_CATEGORIES as readonly string[]).includes(category));
  if (!Number.isSafeInteger(id) || (id as number) <= 0 || "error" in validation) return Response.json({ error: "error" in validation ? validation.error : "id must be a positive integer." }, { status: 400 });
  try { const expense = repository.update?.(id as number, validation.value); return expense ? Response.json({ expense }) : Response.json({ error: "Expense not found." }, { status: 404 }); }
  catch { return Response.json({ error: "We couldn't update this expense. Please try again." }, { status: 500 }); }
}

export async function deleteExpense(request: Request, repository: ExpenseRepository): Promise<Response> {
  const body = await request.json().catch(() => null) as { id?: unknown } | null;
  if (!Number.isSafeInteger(body?.id) || (body?.id as number) <= 0) return Response.json({ error: "id must be a positive integer." }, { status: 400 });
  try { const expense = repository.delete?.(body!.id as number); return expense ? Response.json({ expense }) : Response.json({ error: "Expense not found." }, { status: 404 }); }
  catch { return Response.json({ error: "We couldn't delete this expense. Please try again." }, { status: 500 }); }
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

  const validation = validateExpense(body, (category) => repository.supportsCategory?.(category) ?? (EXPENSE_CATEGORIES as readonly string[]).includes(category));
  if ("error" in validation) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  try {
    const category = validation.value.category === "Other" ? repository.categorize?.(validation.value.description) ?? validation.value.category : validation.value.category;
    return Response.json(
      { expense: repository.create({ ...validation.value, category }) },
      { status: 201 },
    );
  } catch {
    return Response.json(
      { error: "We couldn't save this expense. Please try again." },
      { status: 500 },
    );
  }
}
