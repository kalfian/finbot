import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type Database from "better-sqlite3";

export const SESSION_COOKIE = "expense_tracker_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_ADMIN_PASSWORD = "123456";

export type UserRole = "admin" | "user";
export type AuthUser = {
  id: number;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: string;
};

type UserRow = {
  id: number;
  username: string;
  role: UserRole;
  password_hash: string;
  must_change_password: number;
  failed_login_count: number;
  locked_until: string | null;
  created_at: string;
};

function toUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    mustChangePassword: !!row.must_change_password,
    createdAt: row.created_at,
  };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [, saltHex, hashHex] = encoded.split("$");
  if (!saltHex || !hashHex || !/^[a-f0-9]+$/.test(saltHex) || !/^[a-f0-9]+$/.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function validateUsername(username: string): string | null {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(username)
    ? null
    : "Username must contain 3-40 letters, numbers, dots, underscores, or hyphens.";
}

export function validateNewPassword(password: string): string | null {
  if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain 8-128 characters with at least one letter and one number.";
  }
  return null;
}

export function createUserRepository(database: Database.Database) {
  const byUsername = database.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE");
  const byId = database.prepare("SELECT * FROM users WHERE id = ?");
  const list = database.prepare("SELECT * FROM users ORDER BY id");
  const insert = database.prepare(`
    INSERT INTO users (username, role, password_hash, must_change_password, created_at)
    VALUES (?, 'user', ?, 1, ?)
  `);
  const failed = database.prepare("UPDATE users SET failed_login_count = ?, locked_until = ? WHERE id = ?");
  const succeeded = database.prepare("UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?");
  const changePassword = database.prepare(`
    UPDATE users SET password_hash = ?, must_change_password = 0, failed_login_count = 0, locked_until = NULL
    WHERE id = ?
  `);

  return {
    findById(id: number): AuthUser | null {
      const row = byId.get(id) as UserRow | undefined;
      return row ? toUser(row) : null;
    },
    list(): AuthUser[] {
      return (list.all() as UserRow[]).map(toUser);
    },
    create(username: string, password: string): AuthUser {
      const normalized = username.trim();
      const usernameError = validateUsername(normalized);
      if (usernameError) throw new Error(usernameError);
      const passwordError = validateNewPassword(password);
      if (passwordError) throw new Error(passwordError);
      try {
        const result = insert.run(normalized, hashPassword(password), new Date().toISOString());
        return toUser(byId.get(result.lastInsertRowid) as UserRow);
      } catch (error) {
        if (error instanceof Error && error.message.includes("UNIQUE")) throw new Error("Username is already in use.");
        throw error;
      }
    },
    authenticate(username: string, password: string): AuthUser | null {
      const row = byUsername.get(username.trim()) as UserRow | undefined;
      if (!row || password.length > 128) return null;
      if (row.locked_until && Date.parse(row.locked_until) > Date.now()) return null;
      if (!verifyPassword(password, row.password_hash)) {
        const failures = row.failed_login_count + 1;
        const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
        failed.run(failures >= 5 ? 0 : failures, lockedUntil, row.id);
        return null;
      }
      succeeded.run(row.id);
      return toUser(row);
    },
    changePassword(id: number, currentPassword: string, newPassword: string): AuthUser {
      const row = byId.get(id) as UserRow | undefined;
      if (!row || !verifyPassword(currentPassword, row.password_hash)) throw new Error("Current password is incorrect.");
      const passwordError = validateNewPassword(newPassword);
      if (passwordError) throw new Error(passwordError);
      if (currentPassword === newPassword) throw new Error("New password must be different from the current password.");
      changePassword.run(hashPassword(newPassword), id);
      return toUser(byId.get(id) as UserRow);
    },
  };
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

type SessionPayload = {
  iss: "expense-tracker";
  aud: "expense-tracker-api";
  sub: string;
  jti: string;
  iat: number;
  exp: number;
};

function jwtSecret(database: Database.Database): string {
  const row = database.prepare("SELECT value FROM app_secrets WHERE name = 'session_jwt'").get() as { value: string } | undefined;
  if (!row) throw new Error("JWT signing secret is unavailable.");
  return row.value;
}

function encodeJwtPart(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(encodedHeader: string, encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest("base64url");
}

function issueSessionJwt(database: Database.Database, userId: number, issuedAt: number): { token: string; expiresAt: Date } {
  const expiresAt = new Date((issuedAt + SESSION_TTL_SECONDS) * 1000);
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
  const payload = encodeJwtPart({
    iss: "expense-tracker",
    aud: "expense-tracker-api",
    sub: String(userId),
    jti: randomBytes(16).toString("base64url"),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  } satisfies SessionPayload);
  return { token: `${header}.${payload}.${signJwt(header, payload, jwtSecret(database))}`, expiresAt };
}

function verifySessionJwt(database: Database.Database, token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = Buffer.from(signJwt(header, payload, jwtSecret(database)));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const decodedHeader = JSON.parse(Buffer.from(header, "base64url").toString()) as Record<string, unknown>;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (decodedHeader.alg !== "HS256" || decodedHeader.typ !== "JWT"
      || decoded.iss !== "expense-tracker" || decoded.aud !== "expense-tracker-api"
      || typeof decoded.sub !== "string" || !/^[1-9]\d*$/.test(decoded.sub)
      || typeof decoded.jti !== "string" || !decoded.jti
      || !Number.isSafeInteger(decoded.iat) || !Number.isSafeInteger(decoded.exp)
      || decoded.exp! <= now || decoded.iat! > now + 60 || decoded.exp! - decoded.iat! !== SESSION_TTL_SECONDS) return null;
    return decoded as SessionPayload;
  } catch {
    return null;
  }
}

export function createSessionRepository(database: Database.Database) {
  const insert = database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)");
  const lookup = database.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const remove = database.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const removeUser = database.prepare("DELETE FROM sessions WHERE user_id = ?");
  const removeExpired = database.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  return {
    create(userId: number): { token: string; expiresAt: Date } {
      const issuedAt = Math.floor(Date.now() / 1000);
      const createdAt = new Date(issuedAt * 1000);
      const { token, expiresAt } = issueSessionJwt(database, userId, issuedAt);
      insert.run(tokenHash(token), userId, expiresAt.toISOString(), createdAt.toISOString());
      return { token, expiresAt };
    },
    verify(token: string): AuthUser | null {
      const payload = verifySessionJwt(database, token);
      if (!payload) return null;
      removeExpired.run(new Date().toISOString());
      const row = lookup.get(tokenHash(token), new Date().toISOString()) as UserRow | undefined;
      return row && String(row.id) === payload.sub ? toUser(row) : null;
    },
    revoke(token: string): void {
      remove.run(tokenHash(token));
    },
    revokeUser(userId: number): void {
      removeUser.run(userId);
    },
  };
}

