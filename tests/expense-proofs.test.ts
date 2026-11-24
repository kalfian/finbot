import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { deleteProofFiles, listProofs, ProofError, readProof, saveProof, saveTextProof } from "../lib/expense-proofs";
import { getProofFile, getProofList, postProof } from "../lib/proof-api";
import { createUserRepository } from "../lib/auth";
import { createHash } from "node:crypto";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
const rejected = (status: number) => (error: unknown) => error instanceof ProofError && error.status === status;

function insertLegacyProof(database: Database.Database, expenseId: number, id: string, kind: "file" | "link", mimeType: string, text: string | null) {
  database.prepare(`INSERT INTO expense_proofs (id, expense_id, kind, text_content, filename, mime_type, size_bytes, sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 12, 'hash', '2026-01-01T00:00:00.000Z')`).run(id, expenseId, kind, text, kind === "file" ? "receipt.png" : "link", mimeType);
}

test("text proofs trim, replay by sourceId, validate length, and share the three-proof limit", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Transfer", category: "Other", date: "2026-09-28T05:00:00.000Z" });

    const first = saveTextProof(database, 1, expense.id, "  Paid via BCA ref 123  ", "chat:text:1");
    assert.equal(first.replayed, false);
    assert.equal(first.proof.kind, "text");
    assert.equal(first.proof.textContent, "Paid via BCA ref 123");
    assert.equal(first.proof.mimeType, "text/plain");
    assert.equal(first.proof.sizeBytes, Buffer.byteLength("Paid via BCA ref 123"));
    assert.equal(repository.list()[0].proofCount, 1);
    assert.deepEqual(listProofs(database, 1, expense.id), [first.proof]);
    assert.deepEqual(readProof(database, 1, expense.id, first.proof.id), { proof: first.proof, text: "Paid via BCA ref 123" });

    assert.equal(saveTextProof(database, 1, expense.id, "Paid via BCA ref 123", "chat:text:1").replayed, true);
    assert.throws(() => saveTextProof(database, 1, expense.id, "Different", "chat:text:1"), rejected(409));
    assert.throws(() => saveTextProof(database, 1, expense.id, "   "), rejected(400));
    assert.throws(() => saveTextProof(database, 1, expense.id, "x".repeat(2001)), rejected(400));
    assert.throws(() => saveTextProof(database, 1, expense.id, "ok", " "), rejected(400));
    assert.throws(() => saveTextProof(database, 1, 999, "missing"), rejected(404));

    assert.equal(saveTextProof(database, 1, expense.id, "x".repeat(2000)).proof.textContent?.length, 2000);
    saveTextProof(database, 1, expense.id, "https://example.com/order/1");
    assert.throws(() => saveTextProof(database, 1, expense.id, "fourth"), rejected(409));
    assert.equal(repository.list()[0].proofCount, 3);
  } finally { database.close(); }
});

test("file proofs persist privately, sniff content, hash bytes, replay by sourceId, and share the three-proof limit", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "expense-proofs-"));
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Lunch", category: "Food", date: "2026-09-28T05:00:00.000Z" });
    const file = new File([png], "../receipt.png", { type: "image/png" });
    const first = await saveProof(database, 1, expense.id, file, directory, "chat:1");
    assert.equal(first.proof.kind, "file");
    assert.equal(first.proof.filename, "receipt.png");
    assert.equal(first.proof.mimeType, "image/png");
    assert.equal(first.proof.textContent, undefined);
    assert.equal(first.replayed, false);
    assert.equal((database.prepare("SELECT sha256 FROM expense_proofs WHERE id = ?").get(first.proof.id) as { sha256: string }).sha256,
      createHash("sha256").update(png).digest("hex"));
    assert.equal(repository.list()[0].proofCount, 1);
    assert.deepEqual(readProof(database, 1, expense.id, first.proof.id, directory).bytes, new Uint8Array(png));
    assert.equal((await saveProof(database, 1, expense.id, file, directory, "chat:1")).replayed, true);
    assert.equal(readdirSync(directory).length, 1);
    await assert.rejects(saveProof(database, 1, expense.id, new File([png, Buffer.from([1])], "different.png", { type: "image/png" }), directory, "chat:1"), rejected(409));
    await assert.rejects(saveProof(database, 1, expense.id, new File(["<script>bad</script>"], "fake.png", { type: "image/png" }), directory), rejected(400));
    await assert.rejects(saveProof(database, 1, expense.id, new File([png], "wrong.pdf", { type: "application/pdf" }), directory), rejected(400));
    await assert.rejects(saveProof(database, 1, expense.id, new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), directory), rejected(400));
    await assert.rejects(saveProof(database, 1, expense.id, new File([], "empty.png", { type: "image/png" }), directory), rejected(400));
    await assert.rejects(saveProof(database, 1, 999, file, directory), rejected(404));
    // Generic declared types (curl sends octet-stream for .webp) defer to the sniffed type.
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([4, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
    const sniffed = await saveProof(database, 1, expense.id, new File([webp], "", { type: "application/octet-stream" }), directory);
    assert.equal(sniffed.proof.mimeType, "image/webp");
    assert.equal(sniffed.proof.filename, "proof.webp");
    saveTextProof(database, 1, expense.id, "third proof is text");
    await assert.rejects(saveProof(database, 1, expense.id, file, directory), rejected(409));
    assert.equal(repository.list()[0].proofCount, 3);
    assert.equal(readdirSync(directory).length, 2);

    const deleted = repository.delete(expense.id);
    assert.ok(deleted);
    deleteProofFiles(deleted.proofs, directory);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy file and link proofs stay readable and legacy files are removed on delete", () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "legacy-proofs-"));
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Legacy", category: "Other", date: "2026-09-28T05:00:00.000Z" });
    const fileId = "00000000-0000-4000-8000-000000000001";
    const linkId = "00000000-0000-4000-8000-000000000002";
    insertLegacyProof(database, expense.id, fileId, "file", "image/png", null);
    insertLegacyProof(database, expense.id, linkId, "link", "text/uri-list", "https://example.com/r");
    writeFileSync(join(directory, `${fileId}.png`), png);

    const file = readProof(database, 1, expense.id, fileId, directory);
    assert.deepEqual(file.bytes, new Uint8Array(png));
    assert.equal(file.text, undefined);
    assert.equal(file.proof.textContent, undefined);
    assert.equal(readProof(database, 1, expense.id, linkId, directory).text, "https://example.com/r");
    saveTextProof(database, 1, expense.id, "third");
    assert.throws(() => saveTextProof(database, 1, expense.id, "fourth"), rejected(409), "legacy rows count toward the limit");

    const deleted = repository.delete(expense.id);
    assert.ok(deleted);
    deleteProofFiles(deleted.proofs, directory);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("proof metadata, writes, and content cannot cross user boundaries", () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("proof-user", "temporary123");
    const expense = createExpenseRepository(database, 1).create({ amountCents: 100, description: "Private", category: "Other", date: "2026-09-28T05:00:00.000Z" });
    const saved = saveTextProof(database, 1, expense.id, "private note", "private-source");

    assert.throws(() => listProofs(database, user.id, expense.id), rejected(404));
    assert.throws(() => readProof(database, user.id, expense.id, saved.proof.id), rejected(404));
    assert.throws(() => saveTextProof(database, user.id, expense.id, "private note", "private-source"), rejected(404));
  } finally { database.close(); }
});

