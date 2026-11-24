import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { createUserRepository } from "../lib/auth";
import { listProofs, ProofError, saveTextProof } from "../lib/expense-proofs";
import { postProofUpload } from "../lib/proof-api";
import { createProofUploadToken, issueProofUpload, publicOrigin, verifyProofUploadToken } from "../lib/proof-uploads";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const jpeg = Buffer.from("ffd8ffe000104a46494600", "hex");
const pdf = Buffer.from("%PDF-1.4\n%%EOF\n");
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const date = "2026-09-28T05:00:00.000Z";

function setup() {
  const database = new Database(":memory:");
  initializeDatabase(database);
  const directory = mkdtempSync(join(tmpdir(), "proof-uploads-"));
  const repository = createExpenseRepository(database, 1);
  const expense = repository.create({ amountCents: 100, description: "Receipt", category: "Other", date });
  return {
    database, directory, repository, expense,
    cleanup() { database.close(); rmSync(directory, { recursive: true, force: true }); },
    token(options: { sourceId?: string; now?: Date; expenseId?: number; userId?: number } = {}) {
      return createProofUploadToken(database, options.userId ?? 1, options.expenseId ?? expense.id, options).token;
    },
    raw(token: string, body: Uint8Array | string, type: string | null, query = "", now?: Date) {
      const headers = new Headers();
      if (type) headers.set("content-type", type);
      return postProofUpload(new Request(`http://localhost/api/v1/proof-uploads/${token}${query}`, { method: "POST", headers, body: body as BodyInit }),
        database, token, { directory, now });
    },
    multipart(token: string, file: File) {
      const form = new FormData();
      form.set("file", file);
      return postProofUpload(new Request(`http://localhost/api/v1/proof-uploads/${token}`, { method: "POST", body: form }),
        database, token, { directory });
    },
  };
}

async function errorOf(response: Response): Promise<string> {
  return (await response.json() as { error: string }).error;
}

test("upload links accept multipart and raw bodies, hash bytes, and return the proof", async () => {
  const t = setup();
  try {
    const link = issueProofUpload(t.database, 1, t.expense.id, { origin: "https://finbot.example" });
    assert.equal(link.method, "POST");
    assert.equal(link.expiresInSeconds, 600);
    assert.match(link.uploadUrl, /^https:\/\/finbot\.example\/api\/v1\/proof-uploads\/pu1\./);
    const token = link.uploadUrl.split("/").at(-1)!;

    const multipart = await t.multipart(token, new File([png], "C:\\photos\\receipt.png", { type: "image/png" }));
    assert.equal(multipart.status, 201);
    assert.equal(multipart.headers.get("cache-control"), "no-store");
    const { proof, replayed } = await multipart.json() as { proof: { id: string; kind: string; filename: string; mimeType: string; sizeBytes: number }; replayed: boolean };
    assert.deepEqual([proof.kind, proof.filename, proof.mimeType, proof.sizeBytes, replayed], ["file", "receipt.png", "image/png", png.length, false]);
    const row = t.database.prepare("SELECT sha256, expense_id FROM expense_proofs WHERE id = ?").get(proof.id) as { sha256: string; expense_id: number };
    assert.deepEqual(row, { sha256: createHash("sha256").update(png).digest("hex"), expense_id: t.expense.id });

    const raw = await t.raw(t.token(), jpeg, "image/jpeg", "?filename=struk.jpg");
    assert.equal(raw.status, 201);
    assert.equal((await raw.json() as { proof: { filename: string } }).proof.filename, "struk.jpg");
    const octet = await t.raw(t.token(), pdf, "application/octet-stream");
    assert.equal(octet.status, 201);
    const octetProof = ((await octet.json()) as { proof: { mimeType: string; filename: string } }).proof;
    assert.deepEqual([octetProof.mimeType, octetProof.filename], ["application/pdf", "proof.pdf"]);
    assert.equal(readdirSync(t.directory).length, 3);
    assert.equal(t.repository.list()[0].proofCount, 3);
  } finally { t.cleanup(); }
});

