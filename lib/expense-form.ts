import { toAmountCents } from "./money";

export type ExpenseFormValues = {
  amount: string;
  description: string;
  date: string;
};

export type NewExpenseRequest = {
  amountCents: number;
  description: string;
  date: string;
};

export function getBrowserLocalDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
  if (!values.date) {
    return { error: "Choose the date of this expense." };
  }

  return {
    value: {
      amountCents,
      description: values.description.trim(),
      date: values.date,
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
