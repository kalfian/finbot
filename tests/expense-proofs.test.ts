import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { deleteProofFiles, listProofs, ProofError, readProof, saveLinkProof, saveProof, saveTextProof } from "../lib/expense-proofs";
import { getProofFile, getProofList, postProof } from "../lib/proof-api";
import { createUserRepository } from "../lib/auth";

const png = Buffer.from("89504e470d0a1a0a00000000", "hex");

test("proofs persist privately, update counts, replay stable uploads, and reject unsafe files", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "expense-proofs-"));
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Lunch", category: "Food", date: "2026-09-28T05:00:00.000Z" });
    const file = new File([png], "../receipt.png", { type: "image/png" });
    const first = await saveProof(database, 1, expense.id, file, directory, "chat:1");
    assert.equal(first.proof.filename, "receipt.png");
    assert.equal(first.proof.mimeType, "image/png");
    assert.equal(first.replayed, false);
    assert.equal(repository.list()[0].proofCount, 1);
    assert.deepEqual(readProof(database, 1, expense.id, first.proof.id, directory).bytes, new Uint8Array(png));
    assert.deepEqual(listProofs(database, 1, expense.id), [first.proof]);
    assert.equal((await saveProof(database, 1, expense.id, file, directory, "chat:1")).replayed, true);
    assert.equal(readdirSync(directory).length, 1);
    await assert.rejects(saveProof(database, 1, expense.id, new File([png, Buffer.from([1])], "different.png", { type: "image/png" }), directory, "chat:1"),
      (error: unknown) => error instanceof ProofError && error.status === 409);
    await assert.rejects(saveProof(database, 1, expense.id, new File(["<script>bad</script>"], "fake.png", { type: "image/png" }), directory),
      (error: unknown) => error instanceof ProofError && error.status === 400);
    await assert.rejects(saveProof(database, 1, expense.id, new File([png], "wrong.pdf", { type: "application/pdf" }), directory),
      (error: unknown) => error instanceof ProofError && error.status === 400);
    await assert.rejects(saveProof(database, 1, expense.id, new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), directory),
      (error: unknown) => error instanceof ProofError && error.status === 400);
    await assert.rejects(saveProof(database, 1, 999, file, directory),
      (error: unknown) => error instanceof ProofError && error.status === 404);
    await saveProof(database, 1, expense.id, file, directory);
    await saveProof(database, 1, expense.id, file, directory);
    await assert.rejects(saveProof(database, 1, expense.id, file, directory),
      (error: unknown) => error instanceof ProofError && error.status === 409);
    assert.equal(repository.list()[0].proofCount, 3);
    assert.equal(readdirSync(directory).length, 3);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("multipart endpoint rejects oversized and malformed requests before writing", async () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const form = new FormData();
    form.set("file", new File([png], "receipt.png", { type: "image/png" }));
    const expense = createExpenseRepository(database, 1).create({ amountCents: 100, description: "Lunch", category: "Food", date: "2026-09-28T05:00:00.000Z" });
    const oversized = new Request("http://localhost", { method: "POST", body: form, headers: { "content-length": String(6 * 1024 * 1024) } });
    assert.equal((await postProof(oversized, database, 1, String(expense.id))).status, 413);
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", body: "{}" }), database, 1, String(expense.id))).status, 400);
    assert.equal(getProofList(database, 1, String(expense.id)).status, 200);
    assert.equal(getProofFile(database, 1, String(expense.id), "../x").status, 404);
    assert.equal(getProofList(database, 1, "bad").status, 404);
    assert.equal(existsSync(join(process.cwd(), "public", "proofs")), false);
  } finally { database.close(); }
});

