import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3341";
const pdfPath = process.env.TEST_PDF_PATH;
assert.ok(pdfPath, "Set TEST_PDF_PATH to a temporary PDF path.");

const issuedResponse = await fetch(`${base}/api/tokens`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ label: "Temporary smoke test" }),
});
assert.equal(issuedResponse.status, 201);
const issued = await issuedResponse.json();
const authorization = { Authorization: `Bearer ${issued.token}` };
const anonymous = await fetch(`${base}/api/v1/expenses`);
assert.equal(anonymous.status, 401);
const anonymousMcp = await fetch(`${base}/mcp`, { method: "POST" });
assert.equal(anonymousMcp.status, 401);

try {
  for (let index = 0; index < 42; index += 1) {
    const response = await fetch(`${base}/api/v1/expenses`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: (index + 1) * 10000,
        description: `Transport receipt ${index + 1}`,
        category: "Transport",
        date: `2026-09-24T${String(index % 17).padStart(2, "0")}:00:00.000Z`,
      }),
    });
    assert.equal(response.status, 201);
  }
  const listed = await fetch(`${base}/api/v1/expenses?q=transport&from=2026-09-24&to=2026-09-24`, { headers: authorization });
  assert.equal(listed.status, 200);
  const { expenses } = await listed.json();
  assert.equal(expenses.length, 42);
  const pdfResponse = await fetch(`${base}/api/reports/pdf?q=transport&from=2026-09-24&to=2026-09-24`);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get("content-type"), /application\/pdf/);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  await writeFile(pdfPath, pdf);
  const mcp = await fetch(`${base}/mcp`, {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.tools.length, 4);
  console.log(JSON.stringify({ listed: expenses.length, pdfBytes: pdf.length, mcp: "authenticated" }));
} finally {
  const revoked = await fetch(`${base}/api/tokens`, {
    method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: issued.id }),
  });
  assert.equal(revoked.status, 200);
  assert.equal((await fetch(`${base}/api/v1/expenses`, { headers: authorization })).status, 401);
}
