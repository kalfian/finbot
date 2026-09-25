import assert from "node:assert/strict";
import test from "node:test";

import { formatCreatedAt } from "../lib/date-time";
import { calculateTotal, formatCurrency, toAmountCents } from "../lib/money";

test("toAmountCents accepts valid Rupiah inputs", () => {
  assert.equal(toAmountCents("1"), 100);
  assert.equal(toAmountCents("1.2"), 120);
  assert.equal(toAmountCents("1.23"), 123);
  assert.equal(toAmountCents("999999.99"), 99999999);
});

test("toAmountCents rejects invalid money inputs", () => {
  for (const value of ["", "0", "0.00", "-1", ".50", "1.", "1.234", "1,000", " 1.00 "]) {
    assert.equal(toAmountCents(value), null, value);
  }
});

test("formatCurrency formats cents as Indonesian Rupiah", () => {
  assert.equal(formatCurrency(0), "Rp\u00a00,00");
  assert.equal(formatCurrency(123), "Rp\u00a01,23");
  assert.equal(formatCurrency(123456), "Rp\u00a01.234,56");
  assert.doesNotMatch(formatCurrency(123), /\$/);
});

test("formatCreatedAt converts a UTC ISO timestamp to the requested local timezone", () => {
  const createdAt = "2026-06-15T00:34:00.000Z";

  assert.equal(formatCreatedAt(createdAt, "en-GB", "Asia/Jakarta"), "15 Jun 2026, 07:34");
  assert.equal(formatCreatedAt(createdAt, "en-GB", "America/Los_Angeles"), "14 Jun 2026, 17:34");
});

test("calculateTotal sums UI expense amounts", () => {
  assert.equal(calculateTotal([]), 0);
  assert.equal(calculateTotal([1250, 4500, 1999]), 7749);
});
