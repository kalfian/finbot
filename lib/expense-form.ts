import { toAmountCents } from "./money";

export type ExpenseFormValues = {
  amount: string;
  description: string;
  category: string;
  date: string;
};

export type NewExpenseRequest = {
  amountCents: number;
  description: string;
  category: ExpenseCategory;
  date: string;
};

export const EXPENSE_CATEGORIES = ["Food", "Transport", "Bills", "Shopping", "Health", "Other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function getBrowserLocalDateTime(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function amountCentsToInput(amountCents: number): string {
  const whole = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

/** Converts a datetime-local value from the browser's timezone into an ISO UTC instant. */
export function localDateTimeToUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || getBrowserLocalDateTime(date) !== value) return null;
  return date.toISOString();
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

type ValidationResult =
  | { value: NewExpenseRequest }
  | { error: string };

export function validateExpenseForm(values: ExpenseFormValues): ValidationResult {
  const amountCents = toAmountCents(values.amount);
  if (amountCents === null) {
    return { error: "Enter an amount greater than Rp0,00, with no more than two decimal places." };
  }
  if (!values.description.trim()) {
    return { error: "Enter a description for this expense." };
  }
  if (!isExpenseCategory(values.category)) {
    return { error: "Choose a category for this expense." };
  }
  if (!values.date) {
    return { error: "Choose the date and time of this expense." };
  }
  const date = localDateTimeToUtc(values.date);
  if (!date) {
    return { error: "Choose a valid date and time for this expense." };
  }

  return {
    value: {
      amountCents,
      description: values.description.trim(),
      category: values.category,
      date,
    },
  };
}

type FetchImplementation = typeof fetch;

export async function saveExpense(
  expense: NewExpenseRequest,
  fetchImplementation: FetchImplementation = fetch,
): Promise<number> {
  const response = await fetchImplementation("/api/v1/expenses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(expense),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error("We couldn't save this expense. Please try again.");
    }
    throw new Error("Expense response was incomplete.");
  }

  if (response.ok) {
    if (body && typeof body === "object" && "expense" in body && body.expense
      && typeof body.expense === "object" && "id" in body.expense && typeof body.expense.id === "number") {
      return body.expense.id;
    }
    throw new Error("Expense response was incomplete.");
  }

  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : "We couldn't save this expense. Please try again.";
  throw new Error(message);
}

export async function updateExpense(
  id: number,
  expense: NewExpenseRequest,
  fetchImplementation: FetchImplementation = fetch,
): Promise<void> {
  const response = await fetchImplementation(`/api/v1/expenses/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(expense),
  });
  if (response.ok) return;

  const body: unknown = await response.json().catch(() => null);
  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : "We couldn't update this expense. Please try again.";
  throw new Error(message);
}

export async function deleteExpense(id: number, fetchImplementation: FetchImplementation = fetch): Promise<void> {
  const response = await fetchImplementation(`/api/v1/expenses/${id}`, { method: "DELETE" });
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error : "We couldn't delete this expense. Please try again.");
}

export async function uploadProof(expenseId: number, file: File, sourceId: string, fetchImplementation: FetchImplementation = fetch): Promise<void> {
  const form = new FormData();
  form.set("file", file);
  form.set("sourceId", sourceId);
  const response = await fetchImplementation(`/api/v1/expenses/${expenseId}/proofs`, { method: "POST", body: form });
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  throw new Error(body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error : "Proof could not be uploaded.");
}
