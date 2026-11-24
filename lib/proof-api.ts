import type Database from "better-sqlite3";
import { assertProofCapacity, listProofs, MAX_PROOF_BYTES, ProofError, readProof, saveProof, saveTextProof } from "./expense-proofs";
import { claimProofUploadToken, verifyProofUploadToken } from "./proof-uploads";
import { PROOF_FILE_TYPES } from "./proof-types";

const MAX_JSON_BYTES = 16 * 1024;
const MAX_MULTIPART_BYTES = MAX_PROOF_BYTES + 64 * 1024;
const NO_STORE = { "Cache-Control": "no-store" };

export function expenseId(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) throw new ProofError("Expense not found.", 404);
  return id;
}

export function proofFailure(error: unknown): Response {
  if (error instanceof ProofError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: "Proof could not be processed. Please try again." }, { status: 500 });
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return (!origin || origin === new URL(request.url).origin) && (!site || site === "same-origin" || site === "none");
}

export function getProofList(database: Database.Database, userId: number, rawId: string): Response {
  try {
    return Response.json({ proofs: listProofs(database, userId, expenseId(rawId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return proofFailure(error); }
}

async function readLimitedBody(request: Request, limit: number, tooLarge: string): Promise<Uint8Array[]> {
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > limit) throw new ProofError(tooLarge, 413);
  if (!request.body) throw new ProofError("Proof body is empty.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ProofError(tooLarge, 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return chunks;
}

function mediaType(request: Request): string {
  return (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

async function postTextProof(request: Request, database: Database.Database, userId: number, id: number): Promise<Response> {
  const chunks = await readLimitedBody(request, MAX_JSON_BYTES, "Proof text exceeds 16 KB.");
  let body: unknown;
  try { body = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new ProofError("Body must be valid JSON.", 400); }
  if (!body || typeof body !== "object") throw new ProofError("Body must be a JSON object.", 400);
  const { kind, text, sourceId } = body as Record<string, unknown>;
  if (kind !== undefined && kind !== "text") throw new ProofError("JSON proofs must be text; upload files as multipart/form-data.", 400);
  if (typeof text !== "string") throw new ProofError("text must be a string.", 400);
  if (sourceId !== undefined && typeof sourceId !== "string") throw new ProofError("sourceId must be text.", 400);
  const saved = saveTextProof(database, userId, id, text, sourceId);
  return Response.json(saved, { status: saved.replayed ? 200 : 201, headers: NO_STORE });
}

/** Reads a multipart body (field `file`, optional text field `sourceId`) within the upload size limit. */
async function readMultipartFile(request: Request): Promise<{ file: File; sourceId?: string }> {
  const chunks = await readLimitedBody(request, MAX_MULTIPART_BYTES, "Upload exceeds 5 MB.");
  const upload = new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" },
    body: new Blob(chunks as BlobPart[]) });
  let form: FormData;
  try { form = await upload.formData(); } catch { throw new ProofError("Upload must be valid multipart/form-data.", 400); }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ProofError("Send one proof file in the multipart field \"file\".", 400);
  const sourceId = form.get("sourceId");
  if (sourceId !== null && typeof sourceId !== "string") throw new ProofError("sourceId must be text.", 400);
  return { file, sourceId: sourceId ?? undefined };
}

export async function postProof(request: Request, database: Database.Database, userId: number, rawId: string,
  directory?: string): Promise<Response> {
  try {
    const id = expenseId(rawId);
    const type = mediaType(request);
    if (type === "application/json") return await postTextProof(request, database, userId, id);
    if (type !== "multipart/form-data") {
      throw new ProofError("Send text proofs as application/json { \"text\": \"...\" } or files as multipart/form-data (field \"file\").", 415);
    }
    const { file, sourceId } = await readMultipartFile(request);
    const saved = await saveProof(database, userId, id, file, directory, sourceId);
    return Response.json(saved, { status: saved.replayed ? 200 : 201, headers: NO_STORE });
  } catch (error) { return proofFailure(error); }
}

/**
 * Token-gated upload used by agents after the MCP tool create_proof_upload. The token in the path is
 * the only credential and is bound to one user and expense. Accepts multipart/form-data (field
 * `file`) or a raw body whose Content-Type is one of the allowed proof types (optional ?filename=).
 */
export async function postProofUpload(request: Request, database: Database.Database, token: string,
  options: { directory?: string; now?: Date } = {}): Promise<Response> {
  try {
    const grant = verifyProofUploadToken(database, token, options.now);
    // Reject before reading the body when the expense is gone, re-owned, or already full.
    assertProofCapacity(database, grant.userId, grant.expenseId, grant.sourceId);
    const type = mediaType(request);
    let file: File;
    if (type === "multipart/form-data") {
      file = (await readMultipartFile(request)).file;
    } else if ((PROOF_FILE_TYPES as readonly string[]).includes(type) || type === "application/octet-stream") {
      const chunks = await readLimitedBody(request, MAX_PROOF_BYTES, "Upload exceeds 5 MB.");
      const filename = new URL(request.url).searchParams.get("filename") ?? "";
      file = new File(chunks as BlobPart[], filename, { type });
    } else {
      throw new ProofError(`Upload must be multipart/form-data (field "file") or a raw body with Content-Type ${PROOF_FILE_TYPES.join(", ")}.`, 415);
    }
    const saved = await saveProof(database, grant.userId, grant.expenseId, file, options.directory, grant.sourceId,
      { claim: (proofId) => claimProofUploadToken(database, grant, proofId, options.now) });
    return Response.json(saved, { status: saved.replayed ? 200 : 201, headers: NO_STORE });
  } catch (error) { return proofFailure(error); }
}

export function getProofFile(database: Database.Database, userId: number, rawId: string, proofId: string): Response {
  try {
    if (!/^[0-9a-f-]{36}$/.test(proofId)) throw new ProofError("Proof not found.", 404);
    const { proof, bytes, text } = readProof(database, userId, expenseId(rawId), proofId);
    if (text !== undefined) {
      return new Response(text, { headers: {
        "Content-Type": `${proof.kind === "link" ? "text/uri-list" : "text/plain"}; charset=utf-8`,
        "Content-Length": String(Buffer.byteLength(text)),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      } });
    }
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": proof.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(proof.filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    } });
  } catch (error) { return proofFailure(error); }
}
