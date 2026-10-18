import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { initializeDatabase } from "../lib/database";
import { createUserRepository } from "../lib/auth";
import { createExpenseRepository } from "../lib/expenses";
import { getUserSettings, setUserTimezone } from "../lib/user-settings";
import { usageSnapshot } from "../lib/usage";
import { dateKeyInZone, usagePeriods, validateTimezone } from "../lib/timezone";

test("timezone validation accepts named zones and rejects invalid input", () => {
  assert.equal(validateTimezone("Asia/Jakarta"), "Asia/Jakarta");
  assert.equal(validateTimezone("UTC"), "UTC");
  for (const value of ["Mars/Olympus", "", "+07:00", null, 7])
    assert.equal(validateTimezone(value), null);
});
test("calendar periods cross years and Monday boundaries without local clock arithmetic", () => {
  assert.deepEqual(usagePeriods("2026-01-01").week, {
    start: "2025-12-29",
    end: "2026-01-04",
  });
  assert.deepEqual(usagePeriods("2024-02-29").month, {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(
    dateKeyInZone("2026-01-01T00:30:00.000Z", "America/Los_Angeles"),
    "2025-12-31",
  );
});
test("usage respects DST, per-user timezone, and never rewrites UTC dates", () => {
  const db = new Database(":memory:");
  try {
    initializeDatabase(db);
    initializeDatabase(db);
    const other = createUserRepository(db).create(
      "timezone-user",
      "temporary123",
    );
    const repo = createExpenseRepository(db, 1);
    const dates = [
      "2026-03-08T04:59:59.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T03:59:59.000Z",
      "2026-03-09T04:00:00.000Z",
    ];
    dates.forEach((date, i) =>
      repo.create({
        amountCents: (i + 1) * 100,
        description: "Boundary",
        category: "Food",
        date,
      }),
    );
    const before = repo.list();
    assert.equal(getUserSettings(db, 1).timezone, "Asia/Jakarta");
    setUserTimezone(db, 1, "America/New_York");
    const usage = usageSnapshot(db, 1, "2026-03-08");
    assert.equal(usage.day.totalCents, 500);
    assert.equal(usage.day.transactionCount, 2);
    assert.equal(usage.week.totalCents, 600);
    assert.equal(usage.month.totalCents, 1000);
    assert.equal(getUserSettings(db, other.id).timezone, "Asia/Jakarta");
    assert.equal(usageSnapshot(db, other.id, "2026-03-08").month.totalCents, 0);
    setUserTimezone(db, 1, "UTC");
    assert.equal(usageSnapshot(db, 1, "2026-03-08").day.totalCents, 300);
    assert.deepEqual(repo.list(), before);
    assert.throws(() => setUserTimezone(db, 1, "invalid"));
    assert.equal(getUserSettings(db, 1).timezone, "UTC");
  } finally {
    db.close();
  }
});
test("fall-back repeated hour belongs to one local day and fractional-offset zones work", () => {
  assert.equal(
    dateKeyInZone("2026-11-01T05:30:00.000Z", "America/New_York"),
    "2026-11-01",
  );
  assert.equal(
    dateKeyInZone("2026-11-01T06:30:00.000Z", "America/New_York"),
    "2026-11-01",
  );
  assert.equal(
    dateKeyInZone("2026-10-17T18:15:00.000Z", "Asia/Kathmandu"),
    "2026-10-18",
  );
});
