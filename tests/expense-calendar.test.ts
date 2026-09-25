import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCalendarDays,
  filterExpenses,
  getLocalDateKey,
  groupExpensesByLocalDate,
} from "../lib/expense-calendar";

const expenses = [
  { id: 1, amountCents: 250000, description: "Morning coffee", category: "Food", date: "2026-02-14T08:30:00.000Z", createdAt: "2026-02-14T08:31:00.000Z" },
  { id: 2, amountCents: 500000, description: "Train pass", category: "Transport", date: "2026-02-14T09:30:00.000Z", createdAt: "2026-02-14T09:31:00.000Z" },
  { id: 3, amountCents: 750000, description: "Electricity", category: "Bills", date: "2026-02-15T10:30:00.000Z", createdAt: "2026-02-15T10:31:00.000Z" },
];

test("filters loaded expenses by description or visible category text, case-insensitively", () => {
  assert.deepEqual(filterExpenses(expenses, "COFFEE").map(({ id }) => id), [1]);
  assert.deepEqual(filterExpenses(expenses, "transport").map(({ id }) => id), [2]);
  assert.deepEqual(filterExpenses(expenses, "").map(({ id }) => id), [1, 2, 3]);
  assert.deepEqual(filterExpenses(expenses, "  bills  ").map(({ id }) => id), [3]);
});

test("groups ISO datetime expenses using browser-local Date values instead of UTC text", () => {
  const instant = "2026-02-01T00:30:00.000Z";
  const localDate = new Date(instant);
  const expectedKey = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;

  assert.equal(getLocalDateKey(instant), expectedKey);
  assert.deepEqual(groupExpensesByLocalDate([{ ...expenses[0], date: instant }]).get(expectedKey)?.map(({ id }) => id), [1]);
});

test("builds a complete Sunday-first month matrix and groups matching day expenses", () => {
  const days = buildCalendarDays(new Date(2026, 1, 1));
  assert.equal(days.length, 28);
  assert.equal(days[0]?.getDate(), 1);
  assert.equal(days.at(-1)?.getDate(), 28);

  const localCalendarCell = days[13];
  assert.ok(localCalendarCell);
  assert.equal(getLocalDateKey(localCalendarCell), "2026-02-14");

  const groups = groupExpensesByLocalDate(expenses);
  const key = getLocalDateKey(expenses[0].date);
  assert.equal(groups.get(key)?.length, 2);
});
