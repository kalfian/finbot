export function formatCreatedAt(
  createdAt: string,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(createdAt));
}

export function formatExpenseDate(
  date: string,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return formatCreatedAt(date, locale, timeZone);
}
