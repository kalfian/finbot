import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeDatabase } from "../lib/database";
import { handleExpenseMcp } from "../lib/expense-mcp";
import { createUserRepository } from "../lib/auth";

test("MCP initializes, lists tools, creates records, and returns filtered summary", async () => {
  const database = new Database(":memory:");
  const proofDirectory = mkdtempSync(join(tmpdir(), "mcp-proofs-"));
  initializeDatabase(database);
  let id = 0;
  async function call(method: string, params: unknown) {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    const response = await handleExpenseMcp(request, database, 1, proofDirectory);
    assert.equal(response.status, 200);
    return response.json();
  }
  try {
    const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(init.result.serverInfo.name, "expense-tracker");
    const tools = await call("tools/list", {});
    assert.deepEqual(tools.result.tools.map((item: { name: string }) => item.name).sort(), ["attach_expense_proof", "budget_status", "create_expense", "expense_summary", "export_report_pdf", "get_expense_proof", "list_expense_proofs", "list_expenses", "set_monthly_limit"]);
    const limit = await call("tools/call", { name: "set_monthly_limit", arguments: { monthlyLimitCents: 2_000_000_00 } });
    assert.equal(JSON.parse(limit.result.content[0].text).monthlyLimitCents, 2_000_000_00);
    const input = { amountCents: 150000, description: "Train", category: "Transport", date: "2026-09-24T16:00:00.000Z", sourceId: "test:mcp:1" };
    const created = await call("tools/call", { name: "create_expense", arguments: input });
    assert.equal(JSON.parse(created.result.content[0].text).expense.description, "Train");
    assert.equal(JSON.parse(created.result.content[0].text).budget.monthCents, 150000);
    const replay = await call("tools/call", { name: "create_expense", arguments: input });
    assert.equal(JSON.parse(replay.result.content[0].text).replayed, true);
    const expenseId = JSON.parse(created.result.content[0].text).expense.id;
    const proofInput = { expenseId, filename: "receipt.png", mimeType: "image/png",
      base64: Buffer.from("89504e470d0a1a0a00000000", "hex").toString("base64"), sourceId: "chat:1:photo:1" };
    const attached = await call("tools/call", { name: "attach_expense_proof", arguments: proofInput });
    const proof = JSON.parse(attached.result.content[0].text).proof;
    assert.equal(proof.mimeType, "image/png");
    const attachedReplay = await call("tools/call", { name: "attach_expense_proof", arguments: proofInput });
    assert.equal(JSON.parse(attachedReplay.result.content[0].text).replayed, true);
    const listedProofs = await call("tools/call", { name: "list_expense_proofs", arguments: { expenseId } });
    assert.equal(JSON.parse(listedProofs.result.content[0].text).proofs.length, 1);
    const fetchedProof = await call("tools/call", { name: "get_expense_proof", arguments: { expenseId, proofId: proof.id } });
    assert.equal(fetchedProof.result.content[0].resource.blob, proofInput.base64);
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
    rmSync(proofDirectory, { recursive: true, force: true });
  }
});

test("MCP reads and writes only the authenticated user's ledger", async () => {
  const database = new Database(":memory:");
  initializeDatabase(database);
  const user = createUserRepository(database).create("mcp-user", "temporary123");
  let id = 0;
  async function call(userId: number, name: string, args: unknown) {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
    });
    return (await handleExpenseMcp(request, database, userId)).json();
  }
  try {
    const input = { amountCents: 1000, description: "Shared source", category: "Other", date: "2026-09-24T16:00:00.000Z", sourceId: "agent:shared" };
    await call(1, "create_expense", input);
    await call(user.id, "create_expense", { ...input, amountCents: 2000 });
    const adminList = await call(1, "list_expenses", {});
    const userList = await call(user.id, "list_expenses", {});
    assert.deepEqual(JSON.parse(adminList.result.content[0].text).expenses.map((expense: { amountCents: number }) => expense.amountCents), [1000]);
    assert.deepEqual(JSON.parse(userList.result.content[0].text).expenses.map((expense: { amountCents: number }) => expense.amountCents), [2000]);
  } finally {
    database.close();
  }
});
