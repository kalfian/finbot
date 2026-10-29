import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { createTokenRepository } from "../lib/api-tokens";
import { createUserRepository } from "../lib/auth";
import { queryDashboardExpenses } from "../lib/dashboard-expenses";
import { initializeDatabase } from "../lib/database";
import { validateExpense } from "../lib/expense-api";
import { filterReportExpenses } from "../lib/expense-filters";
import { handleExpenseMcp } from "../lib/expense-mcp";
import { buildExpensePdf } from "../lib/expense-report";
import { createExpenseRepository } from "../lib/expenses";
import { createTagRepository, TagConflictError, validateTagList, validateTagName } from "../lib/tags";

const base = { amountCents: 1000, description: "Nasi campur", category: "Food", date: "2026-11-10T05:00:00.000Z" };

test("tag names are normalized and tag lists dedupe case-insensitively", () => {
  assert.equal(validateTagName("  #Liburan   Bali "), "Liburan Bali");
  assert.throws(() => validateTagName("#"), /required/);
  assert.throws(() => validateTagName("a,b"), /commas/);
  assert.throws(() => validateTagName("x".repeat(41)), /at most 40/);
  assert.deepEqual(validateTagList(["Bali", "bali", "#Kantor"]), { value: ["Bali", "Kantor"] });
  assert.deepEqual(validateTagList("Bali"), { error: "tags must be an array of tag names." });
  assert.ok("error" in validateTagList(Array.from({ length: 11 }, (_, index) => `t${index}`)));
  assert.deepEqual(validateExpense({ ...base, tags: ["Bali"] }, ["Food"]), { value: { ...base, tags: ["Bali"] } });
  assert.deepEqual(validateExpense({ ...base, tags: [""] }, ["Food"]), { error: "tags: Tag name is required." });
  assert.equal("tags" in (validateExpense(base, ["Food"]) as { value: object }).value, false);
});

test("expenses carry tags; update keeps omitted tags and replaces given ones; tags stay per user", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const other = createUserRepository(database).create("tag-other", "temporary123");
    const expenses = createExpenseRepository(database, 1);
    const created = expenses.create({ ...base, tags: ["Liburan Bali", "kantor"] });
    assert.deepEqual(created.tags, ["kantor", "Liburan Bali"]);
    const kept = expenses.update(created.id, { ...base, amountCents: 2000 });
    assert.deepEqual(kept?.tags, ["kantor", "Liburan Bali"]);
    const replaced = expenses.update(created.id, { ...base, tags: ["liburan bali"] });
    assert.deepEqual(replaced?.tags, ["Liburan Bali"], "existing spelling is reused");
    assert.deepEqual(expenses.update(created.id, { ...base, tags: [] })?.tags, []);

    createExpenseRepository(database, other.id).create({ ...base, tags: ["Liburan Bali"] });
    assert.equal(createTagRepository(database, other.id).list().length, 1);
    assert.equal(createTagRepository(database, 1).list().length, 2);
    assert.deepEqual(createExpenseRepository(database, other.id).applyTag([created.id], "Hack", "add"), [],
      "another user's expense cannot be tagged");
  } finally {
    database.close();
  }
});

test("tag repository reports usage, renames, rejects duplicates and deletes without deleting expenses", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const expenses = createExpenseRepository(database, 1);
    const tags = createTagRepository(database, 1);
    const a = expenses.create({ ...base, amountCents: 1500, tags: ["Bali"] });
    expenses.create({ ...base, amountCents: 2500, tags: ["Bali"] });
    const empty = tags.create("#Kado");
    assert.deepEqual(tags.list().map(({ name, expenseCount, totalCents }) => [name, expenseCount, totalCents]),
      [["Bali", 2, 4000], ["Kado", 0, 0]]);
    assert.throws(() => tags.create("bali"), TagConflictError);
    const bali = tags.list()[0];
    assert.throws(() => tags.update(bali.id, "KADO"), TagConflictError);
    assert.equal(tags.update(bali.id, "Liburan Bali")?.name, "Liburan Bali");
    assert.deepEqual(expenses.list().map((item) => item.tags), [["Liburan Bali"], ["Liburan Bali"]]);
    assert.equal(tags.update(9999, "x"), null);

    assert.deepEqual(expenses.applyTag([a.id, a.id, 9999], "Kado", "add"), [a.id]);
    assert.equal(tags.list().find((tag) => tag.id === empty.id)?.expenseCount, 1);
    expenses.applyTag([a.id], "Kado", "remove");
    assert.deepEqual(expenses.list().find((item) => item.id === a.id)?.tags, ["Liburan Bali"]);

    assert.equal(tags.delete(bali.id)?.name, "Liburan Bali");
    assert.equal(expenses.list().length, 2);
    assert.deepEqual(expenses.list().map((item) => item.tags), [[], []]);
    expenses.delete(a.id);
    assert.equal((database.prepare("SELECT COUNT(*) AS count FROM expense_tags").get() as { count: number }).count, 0);
  } finally {
    database.close();
  }
});

