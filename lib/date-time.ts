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
