import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";
import { createSessionRepository, type AuthUser } from "./auth";

type TokenRow = { id: number; label: string; created_at: string };

export type TokenInfo = { id: number; label: string; createdAt: string };

export function createTokenRepository(database: Database.Database, userId: number) {
  const list = database.prepare("SELECT id, label, created_at FROM api_tokens WHERE user_id = ? ORDER BY id DESC");
  const insert = database.prepare("INSERT INTO api_tokens (user_id, label, token_hash, created_at) VALUES (?, ?, ?, ?)");
  const remove = database.prepare("DELETE FROM api_tokens WHERE id = ? AND user_id = ?");
  return {
    list(): TokenInfo[] {
      return (list.all(userId) as TokenRow[]).map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at }));
    },
    create(label: string) {
      const token = `et_${randomBytes(32).toString("hex")}`;
      const result = insert.run(userId, label, createHash("sha256").update(token).digest("hex"), new Date().toISOString());
      return { id: Number(result.lastInsertRowid), label, token };
    },
    revoke(id: number): boolean {
      return remove.run(id, userId).changes > 0;
    },
  };
}

export function authenticateBearer(request: Request, database: Database.Database): AuthUser | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (token.split(".").length === 3) return createSessionRepository(database).verify(token);
  if (!/^et_[a-f0-9]{64}$/.test(token)) return null;
  const hash = createHash("sha256").update(token).digest();
  const row = database.prepare(`
    SELECT api_tokens.token_hash, users.id, users.username, users.role, users.must_change_password, users.created_at
    FROM api_tokens JOIN users ON users.id = api_tokens.user_id
    WHERE api_tokens.token_hash = ?
  `).get(hash.toString("hex")) as ({ token_hash: string; id: number; username: string; role: "admin" | "user";
    must_change_password: number; created_at: string }) | undefined;
  if (!row || !timingSafeEqual(hash, Buffer.from(row.token_hash, "hex"))) return null;
  return { id: row.id, username: row.username, role: row.role,
    mustChangePassword: !!row.must_change_password, createdAt: row.created_at };
}

export function requireToken(
  request: Request,
  database: Database.Database,
  options: { allowPasswordChange?: boolean } = {},
): { user: AuthUser } | { response: Response } {
  const user = authenticateBearer(request, database);
  if (user?.mustChangePassword && !options.allowPasswordChange) {
    return { response: Response.json({ error: "Password change required.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 }) };
  }
  return user
    ? { user }
    : { response: Response.json({ error: "A valid JWT or generated Bearer token is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } }) };
}
