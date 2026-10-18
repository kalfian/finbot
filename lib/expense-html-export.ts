import { formatExpenseDate } from "./date-time";
import { EXPENSE_RECORDER_DESIGN_CSS } from "./expense-recorder-design";
import { formatCurrency } from "./money";

export type HtmlExportExpense = { id: number; amountCents: number; description: string; category: string; date: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] as string);
}

function displayDate(date: string): string {
  try { return formatExpenseDate(date); } catch { return date; }
}

/** Creates an offline snapshot that uses the recorder's visual tokens and active filters. */
export function createExpenseHtmlExport(expenses: readonly HtmlExportExpense[], filterSummary = "No filters active"): string {
  const totalCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);
  const rows = expenses.length
    ? expenses.map((expense) => `<li><div><strong>${escapeHtml(expense.description)}</strong><span>${escapeHtml(expense.category)} &middot; ${escapeHtml(displayDate(expense.date))}</span></div><b>${escapeHtml(formatCurrency(expense.amountCents))}</b></li>`).join("")
    : "<li class=\"empty\">No expenses match these filters.</li>";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Expense tracker export</title><style>${EXPENSE_RECORDER_DESIGN_CSS}</style></head><body><main class="expense-page export-page"><section class="recent-card" aria-labelledby="export-list-heading"><div class="recent-heading"><div><h1>Expense tracker</h1><p>Capture it now, then get back to your day.</p></div></div><p class="filter-summary">${escapeHtml(filterSummary)}</p><section class="totals" aria-label="Export totals"><div><span>Results</span><strong>${expenses.length} ${expenses.length === 1 ? "expense" : "expenses"}</strong></div><div><span>Total</span><strong>${escapeHtml(formatCurrency(totalCents))}</strong></div></section><section aria-labelledby="export-list-heading"><h2 id="export-list-heading">Recent expenses</h2><ul class="expense-list">${rows}</ul></section></section></main></body></html>`;
}
