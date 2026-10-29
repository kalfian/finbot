import { dateKeyInZone, DEFAULT_TIMEZONE } from "./timezone";
import type { CalendarExpense } from "./expense-calendar";

/** tag matches one tag name case-insensitively; untagged keeps only expenses without any tag. */
export type ReportFilter = { query: string; start: string; end: string; timezone?: string; tag?: string; untagged?: boolean };

export function matchesTagFilter(tags: readonly string[] | undefined, tag = "", untagged = false): boolean {
  if (untagged && tags?.length) return false;
  const wanted = tag.trim().replace(/^#+/, "").toLocaleLowerCase();
  return !wanted || !!tags?.some((name) => name.toLocaleLowerCase() === wanted);
}

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function validateReportRange(start: string, end: string): boolean {
  return (!start || validDate(start)) && (!end || validDate(end)) && (!start || !end || start <= end);
}

export function jakartaDateKey(value: string): string {
  return dateKeyInZone(value, DEFAULT_TIMEZONE);
}

export function filterReportExpenses<T extends CalendarExpense>(expenses: readonly T[], filter: ReportFilter): T[] {
  if (!validateReportRange(filter.start, filter.end)) return [];
  const query = filter.query.trim().toLocaleLowerCase();
  return expenses.filter((expense) => {
    const key = dateKeyInZone(expense.date, filter.timezone ?? DEFAULT_TIMEZONE);
    return (!filter.start || key >= filter.start) && (!filter.end || key <= filter.end)
      && matchesTagFilter(expense.tags, filter.tag, filter.untagged)
      && (!query || expense.description.toLocaleLowerCase().includes(query) || expense.category.toLocaleLowerCase().includes(query)
        || !!expense.tags?.some((name) => name.toLocaleLowerCase().includes(query)));
  });
}
