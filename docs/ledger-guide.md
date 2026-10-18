# Ledger guide

## Dashboard

Overview shows local-month spending, today's spending, transaction count and actual category shares. Search/category/date/amount filters apply to the transaction list and HTML export, not overview totals. Eight records appear per page. Clearing/changing filters resets pagination; deleting the last page returns to a valid page.

Add expense opens a dialog. Choose an amount, description, one of your account's categories, and date/time. Category creation is available in the dialog; renaming/deleting unused categories is available in Integrations. Failed saves retain the draft. Edit updates the selected record through REST v1.

Deletion requires confirmation. Proof bytes and integration source mappings are permanently removed. Undo is offered only when the deleted record had no proofs; it creates a replacement ID without restoring source mappings.

## Proofs, calendar and PDF

Open Add proof on a transaction row to attach receipts or view existing files. Calendar & reports retains upload-at-entry and retry after partial proof failure. Up to three supported image/PDF files per record, 5 MiB each.

Calendar groups all your records by browser-local date. Select a date to inspect/edit/delete that day's expenses. Its search/date filters affect its list and PDF, while calendar markers show all activity. PDF date filters use inclusive Asia/Jakarta days. Dashboard HTML export instead follows all dashboard filters and includes every matching page.

## Accounts and integrations

Account opens password settings and logout. Users is visible only to administrators. Integrations provides user-owned category management, a recurring monthly spending limit, and generated API tokens. The [MCP guide](mcp-end-to-end.md) describes external agent workflows.

Prototype CSV/rule/tag/split and recurring-plan APIs are not part of the current upstream model.
