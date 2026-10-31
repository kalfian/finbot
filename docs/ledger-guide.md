# Ledger guide

## Dashboard

Overview offers Day/Week/Month usage with a reference date, transaction count and actual category shares. All periods follow your saved timezone. Search/category/date/amount filters apply to the transaction list and HTML export, not overview totals. Eight records appear per page. Clearing/changing filters resets pagination; deleting the last page returns to a valid page.

Add expense opens a dialog. Choose an amount, description, one of your account's categories, and date/time. Category creation is available in the dialog; renaming/deleting unused categories is available in Integrations. Failed saves retain the draft. Edit updates the selected record through REST v1. Optional tags (for example a trip name) sit below category; choosing a tag filter, or clicking a tag on a row, shows a tag summary with total, transactions, date span, per-category and per-day spend, plus a PDF download for that tag. "No tag" lists untagged expenses. Tags are renamed or deleted in Integrations; deleting a tag keeps its expenses.

Deletion requires confirmation. Proofs and integration source mappings are permanently removed. Undo is offered only when the deleted record had no proofs; it creates a replacement ID without restoring source mappings.

## Proofs, calendar and PDF

Open Add proof on a transaction row to add a text proof (1-2000 characters, e.g. a transfer reference) or view existing proofs. Proofs are text-only; up to three per record. Proofs from earlier versions that were files are shown as legacy entries.

Calendar groups all your records by date in your saved timezone. Select a date to inspect/edit/delete that day's expenses. Its search/date filters affect its list and PDF, while calendar markers show all activity. PDF date filters use inclusive calendar days in that timezone. Dashboard HTML export instead follows all dashboard filters and includes every matching page.

## Accounts and integrations

Account opens password settings and logout. Users is visible only to administrators. Integrations provides user-owned category management, a recurring monthly spending limit, and generated API tokens. The [MCP guide](mcp-end-to-end.md) describes external agent workflows.

Prototype CSV/rule/tag/split and recurring-plan APIs are not part of the current upstream model.

Use the dashboard timezone badge or Account → Timezone to change the display timezone. Weeks run Monday-Sunday. The preference is per user; timestamps remain UTC. Expense entry remains device-local and is labeled accordingly.