test("upload links are single use: replays are rejected and do not write files", async () => {
  const t = setup();
  try {
    const token = t.token();
    assert.equal((await t.raw(token, png, "image/png")).status, 201);
    const replay = await t.raw(token, png, "image/png");
    assert.equal(replay.status, 410);
    assert.match(await errorOf(replay), /already used/);
    assert.equal((await t.raw(token, jpeg, "image/jpeg")).status, 410);
    assert.throws(() => verifyProofUploadToken(t.database, token), (error: unknown) => error instanceof ProofError && error.status === 410);
    assert.equal(listProofs(t.database, 1, t.expense.id).length, 1);
    assert.equal(readdirSync(t.directory).length, 1);
  } finally { t.cleanup(); }
});

test("rejected uploads do not consume the link", async () => {
  const t = setup();
  try {
    const token = t.token();
    assert.equal((await t.raw(token, Buffer.from("<html>"), "image/png")).status, 400);
    assert.equal((await t.raw(token, png, "text/plain")).status, 415);
    assert.equal((await t.raw(token, png, null)).status, 415);
    assert.equal((await t.raw(token, png, "image/png")).status, 201);
  } finally { t.cleanup(); }
});

test("upload links expire after ten minutes", async () => {
  const t = setup();
  try {
    const issued = new Date(Date.now() - 11 * 60 * 1000);
    const stale = t.token({ now: issued });
    const expired = await t.raw(stale, png, "image/png");
    assert.equal(expired.status, 410);
    assert.match(await errorOf(expired), /expired/);
    const fresh = t.token();
    assert.equal(verifyProofUploadToken(t.database, fresh, new Date(Date.now() + 9 * 60 * 1000)).expenseId, t.expense.id);
    assert.throws(() => verifyProofUploadToken(t.database, fresh, new Date(Date.now() + 10 * 60 * 1000 + 1000)),
      (error: unknown) => error instanceof ProofError && error.status === 410);
    assert.equal(readdirSync(t.directory).length, 0);
  } finally { t.cleanup(); }
});

test("upload links are bound to their user and expense and cannot be forged", async () => {
  const t = setup();
  try {
    const other = createUserRepository(t.database).create("upload-user", "temporary123");
    const otherExpense = createExpenseRepository(t.database, other.id).create({ amountCents: 200, description: "Other", category: "Other", date });

    // The MCP tool refuses to issue links for someone else's expense.
    assert.throws(() => issueProofUpload(t.database, other.id, t.expense.id), (error: unknown) => error instanceof ProofError && error.status === 404);
    // A validly signed link whose user does not own the expense is still refused at upload.
    assert.equal((await t.raw(t.token({ userId: other.id }), png, "image/png")).status, 404);
    // Swapping the payload to another expense breaks the signature.
    const [version, , signature] = t.token().split(".");
    const forgedBody = Buffer.from(JSON.stringify({ p: "proof-upload", u: other.id, e: otherExpense.id, n: "A".repeat(22), x: 4_102_444_800 }))
      .toString("base64url");
    assert.equal((await t.raw(`${version}.${forgedBody}.${signature}`, png, "image/png")).status, 401);
    // Links signed with a different server secret, or malformed ones, are rejected.
    const foreign = new Database(":memory:");
    initializeDatabase(foreign);
    const foreignToken = createProofUploadToken(foreign, 1, t.expense.id).token;
    foreign.close();
    assert.equal((await t.raw(foreignToken, png, "image/png")).status, 401);
    for (const bad of ["", "abc", "pu1.e30.short", `pu1..${"a".repeat(43)}`, `${"pu1.x".repeat(300)}`]) {
      assert.equal((await t.raw(bad, png, "image/png")).status, 401, bad.slice(0, 20));
    }
    // A deleted expense invalidates its outstanding link.
    const doomed = t.repository.create({ amountCents: 300, description: "Doomed", category: "Other", date });
    const doomedToken = t.token({ expenseId: doomed.id });
    t.repository.delete(doomed.id);
    assert.equal((await t.raw(doomedToken, png, "image/png")).status, 404);

    assert.equal(listProofs(t.database, other.id, otherExpense.id).length, 0);
    assert.equal(listProofs(t.database, 1, t.expense.id).length, 0);
    assert.equal(readdirSync(t.directory).length, 0);
  } finally { t.cleanup(); }
});

