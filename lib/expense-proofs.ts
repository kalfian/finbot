import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { databasePath } from "./database";
import { MAX_PROOFS, MAX_PROOF_BYTES, type ExpenseProof } from "./proof-types";

export { MAX_PROOFS, MAX_PROOF_BYTES };

type ProofRow = {
  id: string;
  expense_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  sha256: string;
  kind: string;
  text_content: string | null;
};

export type ProofFile = { id: string; mimeType: string };

export const MAX_PROOF_TEXT_LENGTH = 2000;

export class ProofError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function proofsDirectory(): string {
  return join(dirname(databasePath()), "proofs");
}

function proofExtension(mimeType: string): string | null {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[mimeType] ?? null;
}

export function deleteProofFiles(proofs: ProofFile[], directory = proofsDirectory()): void {
  for (const proof of proofs) {
    // Text and link proofs (text/plain, text/uri-list) have no file on disk.
    const extension = proofExtension(proof.mimeType);
    if (!extension) continue;
    try { rmSync(join(/* turbopackIgnore: true */ directory, `${proof.id}.${extension}`), { force: true }); } catch { /* Orphaned files remain private. */ }
  }
}

function toProof(row: ProofRow): ExpenseProof {
  const proof: ExpenseProof = { id: row.id, expenseId: row.expense_id, kind: row.kind, filename: row.filename,
    mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at };
  if (row.kind !== "file" && row.text_content !== null) proof.textContent = row.text_content;
  return proof;
}

function validSourceId(sourceId: string | undefined): void {
  if (sourceId !== undefined && (!sourceId.trim() || sourceId.length > 200)) {
    throw new ProofError("sourceId must contain 1-200 characters.", 400);
  }
}

function detectType(bytes: Uint8Array): { mimeType: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === "RIFF"
    && Buffer.from(bytes.subarray(8, 12)).toString() === "WEBP") {
    return { mimeType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  return null;
}

function filenameOf(value: string): string {
  return value.replaceAll("\\", "/").split("/").at(-1)?.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 120) || "proof";
}

export function listProofs(database: Database.Database, userId: number, expenseId: number): ExpenseProof[] {
  if (!database.prepare("SELECT id FROM expenses WHERE id = ? AND user_id = ?").get(expenseId, userId)) {
    throw new ProofError("Expense not found.", 404);
  }
  return (database.prepare("SELECT * FROM expense_proofs WHERE expense_id = ? ORDER BY created_at, id")
    .all(expenseId) as ProofRow[]).map(toProof);
}

export async function saveProof(
  database: Database.Database,
  userId: number,
  expenseId: number,
  file: File,
  directory = proofsDirectory(),
  sourceId?: string,
): Promise<{ proof: ExpenseProof; replayed: boolean }> {
  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) throw new ProofError("Expense not found.", 404);
  if (!file.size || file.size > MAX_PROOF_BYTES) throw new ProofError("Proof must be 1 byte to 5 MB.", 400);
  validSourceId(sourceId);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectType(bytes);
  if (!type || file.type !== type.mimeType) {
    throw new ProofError("Proof must be a JPEG, PNG, WebP, or PDF file.", 400);
  }
  if (!database.prepare("SELECT id FROM expenses WHERE id = ? AND user_id = ?").get(expenseId, userId)) {
    throw new ProofError("Expense not found.", 404);
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = sourceId && database.prepare("SELECT * FROM expense_proofs WHERE expense_id = ? AND source_id = ?")
    .get(expenseId, sourceId) as ProofRow | undefined;
  if (existing) {
    if (existing.sha256 !== sha256) throw new ProofError("sourceId already belongs to a different proof.", 409);
    return { proof: toProof(existing), replayed: true };
  }
  const count = database.prepare("SELECT COUNT(*) AS count FROM expense_proofs WHERE expense_id = ?")
    .get(expenseId) as { count: number };
  if (count.count >= MAX_PROOFS) throw new ProofError("This expense already has 3 proofs.", 409);

  const id = randomUUID();
  const filename = filenameOf(file.name);
  const path = join(/* turbopackIgnore: true */ directory, `${id}.${type.extension}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  try {
    database.prepare(`INSERT INTO expense_proofs (id, expense_id, filename, mime_type, size_bytes, sha256, source_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, expenseId, filename, type.mimeType, bytes.length, sha256, sourceId ?? null, new Date().toISOString());
  } catch (error) {
    unlinkSync(path);
    throw error;
  }
  return { proof: toProof(database.prepare("SELECT * FROM expense_proofs WHERE id = ?").get(id) as ProofRow), replayed: false };
}

