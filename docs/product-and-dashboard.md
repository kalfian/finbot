# Product and dashboard

Ledger is a focused personal expense tracker with IDR amounts, selectable light/dark themes, and password-protected access. Financial records stay in the configured SQLite database.

## Layout and navigation

The dashboard uses a desktop navigation rail and compact mobile navigation for Overview and Transactions. A cobalt monthly spending card leads the overview, with today's spending, the monthly transaction count, and a category breakdown calculated from actual monthly totals. Smaller screens stack these sections. Warm light and deep teal dark palettes share locally served Manrope and DM Serif Display typography.

The shell contains theme and Account controls plus Calendar & reports, Integrations, and administrator-only Users links. Account opens password settings and logout. The focused overview stays simple; the separate Calendar & reports page retains receipt entry, calendar and PDF export. Integrations manages monthly limits and tokens.

## Recording

Add expense opens a focused dialog that prioritizes amount and description. Categories come from the signed-in user's REST v1 category list. Category buttons wrap; custom category creation and date/time controls are separate disclosures. Date shortcuts support Now and Yesterday. Enter submits, and the submit button shows Saving while the request is pending. Opening the page does not automatically focus an input or open the phone keyboard.

Editing opens the same dialog with the selected record. Failed saves retain the draft for retry. Deletion requires confirmation, then offers Undo. For expenses without proofs, Undo creates a replacement record with a new ID and creation time, without restoring source mappings. Expenses with proofs display a permanent-delete warning and do not offer Undo.

## Reviewing expenses

Recent expenses show description, category, date, amount, and edit/delete actions. Filters support description search, category, date range, and minimum/maximum amounts. Search and category selection stay visible; date and amount filters expand on demand. Clearing or changing filters resets pagination. Stale search responses cannot replace newer results. Previous/Next controls show eight expenses per page; an empty last page returns to the preceding available page.

The empty state distinguishes an unused ledger from filters with no matches. Download HTML includes all matching pages and shares the dashboard's visual tokens, with a standalone layout suitable for offline viewing.

## Accessibility and verification

Visible labels, selected-category states, keyboard focus indicators, live feedback, and reduced-motion preferences are supported. Mobile layouts preserve touch targets and allow category controls to wrap. Composer, Account, and deletion dialogs use native modal semantics, cycle keyboard focus within their visible controls, support Escape when idle, and restore focus to their opener.

The dashboard derives summaries and pagination from the authenticated REST v1 snapshot. Account isolation is enforced by the retained upstream backend.

The browser smoke test uses an isolated database and checks authentication, CRUD/undo, failed-save recovery, custom categories, export, filters, stale responses, pagination, modal keyboard behavior, theme changes, and horizontal clipping at desktop/tablet/phone widths. See `tests/auth.e2e.mjs`; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using a separately provisioned Chromium binary.
