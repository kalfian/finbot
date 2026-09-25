export type CalendarExpense = {
  id: number;
  amountCents: number;
  description: string;
  category: string;
  date: string;
  createdAt: string;
};

function datePart(value: number): string {
  return String(value).padStart(2, "0");
}

/** Returns the browser-local calendar date for an expense instant or calendar cell. */
export function getLocalDateKey(dateTime: string | Date): string {
  const date = dateTime instanceof Date ? dateTime : new Date(dateTime);
  return `${date.getFullYear()}-${datePart(date.getMonth() + 1)}-${datePart(date.getDate())}`;
}

export function filterExpenses<T extends Pick<CalendarExpense, "description" | "category">>(
  expenses: readonly T[],
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [...expenses];

  return expenses.filter((expense) => (
    expense.description.toLocaleLowerCase().includes(normalizedQuery)
    || expense.category.toLocaleLowerCase().includes(normalizedQuery)
  ));
}

export function groupExpensesByLocalDate<T extends Pick<CalendarExpense, "date">>(
  expenses: readonly T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const expense of expenses) {
    const key = getLocalDateKey(expense.date);
    const group = groups.get(key);
    if (group) group.push(expense);
    else groups.set(key, [expense]);
  }
  return groups;
}

export function startOfLocalMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Builds Sunday-first cells, including leading blanks, for a local calendar month. */
export function buildCalendarDays(month: Date): Array<Date | null> {
  const firstDay = startOfLocalMonth(month);
  const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(firstDay.getFullYear(), firstDay.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftLocalMonth(month: Date, amount: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + amount, 1);
}
