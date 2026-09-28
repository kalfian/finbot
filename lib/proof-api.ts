import type Database from "better-sqlite3";
import { listProofs, MAX_PROOF_BYTES, ProofError, readProof, saveProof } from "./expense-proofs";

const MAX_REQUEST_BYTES = MAX_PROOF_BYTES + 64 * 1024;

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

export function getProofList(database: Database.Database, rawId: string): Response {
  try {
    return Response.json({ proofs: listProofs(database, expenseId(rawId)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return proofFailure(error); }
}

export async function postProof(request: Request, database: Database.Database, rawId: string): Promise<Response> {
  try {
    const id = expenseId(rawId);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
      throw new ProofError("Upload must use multipart/form-data.", 400);
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (contentLength > MAX_REQUEST_BYTES) throw new ProofError("Upload exceeds 5 MB.", 413);
    if (!request.body) throw new ProofError("Upload is empty.", 400);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_REQUEST_BYTES) {
          await reader.cancel();
          throw new ProofError("Upload exceeds 5 MB.", 413);
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const upload = new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! },
      body: new Blob(chunks as BlobPart[]) });
    let form: FormData;
    try { form = await upload.formData(); } catch { throw new ProofError("Upload must be valid multipart/form-data.", 400); }
    const file = form.get("file");
    if (!(file instanceof File)) throw new ProofError("Select one proof file.", 400);
    const sourceId = form.get("sourceId");
    if (sourceId !== null && typeof sourceId !== "string") throw new ProofError("sourceId must be text.", 400);
    const { proof, replayed } = await saveProof(database, id, file, undefined, sourceId ?? undefined);
    return Response.json({ proof, replayed }, { status: replayed ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return proofFailure(error); }
}

export function getProofFile(database: Database.Database, rawId: string, proofId: string): Response {
  try {
    if (!/^[0-9a-f-]{36}$/.test(proofId)) throw new ProofError("Proof not found.", 404);
    const { proof, bytes } = readProof(database, expenseId(rawId), proofId);
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