function saveContentProof(
  database: Database.Database,
  userId: number,
  expenseId: number,
  kind: "text" | "link",
  content: string,
  sourceId: string | undefined,
): { proof: ExpenseProof; replayed: boolean } {
  validSourceId(sourceId);
  if (!database.prepare("SELECT id FROM expenses WHERE id = ? AND user_id = ?").get(expenseId, userId)) {
    throw new ProofError("Expense not found.", 404);
  }
  const sha256 = createHash("sha256").update(content).digest("hex");
  const existing = sourceId && database.prepare("SELECT * FROM expense_proofs WHERE expense_id = ? AND source_id = ?")
    .get(expenseId, sourceId) as ProofRow | undefined;
  if (existing) {
    if (existing.kind !== kind || existing.sha256 !== sha256) throw new ProofError("sourceId already belongs to a different proof.", 409);
    return { proof: toProof(existing), replayed: true };
  }
  const count = database.prepare("SELECT COUNT(*) AS count FROM expense_proofs WHERE expense_id = ?")
    .get(expenseId) as { count: number };
  if (count.count >= MAX_PROOFS) throw new ProofError("This expense already has 3 proofs.", 409);

  const id = randomUUID();
  database.prepare(`INSERT INTO expense_proofs
    (id, expense_id, kind, text_content, filename, mime_type, size_bytes, sha256, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, expenseId, kind, content, kind, kind === "text" ? "text/plain" : "text/uri-list",
    Buffer.byteLength(content), sha256, sourceId ?? null, new Date().toISOString());
  return { proof: toProof(database.prepare("SELECT * FROM expense_proofs WHERE id = ?").get(id) as ProofRow), replayed: false };
}

export function saveTextProof(database: Database.Database, userId: number, expenseId: number, text: string, sourceId?: string):
  { proof: ExpenseProof; replayed: boolean } {
  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) throw new ProofError("Expense not found.", 404);
  const value = typeof text === "string" ? text.trim() : "";
  if (!value || value.length > MAX_PROOF_TEXT_LENGTH) {
    throw new ProofError(`Text proof must contain 1-${MAX_PROOF_TEXT_LENGTH} characters.`, 400);
  }
  return saveContentProof(database, userId, expenseId, "text", value, sourceId);
}

export function saveLinkProof(database: Database.Database, userId: number, expenseId: number, url: string, sourceId?: string):
  { proof: ExpenseProof; replayed: boolean } {
  if (!Number.isSafeInteger(expenseId) || expenseId <= 0) throw new ProofError("Expense not found.", 404);
  const value = typeof url === "string" ? url.trim() : "";
  const invalid = new ProofError(`Link proof must be an http(s) URL of 1-${MAX_PROOF_TEXT_LENGTH} characters without spaces.`, 400);
  if (!value || value.length > MAX_PROOF_TEXT_LENGTH || !/^https?:\/\//i.test(value) || /[\s\x00-\x1f\x7f]/.test(value)) {
    throw invalid;
  }
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw invalid; }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) throw invalid;
  return saveContentProof(database, userId, expenseId, "link", value, sourceId);
}

export type ProofContent =
  | { proof: ExpenseProof; bytes: Uint8Array; text?: undefined }
  | { proof: ExpenseProof; text: string; bytes?: undefined };

export function readProof(database: Database.Database, userId: number, expenseId: number, proofId: string, directory = proofsDirectory()):
  ProofContent {
  const row = database.prepare(`
    SELECT expense_proofs.* FROM expense_proofs
    JOIN expenses ON expenses.id = expense_proofs.expense_id
    WHERE expense_proofs.expense_id = ? AND expense_proofs.id = ? AND expenses.user_id = ?
  `).get(expenseId, proofId, userId) as ProofRow | undefined;
  if (!row) throw new ProofError("Proof not found.", 404);
  if (row.kind !== "file") {
    if (row.text_content === null) throw new Error("Invalid stored proof content.");
    return { proof: toProof(row), text: row.text_content };
  }
  const extension = proofExtension(row.mime_type);
  if (!extension) throw new Error("Invalid stored proof type.");
  return { proof: toProof(row), bytes: new Uint8Array(readFileSync(join(/* turbopackIgnore: true */ directory, `${row.id}.${extension}`))) };
}