test("upload links enforce type sniffing and the 5 MB limit", async () => {
  const t = setup();
  try {
    const token = t.token();
    assert.equal((await t.raw(token, png, "application/pdf")).status, 400, "declared type must match bytes");
    assert.equal((await t.raw(token, Buffer.from("GIF89a"), "application/octet-stream")).status, 400);
    assert.equal((await t.multipart(token, new File(["not an image"], "fake.jpg", { type: "image/jpeg" }))).status, 400);
    assert.equal((await t.raw(token, Buffer.alloc(0), "image/png")).status, 400);
    const oversized = Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]);
    assert.equal((await t.raw(token, oversized, "image/png")).status, 413);
    // Just over 5 MB fits the multipart envelope and is refused by validation; far over is cut off while streaming.
    assert.equal((await t.multipart(token, new File([oversized], "big.png", { type: "image/png" }))).status, 400);
    assert.equal((await t.multipart(token, new File([oversized, Buffer.alloc(128 * 1024)], "bigger.png", { type: "image/png" }))).status, 413);
    const declaredLarge = postProofUpload(new Request(`http://localhost/x/${token}`, { method: "POST", body: png,
      headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) } }), t.database, token, { directory: t.directory });
    assert.equal((await declaredLarge).status, 413);
    assert.equal((await t.raw(token, webp, "image/webp")).status, 201);
    assert.equal(readdirSync(t.directory).length, 1);
  } finally { t.cleanup(); }
});

test("upload links respect the three-proof limit at issue and upload time", async () => {
  const t = setup();
  try {
    saveTextProof(t.database, 1, t.expense.id, "one");
    const late = t.token();
    saveTextProof(t.database, 1, t.expense.id, "two");
    saveTextProof(t.database, 1, t.expense.id, "three");
    assert.throws(() => issueProofUpload(t.database, 1, t.expense.id), (error: unknown) => error instanceof ProofError && error.status === 409);
    const full = await t.raw(late, png, "image/png");
    assert.equal(full.status, 409);
    assert.match(await errorOf(full), /3 proofs/);
    assert.equal(readdirSync(t.directory).length, 0);
    // The refused link was not consumed.
    assert.doesNotThrow(() => verifyProofUploadToken(t.database, late));
  } finally { t.cleanup(); }
});

test("sourceId bound into links makes retries with a fresh link idempotent", async () => {
  const t = setup();
  try {
    const first = await t.raw(issueProofUpload(t.database, 1, t.expense.id, { sourceId: "tg:42" }).uploadUrl.split("/").at(-1)!, png, "image/png");
    assert.equal(first.status, 201);
    const { proof } = await first.json() as { proof: { id: string } };
    const retry = await t.raw(t.token({ sourceId: "tg:42" }), png, "image/png");
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { proof: listProofs(t.database, 1, t.expense.id)[0], replayed: true });
    assert.equal(listProofs(t.database, 1, t.expense.id)[0].id, proof.id);
    assert.equal((await t.raw(t.token({ sourceId: "tg:42" }), jpeg, "image/jpeg")).status, 409);
    assert.throws(() => issueProofUpload(t.database, 1, t.expense.id, { sourceId: " " }), (error: unknown) => error instanceof ProofError && error.status === 400);
    // Even at the limit, a link for an already-stored sourceId can be issued so the retry replays.
    saveTextProof(t.database, 1, t.expense.id, "two");
    saveTextProof(t.database, 1, t.expense.id, "three");
    assert.equal(issueProofUpload(t.database, 1, t.expense.id, { sourceId: "tg:42" }).method, "POST");
    assert.equal(readdirSync(t.directory).length, 1);
  } finally { t.cleanup(); }
});

test("publicOrigin prefers PUBLIC_BASE_URL, then forwarded headers, and ignores malformed hosts", () => {
  const previous = process.env.PUBLIC_BASE_URL;
  try {
    delete process.env.PUBLIC_BASE_URL;
    assert.equal(publicOrigin(new Request("http://127.0.0.1:3000/mcp")), "http://127.0.0.1:3000");
    assert.equal(publicOrigin(new Request("http://127.0.0.1:3000/mcp", { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "finbot.example" } })),
      "https://finbot.example");
    assert.equal(publicOrigin(new Request("http://127.0.0.1:3000/mcp", { headers: { "x-forwarded-host": "evil.example/path" } })),
      "http://127.0.0.1:3000");
    assert.equal(publicOrigin(new Request("http://127.0.0.1:3000/mcp", { headers: { "x-forwarded-proto": "javascript" } })),
      "http://127.0.0.1:3000");
    process.env.PUBLIC_BASE_URL = "https://ledger.example/some/path";
    assert.equal(publicOrigin(new Request("http://127.0.0.1:3000/mcp")), "https://ledger.example");
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  }
});
