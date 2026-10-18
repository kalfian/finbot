import assert from "node:assert/strict";
import test from "node:test";

import { calendarMonthForRange, dateInputRange, dateInputValue, periodRange, priorPeriod, rangeDays } from "../lib/periods";

test("period helpers use local calendar boundaries and reject impossible custom dates", () => {
  const now = new Date(2026, 2, 15, 12);
  const week = periodRange("week", now);
  assert.equal(dateInputValue(week.start), "2026-03-09");
  assert.equal(dateInputValue(week.end), "2026-03-16");
  assert.equal(rangeDays(week), 7);
  assert.equal(dateInputRange("2026-02-30", "2026-03-01"), undefined);
  assert.equal(dateInputRange("2026-03-02", "2026-03-01"), undefined);
});

test("prior periods shift calendar boundaries without DST-duration drift", () => {
  const range = dateInputRange("2026-03-07", "2026-03-09");
  assert.ok(range);
  const prior = priorPeriod(range);
  assert.equal(dateInputValue(prior.start), "2026-03-04");
  assert.equal(dateInputValue(prior.end), "2026-03-07");
  assert.equal(rangeDays(prior), 3);
});

test("calendar month detection excludes partial, multi-month, and non-month report scopes", () => {
  const completeMonth = periodRange("month", new Date(2026, 1, 14, 12));
  assert.equal(calendarMonthForRange(completeMonth), "2026-02");
  assert.equal(calendarMonthForRange(periodRange("today", new Date(2026, 1, 14, 12))), undefined);
  assert.equal(calendarMonthForRange(dateInputRange("2026-02-02", "2026-02-28")), undefined);
  assert.equal(calendarMonthForRange(dateInputRange("2026-02-01", "2026-03-01")), undefined);
});
