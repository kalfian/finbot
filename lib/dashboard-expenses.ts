import { dateKeyInZone, DEFAULT_TIMEZONE } from "./timezone";
import type { Expense } from "./expenses";

export type CategorySummary = {
  category: string;
  totalCents: number;
  transactionCount: number;
  percentage: number;
};

/** Derive the dashboard from the authenticated REST v1 snapshot, before pagination. */
export function queryDashboardExpenses(
  records: readonly Expense[],
  params: URLSearchParams,
  timezone = DEFAULT_TIMEZONE,
) {
  const search = (params.get("search") ?? "").toLocaleLowerCase();
  const category = params.get("category");
  const start = params.get("start");
  const end = params.get("end");
  const from = params.get("from");
  const to = params.get("to");
  const minimum = params.get("minAmountCents");
  const maximum = params.get("maxAmountCents");
  const matches = records.filter(
    (item) =>
      (!search ||
        `${item.description} ${item.category}`
          .toLocaleLowerCase()
          .includes(search)) &&
      (!category || item.category === category) &&
      (!from || dateKeyInZone(item.date,timezone) >= from) &&
      (!to || dateKeyInZone(item.date,timezone) <= to) &&
      (!start || Date.parse(item.date) >= Date.parse(start)) &&
      (!end || Date.parse(item.date) < Date.parse(end)) &&
      (minimum === null || item.amountCents >= Number(minimum)) &&
      (maximum === null || item.amountCents <= Number(maximum)),
  );
  const totalCents = matches.reduce((sum, item) => sum + item.amountCents, 0);
  const groups = new Map<string, CategorySummary>();
  for (const item of matches) {
    const group = groups.get(item.category) ?? {
      category: item.category,
      totalCents: 0,
      transactionCount: 0,
      percentage: 0,
    };
    group.totalCents += item.amountCents;
    group.transactionCount += 1;
    groups.set(item.category, group);
  }
  const categories = [...groups.values()].sort(
    (a, b) => b.totalCents - a.totalCents,
  );
  for (const group of categories)
    group.percentage = totalCents ? (group.totalCents / totalCents) * 100 : 0;
  const offset = Math.max(0, Number(params.get("offset") ?? 0));
  const limit = Math.max(0, Number(params.get("limit") ?? matches.length));
  return {
    expenses: matches.slice(offset, offset + limit),
    totalCount: matches.length,
    summary: { totalCents, transactionCount: matches.length },
    insights: { categories },
  };
}
