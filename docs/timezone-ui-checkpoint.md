# Timezone and UI refinement checkpoint

## Scope and plan
- Base: master 9c68577, initially clean. User requests an audit plus improved UI/motion and an account timezone used consistently by daily/weekly/monthly usage, REST and MCP. Financial timestamps remain UTC.
- Phase 1: audit, shared timezone/calendar primitives, user preference persistence, regression tests, REST/MCP/report integration.
- Phase 2: visible day/week/month usage controls, timezone settings, more compact and consistent interface, intuitive mobile navigation and purposeful motion with reduced-motion support. Restore the original simple sans-serif font, as clarified by the user.
- Phase 3: unit/API/MCP and isolated browser verification, DST and cross-account boundaries, screenshots and docs. No deployment or live financial data changes.

## Audit findings
- Temporal inconsistency: budget/filter/PDF use Asia/Jakarta while overview and calendar use the device timezone; no weekly usage view.
- Mobile navigation clips additional destinations into a horizontal strip; important actions are hard to discover.
- Oversized heading/hero and repeated receipt links make the transaction list unnecessarily tall.
- Secondary account/calendar/integrations pages use a different visual system from the dashboard.
- Feedback/motion is mostly initial entrance; filter refresh removes the list instead of preserving context.

## Decisions
- Account preference defaults to Asia/Jakarta to preserve existing API/MCP semantics. Accept valid named IANA timezones (including UTC), store only that preference, and never rewrite expense timestamps.
- Weeks run Monday through Sunday. Calendar date comparisons in the selected timezone handle DST and month/year boundaries without assuming 24-hour local days.
- REST settings/usage and MCP equivalents use the authenticated user's preference. Existing budget/list/summary/PDF flows use that same preference.
- Entry fields remain explicitly device-local and are converted to UTC by existing validation; timezone preference changes display/grouping only, not stored instants.

## Progress
- Phases 1, 2 and 3 complete; final checks and screenshots recorded below.

## Phase 1 checkpoint
- Added per-user user_settings.timezone (Asia/Jakarta default) without changing expense rows. Shared Intl calendar-date grouping supports DST, fractional offsets, year/month boundaries and Monday-based weeks.
- GET/PUT /api/v1/settings and GET /api/v1/usage added with existing auth/ownership/same-origin gates. Budget snapshots add timezone/week fields; expense filters, PDF, calendar, HTML and MCP use the preference. MCP adds get_settings, set_timezone, usage_summary.
- Regression suite now 72 tests; all passed, including UTC immutability, cross-user settings, DST and API/MCP contract checks.

## Phase 2 checkpoint
- Added period switch/reference date and timezone badge/settings with live preview. Menu on mobile opens all destinations. Common shell/palette now covers calendar/account/integrations/users/docs. Original Inter / Helvetica Neue / Arial sans-serif stack restored after user clarification.
- Added hover/press/focus feedback, period value/dialog/menu/toast entrance motion, preserved rows during refresh, category-click filters and reduced-motion handling.
- Browser E2E passed timezone persistence and UTC-boundary regrouping, account isolation, responsive layouts and existing CRUD/keyboard/export workflows.
- Visual inspection found a real dark-theme contrast issue caused by the prior inline stylesheet overriding newer styles. Moved the base stylesheet to a CSS cascade layer; added targeted contrast regression assertions before final verification.

## Phase 3 checkpoint - complete
- Worktree: /home/kalfian/developments/finbot, branch master, base revision 9c68577. Changes remain local and uncommitted; no deployment.
- Final original sans-serif stack verified visually on desktop, dark mode, mobile, calendar and integrations. Refreshed all README screenshots, including timezone settings, using synthetic records in a disposable database.
- Checks (all exit 0): npm test (72/72); npm run lint; npx tsc --noEmit; npm run build; PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/home/kalfian/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome node tests/auth.e2e.mjs; production tests/integration-smoke.mjs with disposable TEST_BASE_URL/TEST_PDF_PATH; git diff --check.
- HTTP smoke discovers all 18 MCP tools and compares REST/MCP usage after setting America/Los_Angeles. Existing JWT/generated tokens, PDF and cross-user isolation checks pass.
- Evidence logs: /tmp/finbot-timezone-{tests,lint,types,build,browser,screenshots}.log and /tmp/finbot-integration-http.log. Screenshot artifacts: docs/images/ledger-{desktop-light,desktop-dark,mobile,composer,timezone}.png.
- Changed areas: shared timezone/settings/usage libraries and schema; REST settings/usage/expenses/PDF; MCP/budget/filter/export/calendar integrations; dashboard/shared shell/settings/motion; regression tests; README and API/product/agent documentation.
- Limitations: no live financial database migration or production deployment was performed. Usage scans the account snapshot; high-volume performance was not benchmarked. Entry datetime remains device-local as explicitly labeled.
- Next bounded action: owner visual review of README screenshots and the local diff before release.

## Lesson candidates
1. Trigger: dark controls failed visual contrast review. Cause: inline base CSS overrode the refinement stylesheet. Better action: put shared base CSS in a cascade layer and test contrast on actual controls. Verification: browser contrast assertions pass. Scope: Finbot UI styles.
2. Trigger: user clarified the old font. Cause: preserving the immediately preceding redesign did not preserve the pre-redesign typography they intended. Better action: resolve the reference against Git history and record the exact stack. Verification: original Inter / Helvetica Neue / Arial sans-serif restored and screenshots inspected. Scope: this user's Finbot design preference.

## Punk Records handoff - NOT SAVED
HomeOps tools are unavailable in this resumed session. No live vault files were written. Apply the following addition to references/financial-tracker-project.md only after reading its current version through HomeOps; also link/journal the outcome according to vault-protocol.md.

```diff
+## Finbot timezone and UI refinement - 2026-10-18
+- User clarification: preserve the pre-redesign simple sans-serif stack (Inter, Helvetica Neue, Arial, sans-serif); do not use the redesign's Manrope/DM Serif typography.
+- Local master changes add per-user IANA timezone settings (default Asia/Jakarta) and daily/Monday-based weekly/monthly usage consistently across UI, REST and MCP. Stored expense timestamps remain UTC; entry stays device-local and is labeled.
+- UI refinement includes responsive navigation, consistent secondary-page surfaces, motion with reduced-motion support and corrected dark-control contrast using a base CSS cascade layer.
+- Verification: 72 unit tests, lint, types, build, browser E2E and disposable production HTTP REST/MCP/PDF/isolation checks passed. README screenshots updated with synthetic data. Changes are uncommitted and not deployed.
+- Checkpoint: /home/kalfian/developments/finbot/docs/timezone-ui-checkpoint.md. Recheck Git/deployment state live before acting on this historical handoff.
```
