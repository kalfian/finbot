import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";

import {
  createSessionRepository,
  createUserRepository,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
  hashPassword,
  requireSameOrigin,
  sessionCookie,
  verifyPassword,
} from "../lib/auth";
import { initializeDatabase } from "../lib/database";

test("database bootstraps a forced-change admin and password hashes are salted", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const users = createUserRepository(database);
    const admin = users.authenticate(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
    assert.equal(admin?.role, "admin");
    assert.equal(admin?.mustChangePassword, true);
    const first = hashPassword("secret123");
    const second = hashPassword("secret123");
    assert.notEqual(first, second);
    assert.equal(verifyPassword("secret123", first), true);
    assert.equal(verifyPassword("wrong123", first), false);
  } finally {
    database.close();
  }
});

test("admin creates users and password changes revoke forced-change state", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const users = createUserRepository(database);
    const user = users.create("kukuh", "temporary123");
    assert.equal(user.role, "user");
    assert.equal(user.mustChangePassword, true);
    assert.throws(() => users.create("KUKUH", "another123"), /already in use/);
    assert.throws(() => users.changePassword(user.id, "wrong", "newsecure123"), /incorrect/);
    assert.equal(users.changePassword(user.id, "temporary123", "newsecure123").mustChangePassword, false);
    assert.equal(users.authenticate("kukuh", "temporary123"), null);
    assert.equal(users.authenticate("kukuh", "newsecure123")?.id, user.id);
  } finally {
    database.close();
  }
});

test("login sessions use signed JWTs, store only hashes, and can be revoked", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const admin = createUserRepository(database).authenticate(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD)!;
    const sessions = createSessionRepository(database);
    const issued = sessions.create(admin.id);
    assert.equal(issued.token.split(".").length, 3);
    assert.equal(sessions.verify(issued.token)?.id, admin.id);
    assert.equal(sessions.verify(`${issued.token.slice(0, -1)}x`), null);
    assert.equal(JSON.stringify(database.prepare("SELECT * FROM sessions").all()).includes(issued.token), false);
    assert.match(sessionCookie(issued.token, issued.expiresAt, false), /HttpOnly; SameSite=Lax/);
    sessions.revoke(issued.token);
    assert.equal(sessions.verify(issued.token), null);
  } finally {
    database.close();
  }
});

test("five failed logins temporarily lock an account", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const users = createUserRepository(database);
    for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(users.authenticate("admin", "wrong"), null);
    assert.equal(users.authenticate("admin", DEFAULT_ADMIN_PASSWORD), null);
    database.prepare("UPDATE users SET locked_until = NULL").run();
    assert.equal(users.authenticate("admin", DEFAULT_ADMIN_PASSWORD)?.id, 1);
  } finally {
    database.close();
  }
});

test("same-origin guard permits matching same-site requests and rejects cross-site writes", () => {
  assert.equal(requireSameOrigin(new Request("http://127.0.0.1:3000/api", {
    headers: { origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-site" },
  })), null);
  assert.equal(requireSameOrigin(new Request("http://127.0.0.1:3000/api", {
    headers: { origin: "http://attacker.example", "sec-fetch-site": "cross-site" },
  }))?.status, 403);
  assert.equal(requireSameOrigin(new Request("http://127.0.0.1:3000/api", {
    headers: { "sec-fetch-site": "same-site" },
  }))?.status, 403);
});
