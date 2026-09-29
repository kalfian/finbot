import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createTokenRepository, authenticateBearer, requireToken } from "../lib/api-tokens";
import { createUserRepository } from "../lib/auth";

test("tokens are only returned at creation and revocation takes effect immediately", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const tokens = createTokenRepository(database, 1);
    const issued = tokens.create("My automation");
    assert.match(issued.token, /^et_[a-f0-9]{64}$/);
    assert.equal(tokens.list()[0].label, "My automation");
    assert.equal(JSON.stringify(tokens.list()).includes(issued.token), false);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}` } }), database)?.id, 1);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}x` } }), database), null);
    assert.equal(authenticateBearer(new Request("http://localhost"), database), null);
    assert.equal(tokens.revoke(issued.id), true);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}` } }), database), null);
  } finally {
    database.close();
  }
});

test("tokens belong to their issuing user", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("second-user", "temporary123");
    const adminTokens = createTokenRepository(database, 1);
    const userTokens = createTokenRepository(database, user.id);
    const adminToken = adminTokens.create("Admin automation");
    const userToken = userTokens.create("User automation");
    assert.equal(adminTokens.list().length, 1);
    assert.equal(userTokens.list().length, 1);
    assert.equal(userTokens.revoke(adminToken.id), false);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${userToken.token}` } }), database)?.id, user.id);
  } finally {
    database.close();
  }
});

test("integration tokens cannot bypass a required password change", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const issued = createTokenRepository(database, 1).create("Legacy automation");
    const request = new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}` } });
    const blocked = requireToken(request, database);
    assert.equal("response" in blocked ? blocked.response.status : 200, 403);
    createUserRepository(database).changePassword(1, "123456", "adminsecure123");
    const allowed = requireToken(request, database);
    assert.equal("user" in allowed ? allowed.user.id : null, 1);
  } finally {
    database.close();
  }
});
