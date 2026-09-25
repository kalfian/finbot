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
): Promise<void> {
  const response = await fetchImplementation("/api/expenses", {
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
    return;
  }

  if (response.ok) {
    return;
  }

  const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
    ? body.error
    : "We couldn't save this expense. Please try again.";
  throw new Error(message);
}
