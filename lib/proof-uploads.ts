import type Database from "better-sqlite3";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assertProofCapacity, ProofError } from "./expense-proofs";
import { MAX_PROOF_BYTES, PROOF_FILE_TYPES } from "./proof-types";

/**
 * Upload links let an agent that holds a local file attach it with plain HTTP (curl) instead of
 * base64 inside an MCP tool call. A link is a stateless HMAC-signed token bound to one user and
 * one expense, valid for 10 minutes. It becomes single-use through proof_upload_tokens: the
 * successful upload inserts the token nonce in the same transaction that records the proof, so a
 * replayed link is rejected. Tokens are never logged or stored; only their random nonce is.
 */
export const PROOF_UPLOAD_TTL_SECONDS = 10 * 60;
export const PROOF_UPLOAD_PATH = "/api/v1/proof-uploads";
const TOKEN_VERSION = "pu1";
const PURPOSE = "proof-upload";

type UploadPayload = { p: typeof PURPOSE; u: number; e: number; n: string; x: number; s?: string };
export type ProofUploadGrant = { userId: number; expenseId: number; nonce: string; expiresAt: number; sourceId?: string };

function nowSeconds(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}

// Reuses the server's existing random signing secret (app_secrets.session_jwt) through a
// purpose-bound HMAC derivation, so an upload token can never verify as a session JWT or vice versa.
function uploadKey(database: Database.Database): Buffer {
  const row = database.prepare("SELECT value FROM app_secrets WHERE name = 'session_jwt'").get() as { value: string } | undefined;
  if (!row) throw new Error("Upload signing secret is unavailable.");
  return createHmac("sha256", row.value).update("finbot:proof-upload-token:v1").digest();
}

function sign(database: Database.Database, body: string): string {
  return createHmac("sha256", uploadKey(database)).update(`${TOKEN_VERSION}.${body}`).digest("base64url");
}

export function createProofUploadToken(
  database: Database.Database,
  userId: number,
  expenseId: number,
  options: { sourceId?: string; now?: Date } = {},
): { token: string; expiresAt: string } {
  const issuedAt = nowSeconds(options.now ?? new Date());
  const payload: UploadPayload = { p: PURPOSE, u: userId, e: expenseId, n: randomBytes(16).toString("base64url"),
    x: issuedAt + PROOF_UPLOAD_TTL_SECONDS };
  if (options.sourceId !== undefined) payload.s = options.sourceId;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${TOKEN_VERSION}.${body}.${sign(database, body)}`, expiresAt: new Date(payload.x * 1000).toISOString() };
}

/** Checks ownership and the proof limit, then issues a link. Throws ProofError (404/409/400). */
export function issueProofUpload(
  database: Database.Database,
  userId: number,
  expenseId: number,
  options: { sourceId?: string; now?: Date; origin?: string } = {},
) {
  assertProofCapacity(database, userId, expenseId, options.sourceId);
  const { token, expiresAt } = createProofUploadToken(database, userId, expenseId, options);
  const uploadUrl = `${options.origin ?? ""}${PROOF_UPLOAD_PATH}/${token}`;
  return {
    uploadUrl,
    method: "POST" as const,
    expiresAt,
    expiresInSeconds: PROOF_UPLOAD_TTL_SECONDS,
    maxBytes: MAX_PROOF_BYTES,
    allowedTypes: [...PROOF_FILE_TYPES],
    fileField: "file",
    singleUse: true,
    authorization: "none (the URL is the credential; do not add a bearer token or share the URL)",
    curl: `curl -sS --fail-with-body -F 'file=@/path/to/receipt.jpg' '${uploadUrl}'`,
    curlRawBody: `curl -sS --fail-with-body -H 'Content-Type: image/jpeg' --data-binary '@/path/to/receipt.jpg' '${uploadUrl}?filename=receipt.jpg'`,
  };
}

/** Verifies signature, expiry and prior use. Throws ProofError: 401 invalid, 410 expired or used. */
export function verifyProofUploadToken(database: Database.Database, token: string, now = new Date()): ProofUploadGrant {
  const invalid = new ProofError("Upload link is invalid.", 401);
  if (token.length > 1024) throw invalid;
  const match = /^pu1\.([A-Za-z0-9_-]{1,800})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) throw invalid;
  const [, body, signature] = match;
  const expected = Buffer.from(sign(database, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalid;
  let payload: Partial<UploadPayload>;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<UploadPayload>; } catch { throw invalid; }
  if (payload.p !== PURPOSE || !Number.isSafeInteger(payload.u) || payload.u! <= 0 || !Number.isSafeInteger(payload.e) || payload.e! <= 0
    || typeof payload.n !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(payload.n) || !Number.isSafeInteger(payload.x)
    || (payload.s !== undefined && typeof payload.s !== "string")) throw invalid;
  if (payload.x! <= nowSeconds(now)) throw new ProofError("Upload link has expired. Call create_proof_upload for a new one.", 410);
  if (database.prepare("SELECT 1 FROM proof_upload_tokens WHERE nonce = ?").get(payload.n)) {
    throw new ProofError("Upload link was already used. Call create_proof_upload for a new one.", 410);
  }
  return { userId: payload.u!, expenseId: payload.e!, nonce: payload.n, expiresAt: payload.x!, sourceId: payload.s };
}

/** Marks the link used; call inside the transaction that records the proof. */
export function claimProofUploadToken(database: Database.Database, grant: ProofUploadGrant, proofId: string, now = new Date()): void {
  database.prepare("DELETE FROM proof_upload_tokens WHERE expires_at < ?").run(new Date(now.getTime() - 60_000).toISOString());
  try {
    database.prepare(`INSERT INTO proof_upload_tokens (nonce, user_id, expense_id, proof_id, expires_at, used_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(grant.nonce, grant.userId, grant.expenseId, proofId,
      new Date(grant.expiresAt * 1000).toISOString(), now.toISOString());
  } catch (error) {
    if (error instanceof Error && "code" in error && String(error.code).startsWith("SQLITE_CONSTRAINT")) {
      throw new ProofError("Upload link was already used. Call create_proof_upload for a new one.", 410);
    }
    throw error;
  }
}

const HOST_PATTERN = /^(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?$/;

/**
 * Origin used to build absolute upload URLs: PUBLIC_BASE_URL when configured, otherwise the
 * request's forwarded/host headers (the caller is already authenticated and receives its own link).
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
    } catch { /* Fall back to request headers. */ }
  }
  const url = new URL(request.url);
  const first = (name: string) => request.headers.get(name)?.split(",")[0].trim() || null;
  const protocol = first("x-forwarded-proto") ?? url.protocol.slice(0, -1);
  const host = first("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  if ((protocol === "http" || protocol === "https") && HOST_PATTERN.test(host)) return `${protocol}://${host}`;
  return url.origin;
}
