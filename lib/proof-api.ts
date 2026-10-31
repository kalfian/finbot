import type Database from "better-sqlite3";
import { listProofs, MAX_PROOF_BYTES, ProofError, readProof, saveLinkProof, saveProof, saveTextProof } from "./expense-proofs";

const MAX_REQUEST_BYTES = MAX_PROOF_BYTES + 64 * 1024;
const MAX_JSON_BYTES = 16 * 1024;

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
  if (!request.body) throw new ProofError("Upload is empty.", 400);
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

async function postContentProof(request: Request, database: Database.Database, userId: number, id: number): Promise<Response> {
  const chunks = await readLimitedBody(request, MAX_JSON_BYTES, "Proof text exceeds 16 KB.");
  let body: unknown;
  try { body = JSON.parse(await new Blob(chunks as BlobPart[]).text()); } catch { throw new ProofError("Body must be valid JSON.", 400); }
  if (!body || typeof body !== "object") throw new ProofError("Body must be a JSON object.", 400);
  const { kind, text, sourceId } = body as Record<string, unknown>;
  if (typeof text !== "string") throw new ProofError("text must be a string.", 400);
  if (sourceId !== undefined && typeof sourceId !== "string") throw new ProofError("sourceId must be text.", 400);
  let saved: ReturnType<typeof saveTextProof>;
  if (kind === "text") saved = saveTextProof(database, userId, id, text, sourceId);
  else if (kind === "link") saved = saveLinkProof(database, userId, id, text, sourceId);
  else throw new ProofError("kind must be \"text\" or \"link\".", 400);
  return Response.json(saved, { status: saved.replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
}

export async function postProof(request: Request, database: Database.Database, userId: number, rawId: string): Promise<Response> {
  try {
    const id = expenseId(rawId);
    const contentType = request.headers.get("content-type") ?? "";
    if (/^application\/json\s*(?:;|$)/i.test(contentType)) return await postContentProof(request, database, userId, id);
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new ProofError("Upload must use multipart/form-data or application/json.", 400);
    }
    const chunks = await readLimitedBody(request, MAX_REQUEST_BYTES, "Upload exceeds 5 MB.");
    const upload = new Request(request.url, { method: "POST", headers: { "content-type": contentType },
      body: new Blob(chunks as BlobPart[]) });
    let form: FormData;
    try { form = await upload.formData(); } catch { throw new ProofError("Upload must be valid multipart/form-data.", 400); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ProofError("Select one proof file.", 400);
    const sourceId = form.get("sourceId");
    if (sourceId !== null && typeof sourceId !== "string") throw new ProofError("sourceId must be text.", 400);
    const { proof, replayed } = await saveProof(database, userId, id, file, undefined, sourceId ?? undefined);
    return Response.json({ proof, replayed }, { status: replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
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
