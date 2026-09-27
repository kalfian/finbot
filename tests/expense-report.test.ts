import assert from "node:assert/strict";
import test from "node:test";
import { buildExpensePdf } from "../lib/expense-report";
import { filterReportExpenses, validateReportRange } from "../lib/expense-filters";

const records = [
  { id: 1, amountCents: 400000, description: "Train", category: "Transport", date: "2026-09-01T00:00:00.000Z", createdAt: "" },
  { id: 2, amountCents: 2500000, description: "Lunch", category: "Food", date: "2026-09-24T16:59:59.000Z", createdAt: "" },
  { id: 3, amountCents: 10000, description: "Next day", category: "Other", date: "2026-09-24T17:00:00.000Z", createdAt: "" },
];

test("inclusive Jakarta date boundaries select the same records for list and PDF", async () => {
  const filter = { query: "", start: "2026-09-01", end: "2026-09-24" };
  assert.deepEqual(filterReportExpenses(records, filter).map((record) => record.id), [1, 2]);
  const pdf = await buildExpensePdf(records, filter);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 2000);
});

test("empty report is a valid PDF and reversed range is invalid", async () => {
  assert.equal((await buildExpensePdf(records, { query: "", start: "2026-08-01", end: "2026-08-31" })).subarray(0, 5).toString(), "%PDF-");
  assert.equal(validateReportRange("2026-02-30", "2026-03-01"), false);
  assert.throws(() => buildExpensePdf(records, { query: "", start: "2026-09-25", end: "2026-09-24" }), /valid date range/);
});

test("Unicode descriptions and long descriptions survive PDF export", async () => {
  const description = `Café 🍎 東京 ${"long expense note ".repeat(120)}`;
  const pdf = await buildExpensePdf([{ ...records[0], description }], { query: "", start: "", end: "" });
  assert.ok(pdf.length > 3000);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
});
