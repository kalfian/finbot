import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

const SESSION_DAYS = 7;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;
export const SESSION_COOKIE = "ledger_session";

type Account = { password_hash: string };
export type Session = { id: string; csrf_token: string; expires_at: string };
const now = () => new Date();
const token = () => randomBytes(32).toString("base64url");

function hash(value: string, salt = randomBytes(16).toString("base64url")): string {
  return `${salt}:${scryptSync(value, salt, 64).toString("base64url")}`;
}
function matches(value: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = Buffer.from(scryptSync(value, salt, 64).toString("base64url"));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
function sessionSecret(): string | undefined {
  const value = process.env.FINANCIAL_TRACKER_SESSION_SECRET;
  return value && value.length >= 32 ? value : undefined;
}
function signature(id: string): string | undefined {
  const secret = sessionSecret();
  return secret && createHmac("sha256", secret).update(`ledger-session:v1:${id}`).digest("base64url");
}
/** The session id never leaves the server without an HMAC made from a runtime secret. */
export function signedSessionValue(id: string): string | undefined {
  const signed = signature(id);
  return signed ? `${id}.${signed}` : undefined;
}
export function sessionIdFromCookie(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return undefined;
  const id = value.slice(0, separator);
  const supplied = value.slice(separator + 1);
  const expected = signature(id);
  if (!expected) return undefined;
  const actualBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes) ? id : undefined;
}
export function passwordValid(value: unknown): value is string { return typeof value === "string" && value.length >= 8 && value.length <= 256; }
export function authConfigured(database: Database.Database): boolean {
  void database;
  return Boolean(sessionSecret());
}
export function accountExists(database: Database.Database): boolean {
  return Boolean(database.prepare("SELECT 1 FROM auth_account WHERE id = 1").get());
}
function createSession(database: Database.Database): Session {
  const created = now();
  const createdAt = created.toISOString();
  const session: Session = { id: token(), csrf_token: token(), expires_at: new Date(created.getTime() + SESSION_DAYS * 864e5).toISOString() };
  database.prepare("INSERT INTO auth_sessions (id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?)").run(session.id, session.csrf_token, session.expires_at, createdAt);
  return session;
}
export function createInitialAccount(database: Database.Database, password: unknown, confirmation: unknown): Session | undefined {
  if (!sessionSecret() || !passwordValid(password) || password !== confirmation) return undefined;
  try {
    return database.transaction(() => {
      const stamp = now().toISOString();
      // The single-row primary-key constraint makes competing setup requests fail as one unit.
      database.prepare("INSERT INTO auth_account (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)").run(hash(password), stamp, stamp);
      return createSession(database);
    })();
  } catch {
    return undefined;
  }
}
export function login(database: Database.Database, password: unknown, scope: string): { session?: Session } {
  if (!sessionSecret()) return {};
  const record = database.prepare("SELECT attempts, locked_until FROM auth_throttle WHERE scope = ?").get(scope) as { attempts: number; locked_until: string | null } | undefined;
  if (record?.locked_until && new Date(record.locked_until) > now()) return {};
  const account = database.prepare("SELECT password_hash FROM auth_account WHERE id = 1").get() as Account | undefined;
  const valid = Boolean(account && matches(String(password ?? ""), account.password_hash));
  if (!valid) {
    const attempts = (record?.attempts ?? 0) + 1;
    database.prepare("INSERT INTO auth_throttle (scope, attempts, locked_until, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope) DO UPDATE SET attempts=excluded.attempts, locked_until=excluded.locked_until, updated_at=excluded.updated_at").run(scope, attempts, attempts >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS).toISOString() : null, now().toISOString());
    return {};
  }
  database.prepare("DELETE FROM auth_throttle WHERE scope = ?").run(scope);
  return { session: createSession(database) };
}
export function session(database: Database.Database, id: string | undefined): Session | undefined {
  if (!id) return undefined;
  const result = database.prepare("SELECT id, csrf_token, expires_at FROM auth_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?").get(id, now().toISOString()) as Session | undefined;
  return result;
}
export function revoke(database: Database.Database, id?: string): void { if (id) database.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(now().toISOString(), id); }
export function changePassword(database: Database.Database, current: unknown, next: unknown): boolean {
  const account = database.prepare("SELECT password_hash FROM auth_account WHERE id = 1").get() as Account | undefined;
  if (!account || !passwordValid(next) || !matches(String(current ?? ""), account.password_hash)) return false;
  const stamp = now().toISOString();
  database.prepare("UPDATE auth_account SET password_hash = ?, updated_at = ? WHERE id = 1").run(hash(next), stamp);
  database.prepare("UPDATE auth_sessions SET revoked_at = ?").run(stamp);
  return true;
}