export function sessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function authenticateSession(request: Request, database: Database.Database): AuthUser | null {
  const token = sessionToken(request);
  return token ? createSessionRepository(database).verify(token) : null;
}

export function requireSession(
  request: Request,
  database: Database.Database,
  options: { allowPasswordChange?: boolean; admin?: boolean } = {},
): { user: AuthUser } | { response: Response } {
  const user = authenticateSession(request, database);
  if (!user) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  if (user.mustChangePassword && !options.allowPasswordChange) {
    return { response: Response.json({ error: "Password change required.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 }) };
  }
  if (options.admin && user.role !== "admin") {
    return { response: Response.json({ error: "Administrator access required." }, { status: 403 }) };
  }
  return { user };
}

export function requireSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (site === "same-site" && !origin)) {
    return Response.json({ error: "Same-origin access required." }, { status: 403 });
  }
  if (!origin) return null;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host") ?? requestUrl.host;
    const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1);
    return new URL(origin).origin === `${protocol}://${host}`
      ? null
      : Response.json({ error: "Same-origin access required." }, { status: 403 });
  } catch {
    return Response.json({ error: "Same-origin access required." }, { status: 403 });
  }
}

export function sessionCookie(token: string, expiresAt: Date, secure = process.env.NODE_ENV === "production"): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure = process.env.NODE_ENV === "production"): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
