import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { handleExpenseMcp } from "../lib/expense-mcp";

test("MCP initializes, lists tools, creates records, and returns filtered summary", async () => {
  const database = new Database(":memory:");
  initializeDatabase(database);
  let id = 0;
  async function call(method: string, params: unknown) {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const response = await handleExpenseMcp(request, database);
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.result.serverInfo.name, "expense-tracker");
    const tools = await call("tools/list", {});
    assert.deepEqual(tools.result.tools.map((item: { name: string }) => item.name).sort(), ["budget_status", "create_expense", "expense_summary", "export_report_pdf", "list_expenses", "set_monthly_limit"]);
    const limit = await call("tools/call", { name: "set_monthly_limit", arguments: { monthlyLimitCents: 2_000_000_00 } });
    assert.equal(JSON.parse(limit.result.content[0].text).monthlyLimitCents, 2_000_000_00);
    const input = { amountCents: 150000, description: "Train", category: "Transport", date: "2026-09-24T16:00:00.000Z", sourceId: "test:mcp:1" };
    const created = await call("tools/call", { name: "create_expense", arguments: input });
    assert.equal(JSON.parse(created.result.content[0].text).expense.description, "Train");
    assert.equal(JSON.parse(created.result.content[0].text).budget.monthCents, 150000);
    const replay = await call("tools/call", { name: "create_expense", arguments: input });
    assert.equal(JSON.parse(replay.result.content[0].text).replayed, true);
    const conflict = await call("tools/call", { name: "create_expense", arguments: { ...input, amountCents: 200000 } });
    assert.equal(conflict.result.isError, true);
    const status = await call("tools/call", { name: "budget_status", arguments: { date: "2026-09-24" } });
    assert.equal(JSON.parse(status.result.content[0].text).todayCents, 150000);
    const listed = await call("tools/call", { name: "list_expenses", arguments: { query: "transport", from: "2026-09-24", to: "2026-09-24" } });
    assert.equal(JSON.parse(listed.result.content[0].text).expenses.length, 1);
    const summary = await call("tools/call", { name: "expense_summary", arguments: {} });
    assert.equal(JSON.parse(summary.result.content[0].text).totalCents, 150000);
    const report = await call("tools/call", { name: "export_report_pdf", arguments: { query: "train" } });
    assert.equal(report.result.content[0].resource.mimeType, "application/pdf");
    assert.equal(Buffer.from(report.result.content[0].resource.blob, "base64").subarray(0, 5).toString(), "%PDF-");
  } finally {
    database.close();
  }
});
