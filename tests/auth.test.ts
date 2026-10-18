import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { accountExists, authConfigured, changePassword, createInitialAccount, login, session, sessionIdFromCookie, signedSessionValue } from "../lib/auth";
import { authorizeRequest, requestIsSecure, validRequestOrigin } from "../lib/auth-request";

const originalEnvironment = { secret: process.env.FINANCIAL_TRACKER_SESSION_SECRET };
function configure() { process.env.FINANCIAL_TRACKER_SESSION_SECRET = randomBytes(32).toString("base64url"); }
function database() { const value = new Database(":memory:"); initializeDatabase(value); return value; }
function restoreEnvironment() { if (originalEnvironment.secret === undefined) delete process.env.FINANCIAL_TRACKER_SESSION_SECRET; else process.env.FINANCIAL_TRACKER_SESSION_SECRET = originalEnvironment.secret; }

test("a valid session secret enables first-run setup without a bootstrap password", () => {
  const value = database(); configure(); assert.equal(authConfigured(value), true); assert.equal(accountExists(value), false);
  delete process.env.FINANCIAL_TRACKER_SESSION_SECRET; assert.equal(authConfigured(value), false); restoreEnvironment();
});
test("first-run setup stores only a salted verifier and creates a session", () => {
  const value = database(); const password = randomBytes(18).toString("base64url"); configure();
  const active = createInitialAccount(value, password, password); assert.ok(active);
  const stored = value.prepare("SELECT password_hash FROM auth_account WHERE id = 1").get() as { password_hash: string }; assert.notEqual(stored.password_hash, password); assert.equal(stored.password_hash.includes(password), false); assert.ok(session(value, active?.id));
  assert.ok(login(value, password, "replacement").session); restoreEnvironment();
});
test("first-run setup requires matching passwords that meet the minimum policy", () => {
  const value = database(); configure();
  assert.equal(createInitialAccount(value, "1234567", "1234567"), undefined);
  assert.equal(accountExists(value), false); restoreEnvironment();

  const eightCharacter = database(); configure();
  assert.ok(createInitialAccount(eightCharacter, "12345678", "12345678"));
  assert.equal(accountExists(eightCharacter), true); restoreEnvironment();

  const mismatch = database(); configure();
  assert.equal(createInitialAccount(mismatch, randomBytes(18).toString("base64url"), randomBytes(18).toString("base64url")), undefined);
  assert.equal(accountExists(mismatch), false); restoreEnvironment();
});
test("competing first-run setup requests create one account and one session", () => {
  const value = database(); const firstPassword = randomBytes(18).toString("base64url"); const secondPassword = randomBytes(18).toString("base64url"); configure();
  const first = createInitialAccount(value, firstPassword, firstPassword); const second = createInitialAccount(value, secondPassword, secondPassword);
  const accounts = value.prepare("SELECT COUNT(*) AS count FROM auth_account").get() as { count: number };
  const sessions = value.prepare("SELECT COUNT(*) AS count FROM auth_sessions").get() as { count: number };
  assert.ok(first); assert.equal(second, undefined); assert.equal(accounts.count, 1); assert.equal(sessions.count, 1); assert.ok(login(value, firstPassword, "first").session); assert.equal(login(value, secondPassword, "second").session, undefined); restoreEnvironment();
});
test("signed session values verify and reject tampering", () => {
  configure(); const id = randomBytes(24).toString("base64url"); const signed = signedSessionValue(id); assert.ok(signed); assert.equal(sessionIdFromCookie(signed), id); assert.equal(sessionIdFromCookie(`${signed}x`), undefined); assert.equal(sessionIdFromCookie(id), undefined); restoreEnvironment();
});
test("invalid login locks the scope and a changed password revokes sessions", () => {
  const value = database(); const replacement = randomBytes(18).toString("base64url"); const changed = randomBytes(18).toString("base64url"); configure(); assert.ok(createInitialAccount(value, replacement, replacement));
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(login(value, "invalid-password", "same-client").session, undefined);
  assert.equal(login(value, replacement, "same-client").session, undefined); assert.ok(login(value, replacement, "new-client").session);
  const active = login(value, replacement, "replacement-client").session; assert.ok(active); assert.equal(changePassword(value, replacement, changed), true); assert.equal(session(value, active?.id), undefined); restoreEnvironment();
});
test("existing APIs require authentication and mutations require a CSRF token", () => {
  const value = database(); const password = randomBytes(18).toString("base64url"); configure(); assert.ok(createInitialAccount(value, password, password)); const active = login(value, password, "api-client").session; assert.ok(active);
  const unauthenticated = authorizeRequest(value, new Request("http://localhost/api/expenses")); assert.equal(unauthenticated?.status, 401);
  const cookie = signedSessionValue(active.id); const mutation = authorizeRequest(value, new Request("http://localhost/api/expenses", { method: "POST", headers: { cookie: `ledger_session=${cookie}`, origin: "http://localhost" } }), true); assert.equal(mutation?.status, 403); restoreEnvironment();
});
test("login origin validation and proxy-aware secure detection reject cross-origin requests", () => {
  const request = new Request("http://internal/api/auth/login", { headers: { host: "internal", "x-forwarded-host": "ledger.example", "x-forwarded-proto": "https", origin: "https://ledger.example" } });
  assert.equal(validRequestOrigin(request), true); assert.equal(requestIsSecure(request), true);
  assert.equal(validRequestOrigin(new Request("http://internal/api/auth/login", { headers: { host: "internal", origin: "https://attacker.example" } })), false);
});
