import type { CalendarExpense } from "./expense-calendar";

export type ReportFilter = { query: string; start: string; end: string };

export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
    && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function validateReportRange(start: string, end: string): boolean {
  return (!start || validDate(start)) && (!end || validDate(end)) && (!start || !end || start <= end);
}

export function jakartaDateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Jakarta",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function filterReportExpenses<T extends CalendarExpense>(expenses: readonly T[], filter: ReportFilter): T[] {
  if (!validateReportRange(filter.start, filter.end)) return [];
  const query = filter.query.trim().toLocaleLowerCase();
  return expenses.filter((expense) => {
    const key = jakartaDateKey(expense.date);
    return (!filter.start || key >= filter.start) && (!filter.end || key <= filter.end)
      && (!query || expense.description.toLocaleLowerCase().includes(query) || expense.category.toLocaleLowerCase().includes(query));
  });
}