test("authenticated proof endpoint accepts JSON text or multipart files and serves them with safe headers", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "endpoint-proofs-"));
  try {
    initializeDatabase(database);
    const expense = createExpenseRepository(database, 1).create({ amountCents: 100, description: "Lunch", category: "Food", date: "2026-09-28T05:00:00.000Z" });
    const id = String(expense.id);
    const post = (body: unknown) => postProof(new Request("http://localhost", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), database, 1, id, directory);

    const created = await post({ text: "Cash, no receipt", sourceId: "s1" });
    assert.equal(created.status, 201);
    const { proof } = await created.json() as { proof: { id: string; kind: string } };
    assert.equal(proof.kind, "text");
    assert.equal((await post({ kind: "text", text: "Cash, no receipt", sourceId: "s1" })).status, 200);
    assert.equal((await post({ kind: "link", text: "https://example.com" })).status, 400);
    assert.equal((await post({ kind: "file", text: "x" })).status, 400);
    assert.equal((await post({})).status, 400);
    assert.equal((await post({ text: "" })).status, 400);
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
      database, 1, id, directory)).status, 400);
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", body: "plain" }), database, 1, id, directory)).status, 415);
    const oversizedText = new Request("http://localhost", { method: "POST", body: JSON.stringify({ text: "x".repeat(20_000) }),
      headers: { "content-type": "application/json" } });
    assert.equal((await postProof(oversizedText, database, 1, id, directory)).status, 413);

    const form = new FormData();
    form.set("file", new File([png], "receipt.png", { type: "image/png" }));
    form.set("sourceId", "upload-1");
    const oversizedFile = new Request("http://localhost", { method: "POST", body: form, headers: { "content-length": String(6 * 1024 * 1024) } });
    assert.equal((await postProof(oversizedFile, database, 1, id, directory)).status, 413);
    const noFile = new FormData();
    noFile.set("sourceId", "x");
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", body: noFile }), database, 1, id, directory)).status, 400);
    const uploaded = await postProof(new Request("http://localhost", { method: "POST", body: form }), database, 1, id, directory);
    assert.equal(uploaded.status, 201);
    const fileProof = (await uploaded.json() as { proof: { id: string; kind: string; filename: string } }).proof;
    assert.equal(fileProof.kind, "file");
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", body: form }), database, 1, id, directory)).status, 200);
    assert.equal(listProofs(database, 1, expense.id).length, 2);
    assert.equal(readdirSync(directory).length, 1);

    const response = getProofFile(database, 1, id, proof.id);
    assert.equal(response.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.equal(await response.text(), "Cash, no receipt");
    assert.equal(getProofList(database, 1, id).status, 200);
    assert.equal(getProofFile(database, 1, id, "../x").status, 404);
    assert.equal(getProofList(database, 1, "bad").status, 404);
    assert.equal(existsSync(join(process.cwd(), "public", "proofs")), false);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