test("idempotent replay compares tags only when they are supplied", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const expenses = createExpenseRepository(database, 1);
    expenses.record({ ...base, tags: ["Bali"] }, "chat:1");
    assert.equal(expenses.record({ ...base, tags: ["bali"] }, "chat:1").replayed, true);
    assert.equal(expenses.record(base, "chat:1").replayed, true);
    assert.throws(() => expenses.record({ ...base, tags: ["Lombok"] }, "chat:1"), /sourceId/);
  } finally {
    database.close();
  }
});

test("report, dashboard and PDF filters select by tag, untagged and tag text search", async () => {
  const records = [
    { id: 1, amountCents: 100, description: "Hotel", category: "Bills", date: "2026-11-10T05:00:00.000Z", createdAt: "", proofCount: 0, tags: ["Liburan Bali"] },
    { id: 2, amountCents: 200, description: "Listrik", category: "Bills", date: "2026-11-11T05:00:00.000Z", createdAt: "", proofCount: 0, tags: [] },
    { id: 3, amountCents: 300, description: "Tiket", category: "Transport", date: "2026-10-01T05:00:00.000Z", createdAt: "", proofCount: 0, tags: ["liburan bali", "Kantor"] },
  ];
  const ids = (items: Array<{ id: number }>) => items.map((item) => item.id);
  assert.deepEqual(ids(filterReportExpenses(records, { query: "", start: "", end: "", tag: "#LIBURAN BALI" })), [1, 3]);
  assert.deepEqual(ids(filterReportExpenses(records, { query: "", start: "2026-11-01", end: "", untagged: true })), [2]);
  assert.deepEqual(ids(filterReportExpenses(records, { query: "kantor", start: "", end: "" })), [3]);
  assert.deepEqual(ids(filterReportExpenses(records, { query: "", start: "", end: "", tag: "Bali" })), [], "tag filter is exact");
  const dashboard = queryDashboardExpenses(records, new URLSearchParams({ tag: "Liburan Bali" }));
  assert.equal(dashboard.summary.totalCents, 400);
  assert.deepEqual(dashboard.insights.categories.map((item) => item.category), ["Transport", "Bills"]);
  assert.deepEqual(ids(queryDashboardExpenses(records, new URLSearchParams({ untagged: "true" })).expenses), [2]);
  const pdf = await buildExpensePdf(records, { query: "", start: "", end: "", tag: "Liburan Bali" });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("MCP tags expenses, filters and summarizes a trip, and manages tags", async () => {
  const database = new Database(":memory:");
  initializeDatabase(database);
  let id = 0;
  async function tool(name: string, args: unknown) {
    const response = await handleExpenseMcp(new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
    }), database, 1);
    const body = await response.json();
    return { isError: body.result.isError === true, value: JSON.parse(body.result.content[0].text) };
  }
  try {
    const first = await tool("create_expense", { ...base, amountCents: 50000, tags: ["#Liburan Bali"] });
    assert.deepEqual(first.value.expense.tags, ["Liburan Bali"]);
    const second = await tool("create_expense", { ...base, amountCents: 70000, category: "Transport", date: "2026-11-11T05:00:00.000Z" });
    const bill = await tool("create_expense", { ...base, amountCents: 99000, category: "Bills", date: "2026-11-11T06:00:00.000Z" });
    const tagged = await tool("tag_expenses", { tag: "liburan bali", expenseIds: [second.value.expense.id, 424242] });
    assert.deepEqual(tagged.value.updatedExpenseIds, [second.value.expense.id]);
    assert.deepEqual(tagged.value.notFoundExpenseIds, [424242]);

    const summary = await tool("expense_summary", { tag: "Liburan Bali" });
    assert.equal(summary.value.totalCents, 120000);
    assert.deepEqual(Object.keys(summary.value.days), ["2026-11-10", "2026-11-11"]);
    assert.equal(summary.value.categories.Transport.amountCents, 70000);
    const untagged = await tool("list_expenses", { untagged: true });
    assert.deepEqual(untagged.value.expenses.map((item: { id: number }) => item.id), [bill.value.expense.id]);

    const kept = await tool("update_expense", { expenseId: first.value.expense.id, ...base, amountCents: 55000 });
    assert.deepEqual(kept.value.expense.tags, ["Liburan Bali"]);
    const tags = await tool("list_tags", {});
    assert.deepEqual(tags.value.tags.map((tag: { name: string; expenseCount: number }) => [tag.name, tag.expenseCount]), [["Liburan Bali", 2]]);
    const tagId = tags.value.tags[0].id;
    assert.equal((await tool("rename_tag", { tagId, name: "Bali 2026" })).value.tag.name, "Bali 2026");
    assert.equal((await tool("delete_tag", { tagId, confirm: false })).value.code, "DELETE_CONFIRMATION_REQUIRED");
    assert.equal((await tool("delete_tag", { tagId, confirm: true })).value.deleted, true);
    assert.equal((await tool("list_expenses", {})).value.expenses.length, 3);
    assert.equal((await tool("tag_expenses", { tag: "a,b", expenseIds: [1] })).value.code, "INVALID_TAG");
  } finally {
    database.close();
  }
});

