export type DateRange = { start: Date; end: Date };
export type PeriodKind = "today" | "week" | "month" | "custom";

function localStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Inclusive local-calendar range; end is the start of the following day. */
export function periodRange(kind: PeriodKind, now = new Date(), custom?: DateRange): DateRange {
  if (kind === "custom" && custom && isValidRange(custom)) return custom;
  const end = new Date(localStart(now));
  end.setDate(end.getDate() + 1);
  if (kind === "today") return { start: localStart(now), end };
  if (kind === "week") {
    const start = localStart(now);
    start.setDate(start.getDate() - 6);
    return { start, end };
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
}

/** Returns the YYYY-MM key only when a range covers one complete calendar month. */
export function calendarMonthForRange(range: DateRange | undefined): string | undefined {
  if (!range || range.start.getDate() !== 1 || range.start.getHours() || range.start.getMinutes() || range.start.getSeconds() || range.start.getMilliseconds()) return undefined;
  const nextMonth = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 1);
  if (range.end.getTime() !== nextMonth.getTime()) return undefined;
  return `${range.start.getFullYear()}-${String(range.start.getMonth() + 1).padStart(2, "0")}`;
}

export function priorPeriod(range: DateRange): DateRange {
  const days = calendarDayDistance(range.start, range.end);
  const end = new Date(range.start);
  const start = new Date(range.start);
  start.setDate(start.getDate() - days);
  return { start, end };
}

export function dateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function rangeDays(range: DateRange): number {
  return Math.max(1, calendarDayDistance(range.start, range.end));
}

/** Parses a date input without accepting JavaScript's calendar overflow. */
export function dateInputRange(from: string, to: string): DateRange | undefined {
  const start = parseLocalDate(from);
  const inclusiveEnd = parseLocalDate(to);
  if (!start || !inclusiveEnd) return undefined;
  const end = new Date(inclusiveEnd);
  end.setDate(end.getDate() + 1);
  return isValidRange({ start, end }) ? { start, end } : undefined;
}

function parseLocalDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? date
    : undefined;
}

function calendarDayDistance(start: Date, end: Date): number {
  return Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);
}

function isValidRange(range: DateRange): boolean {
  return !Number.isNaN(range.start.getTime()) && !Number.isNaN(range.end.getTime()) && range.end > range.start;
}