test("proof metadata, uploads, and file bytes cannot cross user boundaries", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "isolated-proofs-"));
  try {
    initializeDatabase(database);
    const user = createUserRepository(database).create("proof-user", "temporary123");
    const expense = createExpenseRepository(database, 1).create({ amountCents: 100, description: "Private", category: "Other", date: "2026-09-28T05:00:00.000Z" });
    const file = new File([png], "private.png", { type: "image/png" });
    const saved = await saveProof(database, 1, expense.id, file, directory, "private-source");

    assert.throws(() => listProofs(database, user.id, expense.id), (error: unknown) => error instanceof ProofError && error.status === 404);
    assert.throws(() => readProof(database, user.id, expense.id, saved.proof.id, directory), (error: unknown) => error instanceof ProofError && error.status === 404);
    await assert.rejects(saveProof(database, user.id, expense.id, file, directory, "private-source"),
      (error: unknown) => error instanceof ProofError && error.status === 404);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deleted proof references remove their private files", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "deleted-proofs-"));
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Delete", category: "Other", date: "2026-09-28T05:00:00.000Z" });
    await saveProof(database, 1, expense.id, new File([png], "delete.png", { type: "image/png" }), directory);
    const deleted = repository.delete(expense.id);
    assert.ok(deleted);
    deleteProofFiles(deleted.proofs, directory);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("text and link proofs store content without files and share the three-proof limit", async () => {
  const database = new Database(":memory:");
  const directory = mkdtempSync(join(tmpdir(), "content-proofs-"));
  const rejected = (error: unknown) => error instanceof ProofError && error.status === 400;
  try {
    initializeDatabase(database);
    const repository = createExpenseRepository(database, 1);
    const expense = repository.create({ amountCents: 100, description: "Transfer", category: "Other", date: "2026-09-28T05:00:00.000Z" });

    const text = saveTextProof(database, 1, expense.id, "  Paid via BCA ref 123  ", "chat:text:1");
    assert.equal(text.replayed, false);
    assert.equal(text.proof.kind, "text");
    assert.equal(text.proof.textContent, "Paid via BCA ref 123");
    assert.equal(text.proof.mimeType, "text/plain");
    assert.equal(text.proof.sizeBytes, Buffer.byteLength("Paid via BCA ref 123"));
    assert.equal(saveTextProof(database, 1, expense.id, "Paid via BCA ref 123", "chat:text:1").replayed, true);
    assert.throws(() => saveTextProof(database, 1, expense.id, "Different", "chat:text:1"),
      (error: unknown) => error instanceof ProofError && error.status === 409);
    assert.throws(() => saveTextProof(database, 1, expense.id, "   "), rejected);
    assert.throws(() => saveTextProof(database, 1, expense.id, "x".repeat(2001)), rejected);
    assert.equal(saveTextProof(database, 1, expense.id, "x".repeat(2000), "max").proof.textContent?.length, 2000);
    database.prepare("DELETE FROM expense_proofs WHERE source_id = 'max'").run();
    assert.throws(() => saveTextProof(database, 1, 999, "missing"), (error: unknown) => error instanceof ProofError && error.status === 404);

    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://example.com", "https://exa mple.com",
      "https://example.com/\u0000", "", `https://example.com/${"a".repeat(2000)}`]) {
      assert.throws(() => saveLinkProof(database, 1, expense.id, url), rejected, url);
    }
    const link = saveLinkProof(database, 1, expense.id, " https://example.com/receipt?id=1 ");
    assert.equal(link.proof.kind, "link");
    assert.equal(link.proof.textContent, "https://example.com/receipt?id=1");
    assert.equal(link.proof.mimeType, "text/uri-list");

    assert.deepEqual(readProof(database, 1, expense.id, text.proof.id, directory), { proof: text.proof, text: "Paid via BCA ref 123" });
    assert.equal(readProof(database, 1, expense.id, link.proof.id, directory).text, "https://example.com/receipt?id=1");
    assert.equal(readProof(database, 1, expense.id, link.proof.id, directory).bytes, undefined);

    const file = await saveProof(database, 1, expense.id, new File([png], "receipt.png", { type: "image/png" }), directory);
    assert.equal(file.proof.kind, "file");
    assert.equal(file.proof.textContent, undefined);
    assert.deepEqual(readProof(database, 1, expense.id, file.proof.id, directory).bytes, new Uint8Array(png));
    assert.equal(readProof(database, 1, expense.id, file.proof.id, directory).text, undefined);
    assert.equal(repository.list()[0].proofCount, 3);
    assert.throws(() => saveTextProof(database, 1, expense.id, "fourth"), (error: unknown) => error instanceof ProofError && error.status === 409);
    assert.throws(() => saveLinkProof(database, 1, expense.id, "https://example.com/4"), (error: unknown) => error instanceof ProofError && error.status === 409);
    await assert.rejects(saveProof(database, 1, expense.id, new File([png], "fourth.png", { type: "image/png" }), directory),
      (error: unknown) => error instanceof ProofError && error.status === 409);
    assert.deepEqual(listProofs(database, 1, expense.id).map((proof) => proof.kind).sort(), ["file", "link", "text"]);
    assert.equal(readdirSync(directory).length, 1);

    const deleted = repository.delete(expense.id);
    assert.ok(deleted);
    deleteProofFiles(deleted.proofs, directory);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON proof endpoint stores text and link proofs and serves them as safe text", async () => {
  const database = new Database(":memory:");
  try {
    initializeDatabase(database);
    const expense = createExpenseRepository(database, 1).create({ amountCents: 100, description: "Lunch", category: "Food", date: "2026-09-28T05:00:00.000Z" });
    const post = (body: unknown) => postProof(new Request("http://localhost", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), database, 1, String(expense.id));

    const created = await post({ kind: "text", text: "Cash, no receipt", sourceId: "s1" });
    assert.equal(created.status, 201);
    const { proof } = await created.json() as { proof: { id: string; kind: string } };
    assert.equal(proof.kind, "text");
    assert.equal((await post({ kind: "text", text: "Cash, no receipt", sourceId: "s1" })).status, 200);
    assert.equal((await post({ kind: "image", text: "x" })).status, 400);
    assert.equal((await post({ kind: "link", text: "javascript:alert(1)" })).status, 400);
    assert.equal((await post({ kind: "link" })).status, 400);
    assert.equal((await postProof(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }),
      database, 1, String(expense.id))).status, 400);
    const linked = await post({ kind: "link", text: "https://example.com/r" });
    assert.equal(linked.status, 201);
    const linkProof = (await linked.json() as { proof: { id: string } }).proof;

    const textResponse = getProofFile(database, 1, String(expense.id), proof.id);
    assert.equal(textResponse.headers.get("content-type"), "text/plain; charset=utf-8");
    assert.equal(textResponse.headers.get("x-content-type-options"), "nosniff");
    assert.match(textResponse.headers.get("content-security-policy") ?? "", /sandbox/);
    assert.equal(await textResponse.text(), "Cash, no receipt");
    const linkResponse = getProofFile(database, 1, String(expense.id), linkProof.id);
    assert.equal(linkResponse.headers.get("content-type"), "text/uri-list; charset=utf-8");
    assert.equal(await linkResponse.text(), "https://example.com/r");
  } finally { database.close(); }
});
