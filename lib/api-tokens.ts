import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

type TokenRow = { id: number; label: string; created_at: string };

export type TokenInfo = { id: number; label: string; createdAt: string };

export function createTokenRepository(database: Database.Database) {
  const list = database.prepare("SELECT id, label, created_at FROM api_tokens ORDER BY id DESC");
  const insert = database.prepare("INSERT INTO api_tokens (label, token_hash, created_at) VALUES (?, ?, ?)");
  const lookup = database.prepare("SELECT token_hash FROM api_tokens WHERE token_hash = ?");
  const remove = database.prepare("DELETE FROM api_tokens WHERE id = ?");
  return {
    list(): TokenInfo[] {
      return (list.all() as TokenRow[]).map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at }));
    },
    create(label: string) {
      const token = `et_${randomBytes(32).toString("hex")}`;
      const result = insert.run(label, createHash("sha256").update(token).digest("hex"), new Date().toISOString());
      return { id: Number(result.lastInsertRowid), label, token };
    },
    verify(token: string): boolean {
      if (!/^et_[a-f0-9]{64}$/.test(token)) return false;
      const hash = createHash("sha256").update(token).digest();
      const row = lookup.get(hash.toString("hex")) as { token_hash: string } | undefined;
      return !!row && timingSafeEqual(hash, Buffer.from(row.token_hash, "hex"));
    },
    revoke(id: number): boolean {
      return remove.run(id).changes > 0;
    },
  };
}

export function authenticateBearer(request: Request, tokens: ReturnType<typeof createTokenRepository>): boolean {
  const header = request.headers.get("authorization");
  return !!header && /^Bearer et_[a-f0-9]{64}$/.test(header) && tokens.verify(header.slice(7));
}

export function requireToken(request: Request, database: Database.Database): Response | null {
  return authenticateBearer(request, createTokenRepository(database))
    ? null
    : Response.json({ error: "A valid Bearer token is required." }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
}

export function requireLocalOwner(request: Request): Response | null {
  const host = new URL(request.url).hostname;
  const origin = request.headers.get("origin");
  let sameOrigin = true;
  if (origin) {
    try { sameOrigin = new URL(origin).origin === new URL(request.url).origin; }
    catch { sameOrigin = false; }
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)
    || !sameOrigin) {
    return Response.json({ error: "Local, same-origin access only." }, { status: 403 });
  }
  return null;
}