test("REST v1 tags endpoints and expense tag filters", async () => {
  const directory = mkdtempSync(join(tmpdir(), "finbot-tags-"));
  const originalDatabasePath = process.env.DATABASE_PATH;
  const moduleWithResolver = Module as unknown as {
    _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  process.env.DATABASE_PATH = join(directory, "tags.db");
  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => request === "server-only"
    ? join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")
    : originalResolveFilename(request, parent, isMain, options);
  const setup = new Database(process.env.DATABASE_PATH);
  try {
    initializeDatabase(setup);
    setup.prepare("UPDATE users SET must_change_password = 0 WHERE id = 1").run();
    const { token } = createTokenRepository(setup, 1).create("tags-test");
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const expensesRoute = await import("../app/api/v1/expenses/route");
    const expenseRoute = await import("../app/api/v1/expenses/[id]/route");
    const tagsRoute = await import("../app/api/v1/tags/route");
    const tagRoute = await import("../app/api/v1/tags/[id]/route");
    const pdfRoute = await import("../app/api/v1/reports/pdf/route");
    const post = (body: unknown) => expensesRoute.POST(new Request("http://localhost/api/v1/expenses", { method: "POST", headers, body: JSON.stringify(body) }));

    const created = await post({ ...base, tags: ["Liburan Bali"] });
    assert.equal(created.status, 201);
    const expense = (await created.json()).expense;
    assert.deepEqual(expense.tags, ["Liburan Bali"]);
    assert.equal((await post({ ...base, tags: "Liburan Bali" })).status, 400);
    await post({ ...base, description: "Listrik", category: "Bills" });

    const filtered = expensesRoute.GET(new Request("http://localhost/api/v1/expenses?tag=liburan%20bali", { headers }));
    assert.deepEqual((await filtered.json()).expenses.map((item: { id: number }) => item.id), [expense.id]);
    const untagged = expensesRoute.GET(new Request("http://localhost/api/v1/expenses?untagged=true", { headers }));
    assert.deepEqual((await untagged.json()).expenses.map((item: { description: string }) => item.description), ["Listrik"]);

    const context = (value: number) => ({ params: Promise.resolve({ id: String(value) }) });
    const patched = await expenseRoute.PATCH(new Request(`http://localhost/api/v1/expenses/${expense.id}`, {
      method: "PATCH", headers, body: JSON.stringify({ ...base, amountCents: 1200 }),
    }), context(expense.id));
    assert.deepEqual((await patched.json()).expense.tags, ["Liburan Bali"], "PATCH without tags keeps them");

    const tagCreated = await tagsRoute.POST(new Request("http://localhost/api/v1/tags", { method: "POST", headers, body: JSON.stringify({ name: "Kado" }) }));
    assert.equal(tagCreated.status, 201);
    assert.equal((await tagsRoute.POST(new Request("http://localhost/api/v1/tags", { method: "POST", headers, body: JSON.stringify({ name: "kado" }) }))).status, 409);
    const listed = (await tagsRoute.GET(new Request("http://localhost/api/v1/tags", { headers })).json()).tags;
    assert.deepEqual(listed.map((tag: { name: string; totalCents: number }) => [tag.name, tag.totalCents]), [["Kado", 0], ["Liburan Bali", 1200]]);
    const bali = listed[1].id;
    const renamed = await tagRoute.PATCH(new Request(`http://localhost/api/v1/tags/${bali}`, { method: "PATCH", headers, body: JSON.stringify({ name: "Bali" }) }), context(bali));
    assert.equal((await renamed.json()).tag.name, "Bali");
    assert.equal((await tagRoute.PATCH(new Request("http://localhost/api/v1/tags/1", { method: "PATCH", headers, body: JSON.stringify({ name: "Kado" }) }), context(bali))).status, 409);
    const pdf = await pdfRoute.GET(new Request("http://localhost/api/v1/reports/pdf?tag=Bali", { headers }));
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(pdf.headers.get("content-disposition") ?? "", /expense-tracker_Bali_all_all\.pdf/);
    assert.equal((await tagRoute.DELETE(new Request(`http://localhost/api/v1/tags/${bali}`, { method: "DELETE", headers }), context(bali))).status, 200);
    assert.equal((await tagRoute.DELETE(new Request(`http://localhost/api/v1/tags/${bali}`, { method: "DELETE", headers }), context(bali))).status, 404);
    assert.equal(tagsRoute.GET(new Request("http://localhost/api/v1/tags")).status, 401);
  } finally {
    setup.close();
    moduleWithResolver._resolveFilename = originalResolveFilename;
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    rmSync(directory, { recursive: true, force: true });
  }
});
