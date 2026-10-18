import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { applyRule, createPortabilityRepository } from "../lib/portability";

function setup() { const database = new Database(":memory:"); initializeDatabase(database); return { database, expenses: createExpenseRepository(database), portability: createPortabilityRepository(database) }; }
const stamp = "2026-02-14T08:30:00.000Z";

test("CSV export quotes commas, quotes, and newlines", () => {
  const { database, expenses, portability } = setup();
  try { const item = expenses.create({ amountCents: 100, description: 'Shop, "special"\nitem', category: "Food", date: stamp }); const csv = portability.exportCsv([item]); assert.match(csv, /"Shop, ""special""\nitem"/); assert.equal(portability.preview(csv).errors.length, 0); } finally { database.close(); }
});

test("CSV preview identifies malformed rows and duplicate ledger entries", () => {
  const { database, expenses, portability } = setup();
  try { expenses.create({ amountCents: 100, description: "Coffee", category: "Food", date: stamp }); const preview = portability.preview(`amountCents,description,category,date,tags,splits\r\n100,Coffee,Food,${stamp},,\r\nnot-a-number,Oops,Food,${stamp},,\r\n`); assert.deepEqual(preview.duplicates, [2]); assert.deepEqual(preview.errors, [{ row: 3, error: "amountCents must be a positive integer." }]); } finally { database.close(); }
});

test("import is atomic when any row is invalid or duplicate", () => {
  const { database, expenses, portability } = setup();
  try { const csv = `amountCents,description,category,date,tags,splits\r\n100,First,Food,${stamp},,\r\n200,Bad,Food,not-a-date,,\r\n`; const result = portability.import(csv, item => expenses.create(item)); assert.equal(result.imported, 0); assert.deepEqual(expenses.list(), []); } finally { database.close(); }
});

test("import transaction rolls back an unexpected write failure", () => {
  const { database, expenses, portability } = setup();
  try { const csv = `amountCents,description,category,date,tags,splits\r\n100,First,Food,${stamp},,\r\n200,Second,Food,${stamp},,\r\n`; let calls = 0; assert.throws(() => portability.import(csv, item => { const saved = expenses.create(item); calls += 1; if (calls === 2) throw new Error("simulated failure"); return saved; })); assert.deepEqual(expenses.list(), []); } finally { database.close(); }
});

test("rule order is deterministic and metadata persists for a single backward-compatible expense", () => {
  const { database, expenses, portability } = setup();
  try { const first = portability.createRule({ matchType: "description", pattern: "market", category: "Food" }); portability.createRule({ matchType: "description", pattern: "market", category: "Shopping" }); assert.equal(applyRule(portability.listRules(), "Night market"), "Food"); portability.reorderRules(portability.listRules().map(rule => rule.id).reverse()); assert.equal(applyRule(portability.listRules(), "Night market"), "Shopping"); const expense = expenses.create({ amountCents: 1000, description: "Market", category: "Food", date: stamp, tags: ["weekly", "food"], splits: [{ category: "Food", amountCents: 700 }, { category: "Shopping", amountCents: 300 }] }); assert.equal(expenses.list()[0].id, expense.id); const csv = portability.exportCsv([expense]); assert.match(csv, /weekly\|food|food\|weekly/); assert.match(csv, /Food:700\|Shopping:300/); assert.equal(first.position, 0); } finally { database.close(); }
});
