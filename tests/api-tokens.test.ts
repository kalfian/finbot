import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createTokenRepository, authenticateBearer } from "../lib/api-tokens";

test("tokens are only returned at creation and revocation takes effect immediately", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const tokens = createTokenRepository(database);
    const issued = tokens.create("My automation");
    assert.match(issued.token, /^et_[a-f0-9]{64}$/);
    assert.equal(tokens.list()[0].label, "My automation");
    assert.equal(JSON.stringify(tokens.list()).includes(issued.token), false);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}` } }), tokens), true);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}x` } }), tokens), false);
    assert.equal(authenticateBearer(new Request("http://localhost"), tokens), false);
    assert.equal(tokens.revoke(issued.id), true);
    assert.equal(authenticateBearer(new Request("http://localhost", { headers: { authorization: `Bearer ${issued.token}` } }), tokens), false);
  } finally {
    database.close();
  }
});
