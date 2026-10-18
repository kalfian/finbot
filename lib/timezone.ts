export const DEFAULT_TIMEZONE = "Asia/Jakarta";

export function validateTimezone(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 100 ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)
  )
    return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

export function dateKeyInZone(
  value: string | Date,
  timezone = DEFAULT_TIMEZONE,
): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (name: string) =>
    parts.find((item) => item.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shiftDateKey(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function usagePeriods(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const monday = shiftDateKey(date, -((value.getUTCDay() + 6) % 7));
  const monthEnd = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  return {
    day: { start: date, end: date },
    week: { start: monday, end: shiftDateKey(monday, 6) },
    month: { start: `${date.slice(0, 7)}-01`, end: monthEnd },
  };
}

export type UsageRecord = {
  amountCents: number;
  date: string;
  category: string;
};
export function summarizeUsage(
  records: readonly UsageRecord[],
  timezone: string,
  at = new Date().toISOString(),
) {
  const date = dateKeyInZone(at, timezone);
  const periods = usagePeriods(date);
  const dated = records.map((record) => ({
    record,
    key: dateKeyInZone(record.date, timezone),
  }));
  const summarize = (range: { start: string; end: string }) => {
    const selected = dated.filter(
      ({ key }) => key >= range.start && key <= range.end,
    );
    const totalCents = selected.reduce(
      (sum, { record }) => sum + record.amountCents,
      0,
    );
    const groups = new Map<
      string,
      {
        category: string;
        totalCents: number;
        transactionCount: number;
        percentage: number;
      }
    >();
    for (const { record } of selected) {
      const group = groups.get(record.category) ?? {
        category: record.category,
        totalCents: 0,
        transactionCount: 0,
        percentage: 0,
      };
      group.totalCents += record.amountCents;
      group.transactionCount++;
      groups.set(record.category, group);
    }
    const categories = [...groups.values()].sort(
      (a, b) => b.totalCents - a.totalCents,
    );
    for (const category of categories)
      category.percentage = totalCents
        ? (category.totalCents / totalCents) * 100
        : 0;
    return {
      ...range,
      totalCents,
      transactionCount: selected.length,
      categories,
    };
  };
  return {
    timezone,
    date,
    weekStartsOn: "monday" as const,
    day: summarize(periods.day),
    week: summarize(periods.week),
    month: summarize(periods.month),
  };
}
export type UsageSnapshot = ReturnType<typeof summarizeUsage>;
