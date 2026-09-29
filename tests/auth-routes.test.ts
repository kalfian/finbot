import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import Module from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SESSION_COOKIE } from "../lib/auth";

function cookieOf(response: Response): string {
  const value = response.headers.get("set-cookie");
  assert.ok(value);
  return value.split(";", 1)[0];
}

test("auth routes enforce first-login password change, roles, rotation, logout, and same-origin writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "finbot-auth-routes-"));
  const originalDatabasePath = process.env.DATABASE_PATH;
  const moduleWithResolver = Module as unknown as {
    _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
  };
  const originalResolveFilename = moduleWithResolver._resolveFilename;
  process.env.DATABASE_PATH = join(directory, "auth.db");
  moduleWithResolver._resolveFilename = (request, parent, isMain, options) => request === "server-only"
    ? join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js")
    : originalResolveFilename(request, parent, isMain, options);

  try {
    const loginRoute = await import("../app/api/auth/login/route");
    const passwordRoute = await import("../app/api/auth/password/route");
    const logoutRoute = await import("../app/api/auth/logout/route");
    const usersRoute = await import("../app/api/users/route");
    const expensesRoute = await import("../app/api/v1/expenses/route");

    const denied = await loginRoute.POST(new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "123456" }),
    }));
    assert.equal(denied.status, 403);

    const login = await loginRoute.POST(new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "123456" }),
    }));
    assert.equal(login.status, 200);
    const temporaryCookie = cookieOf(login);
    const temporaryLogin = await login.json();
    assert.equal(temporaryLogin.accessToken.split(".").length, 3);
    assert.match(temporaryCookie, new RegExp(`^${SESSION_COOKIE}=`));
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { cookie: temporaryCookie } })).status, 403);

    const changed = await passwordRoute.PUT(new Request("http://localhost/api/auth/password", {
      method: "PUT", headers: { authorization: `Bearer ${temporaryLogin.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "123456", newPassword: "adminsecure123" }),
    }));
    assert.equal(changed.status, 200);
    const adminCookie = cookieOf(changed);
    const changedBody = await changed.json();
    assert.notEqual(adminCookie, temporaryCookie);
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { cookie: temporaryCookie } })).status, 401);
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { authorization: `Bearer ${temporaryLogin.accessToken}` } })).status, 401);
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { cookie: adminCookie } })).status, 200);
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { authorization: `Bearer ${changedBody.accessToken}` } })).status, 200);

    const created = await usersRoute.POST(new Request("http://localhost/api/users", {
      method: "POST", headers: { cookie: adminCookie, origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ username: "standard-user", password: "temporary123" }),
    }));
    assert.equal(created.status, 201);
    assert.equal((await created.json()).user.role, "user");

    const userLogin = await loginRoute.POST(new Request("http://localhost/api/auth/login", {
      method: "POST", headers: { origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ username: "standard-user", password: "temporary123" }),
    }));
    const userTemporaryCookie = cookieOf(userLogin);
    const userChanged = await passwordRoute.PUT(new Request("http://localhost/api/auth/password", {
      method: "PUT", headers: { cookie: userTemporaryCookie, origin: "http://localhost", "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "temporary123", newPassword: "usersecure123" }),
    }));
    const userCookie = cookieOf(userChanged);
    assert.equal(usersRoute.GET(new Request("http://localhost/api/users", { headers: { cookie: userCookie } })).status, 403);

    const logout = logoutRoute.POST(new Request("http://localhost/api/auth/logout", {
      method: "POST", headers: { cookie: adminCookie, host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
    }));
    assert.equal(logout.status, 303);
    assert.equal(logout.headers.get("location"), "http://127.0.0.1:3000/login");
    assert.match(logout.headers.get("set-cookie") ?? "", /Max-Age=0/);
    assert.equal(expensesRoute.GET(new Request("http://localhost/api/v1/expenses", { headers: { cookie: adminCookie } })).status, 401);
  } finally {
    moduleWithResolver._resolveFilename = originalResolveFilename;
    if (originalDatabasePath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabasePath;
    rmSync(directory, { recursive: true, force: true });
  }
});
