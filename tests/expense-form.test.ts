import assert from "node:assert/strict";
import test from "node:test";

import { saveExpense, validateExpenseForm } from "../lib/expense-form";

test("validateExpenseForm converts valid IDR input to the API request shape", () => {
  assert.deepEqual(validateExpenseForm({
    amount: "12500.50",
    description: "  Train fare  ",
    date: "2026-02-14",
  }), {
    value: { amountCents: 1250050, description: "Train fare", date: "2026-02-14" },
  });
});

test("validateExpenseForm reports each client-side validation boundary", () => {
  assert.deepEqual(validateExpenseForm({ amount: "0", description: "Lunch", date: "2026-02-14" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1.234", description: "Lunch", date: "2026-02-14" }), {
    error: "Enter an amount greater than Rp0,00, with no more than two decimal places.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "   ", date: "2026-02-14" }), {
    error: "Enter a description for this expense.",
  });
  assert.deepEqual(validateExpenseForm({ amount: "1", description: "Lunch", date: "" }), {
    error: "Choose the date of this expense.",
  });
});

test("saveExpense posts the request and handles success and API errors", async () => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const successfulFetch: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ expense: { id: 1 } }), { status: 201 });
  };

  await saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, successfulFetch);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "/api/expenses");
  assert.equal(calls[0].init?.method, "POST");
  assert.deepEqual(calls[0].init?.headers, { "content-type": "application/json" });
  assert.deepEqual(JSON.parse(calls[0].init?.body as string), {
    amountCents: 1500,
    description: "Coffee",
    date: "2026-02-14",
  });

  const failingFetch: typeof fetch = async () => new Response(JSON.stringify({ error: "Date is unavailable." }), { status: 400 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, failingFetch),
    { message: "Date is unavailable." },
  );

  const malformedErrorFetch: typeof fetch = async () => new Response("not json", { status: 500 });
  await assert.rejects(
    saveExpense({ amountCents: 1500, description: "Coffee", date: "2026-02-14" }, malformedErrorFetch),
    { message: "We couldn't save this expense. Please try again." },
  );
});
