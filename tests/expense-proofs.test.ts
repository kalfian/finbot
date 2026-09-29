import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createExpenseRepository } from "../lib/expenses";
import { listProofs, ProofError, readProof, saveProof } from "../lib/expense-proofs";
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
