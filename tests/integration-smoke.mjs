import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3341";
const pdfPath = process.env.TEST_PDF_PATH;
assert.ok(pdfPath, "Set TEST_PDF_PATH to a temporary PDF path.");

function cookieOf(response) {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";", 1)[0];
}

async function login(username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return cookieOf(response);
}

async function changePassword(cookie, currentPassword, newPassword) {
  const response = await fetch(`${base}/api/auth/password`, {
    method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  assert.equal(response.status, 200);
  return cookieOf(response);
}

const temporaryAdminCookie = await login("admin", "123456");
assert.equal((await fetch(`${base}/api/expenses`, { headers: { Cookie: temporaryAdminCookie } })).status, 403);
const adminCookie = await changePassword(temporaryAdminCookie, "123456", "smoke-admin-123");

const issuedResponse = await fetch(`${base}/api/tokens`, {
  method: "POST", headers: { Cookie: adminCookie, "Content-Type": "application/json" },
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
  const pdfResponse = await fetch(`${base}/api/reports/pdf?q=transport&from=2026-09-24&to=2026-09-24`, { headers: { Cookie: adminCookie } });
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
  assert.equal((await mcp.json()).result.tools.length, 9);

  const deleted = await fetch(`${base}/api/expenses/${expenses[0].id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
  assert.equal(deleted.status, 200);
  const afterDelete = await fetch(`${base}/api/v1/expenses`, { headers: authorization });
  assert.equal((await afterDelete.json()).expenses.length, 41);

  const createdUser = await fetch(`${base}/api/users`, {
    method: "POST", headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ username: "smoke-user", password: "temporary123" }),
  });
  assert.equal(createdUser.status, 201);
  const temporaryUserCookie = await login("smoke-user", "temporary123");
  const userCookie = await changePassword(temporaryUserCookie, "temporary123", "smoke-user-123");
  const userLedger = await fetch(`${base}/api/expenses`, { headers: { Cookie: userCookie } });
  assert.equal(userLedger.status, 200);
  assert.deepEqual((await userLedger.json()).expenses, []);
  console.log(JSON.stringify({ listed: expenses.length, pdfBytes: pdf.length, mcp: "authenticated", userIsolation: "verified" }));
} finally {
  const revoked = await fetch(`${base}/api/tokens`, {
    method: "DELETE", headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ id: issued.id }),
  });
  assert.equal(revoked.status, 200);
  assert.equal((await fetch(`${base}/api/v1/expenses`, { headers: authorization })).status, 401);
}
