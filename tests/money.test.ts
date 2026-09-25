import assert from "node:assert/strict";
import test from "node:test";

import { calculateTotal, formatCurrency, toAmountCents } from "../lib/money";

test("toAmountCents accepts valid dollar and cent inputs", () => {
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

test("formatCurrency formats cents as US dollars", () => {
  assert.equal(formatCurrency(0), "$0.00");
  assert.equal(formatCurrency(123), "$1.23");
  assert.equal(formatCurrency(123456), "$1,234.56");
});

test("calculateTotal sums UI expense amounts", () => {
  assert.equal(calculateTotal([]), 0);
  assert.equal(calculateTotal([1250, 4500, 1999]), 7749);
});
