/** Shared visual foundation for the dashboard and standalone HTML export. */
export const EXPENSE_RECORDER_DESIGN_CSS = `
@layer ledger-base {
:root { --canvas: #f5f5ef; --panel: #ffffff; --panel-raised: #ebeee8; --primary-text: #202c2b; --muted-text: #63716e; --line: #dce2d9; --line-strong: #a1afa8; --accent: #284fc8; --accent-soft: #e9eeff; --error: #b13b37; --success: #28634e; --focus-ring: #466be0; --font-ui: Inter, "Helvetica Neue", Arial, sans-serif; --font-display: var(--font-ui); --font-technical: "SFMono-Regular", Consolas, monospace; color-scheme: light; }
:root[data-theme="dark"] { --canvas: #101b1d; --panel: #172629; --panel-raised: #213539; --primary-text: #edf2e7; --muted-text: #a3b6b4; --line: #304448; --line-strong: #597376; --accent: #a5baff; --accent-soft: #273b57; --error: #ffaaa0; --success: #a0d8bc; --focus-ring: #a5baff; color-scheme: dark; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 24px; background: var(--canvas); }
body { min-width: 320px; margin: 0; color: var(--primary-text); background: var(--canvas); font-family: var(--font-ui); font-size: 14px; -webkit-font-smoothing: antialiased; }
button, input, select { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 9px; min-height: 44px; padding: 11px 18px; border: 1px solid transparent; border-radius: 12px; background: var(--accent); color: white; font-weight: 700; cursor: pointer; transition: background .16s, transform .16s; }
[data-theme="dark"] button:not(.secondary-button):not(.text-button):not(.icon-button):not(.rail-control):not(.category-button) { color: #152953; }
button:hover:not(:disabled) { filter: brightness(.95); }
button:active:not(:disabled) { transform: translateY(1px); }
button:disabled { opacity: .55; cursor: not-allowed; }
button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, a:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 3px; }
input, select { min-width: 0; width: 100%; min-height: 48px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--canvas); color: var(--primary-text); font-weight: 500; }
input::placeholder { color: var(--muted-text); opacity: .85; }
label { display: grid; gap: 8px; font-size: .8rem; font-weight: 700; }
label small { color: var(--muted-text); font-weight: 400; line-height: 1.6; }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 10px; font-family: var(--font-display); font-size: clamp(2.5rem, 4.2vw, 3.8rem); font-weight: 400; letter-spacing: -.045em; line-height: 1.08; }
h2 { font-size: 1.25rem; letter-spacing: -.035em; margin-bottom: 0; }
h3 { font-size: 1rem; }
a { color: inherit; }
svg { flex-shrink: 0; }
.eyebrow { color: var(--muted-text); font-size: .65rem; font-weight: 800; letter-spacing: .15em; margin-bottom: 12px; }
.muted { color: var(--muted-text); line-height: 1.65; }
.secondary-button { border-color: var(--line); background: var(--panel); color: var(--primary-text); }
.icon-button { width: 44px; padding: 10px; border-color: transparent; color: var(--muted-text); background: transparent; }
.icon-button:hover { background: var(--panel-raised); color: var(--primary-text); }
.text-button { min-height: 44px; padding: 8px; background: transparent; color: var(--accent); font-size: .8rem; }
.delete-button { color: var(--error); }
.ledger-workspace { max-width: 1360px; margin: 0 auto; padding: 40px clamp(24px, 4vw, 64px) 64px; }
.workspace-topline { display: flex; justify-content: space-between; align-items: center; gap: 16px; color: var(--muted-text); font-size: .72rem; margin-bottom: 40px; }
.workspace-topline span:first-child { display: inline-flex; align-items: center; gap: 8px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #6a927a; }
.overview-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.overview-heading p:last-child { color: var(--muted-text); line-height: 1.7; margin: 0; }
.overview-heading button { flex-shrink: 0; }
.overview-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(280px, 1fr); gap: 24px; margin-bottom: 40px; }
.spending-hero { position: relative; overflow: hidden; isolation: isolate; background: #284ac4; color: #fff; border-radius: 24px; padding: 30px; min-height: 310px; display: flex; flex-direction: column; }
.spending-hero::after { content: ""; z-index: -1; position: absolute; width: 340px; height: 340px; border: 1px solid #ffffff18; border-radius: 50%; top: -130px; right: -120px; box-shadow: 0 0 0 42px #ffffff05, 0 0 0 84px #ffffff04, 0 0 0 126px #ffffff03; }
.hero-label { display: flex; justify-content: space-between; align-items: center; color: #e2e8ff; font-size: .8rem; }
.hero-label span:last-child { border: 1px solid #ffffff40; border-radius: 7px; padding: 5px 8px; font-size: .62rem; letter-spacing: .08em; }
.hero-amount { font-family: var(--font-display); font-size: clamp(2.4rem, 4.1vw, 4.3rem); line-height: 1.15; letter-spacing: -.035em; margin: 28px 0 12px; overflow-wrap: anywhere; }
.hero-caption { color: #dce4ff; font-size: .73rem; margin-bottom: 26px; }
.hero-footer { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; margin-top: auto; border-top: 1px solid #ffffff35; padding-top: 20px; }
.hero-footer span { display: block; color: #dce4ff; font-size: .7rem; margin-bottom: 6px; }
.hero-footer strong { font-size: 1.05rem; font-weight: 600; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.breakdown { border: 1px solid var(--line); background: var(--panel); border-radius: 24px; padding: 28px; min-width: 0; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.section-heading > span { color: var(--muted-text); font-size: .7rem; }
.mix-bar { display: flex; gap: 4px; height: 9px; margin: 24px 0 20px; border-radius: 4px; overflow: hidden; background: var(--panel-raised); }
.mix-bar span { min-width: 2px; }
.breakdown-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.breakdown-list li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 9px; align-items: center; font-size: .75rem; }
.breakdown-list i { height: 7px; width: 7px; border-radius: 50%; }
.breakdown-list strong { font-weight: 600; font-variant-numeric: tabular-nums; }
.breakdown-list span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.breakdown-empty { margin: 30px 0; color: var(--muted-text); font-size: .85rem; line-height: 1.8; }
.transactions-panel { scroll-margin-top: 24px; }
.transactions-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.transactions-heading h2 { font-size: 1.4rem; }
.transactions-heading p { margin: 7px 0 0; font-size: .75rem; color: var(--muted-text); }
.transaction-toolbar { display: flex; align-items: center; gap: 12px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 16px; }
.search-field { position: relative; flex: 1; min-width: 0; }
.search-field svg { position: absolute; left: 12px; top: 14px; color: var(--muted-text); }
.search-field input { padding-left: 40px; border-color: transparent; background: transparent; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.filter-details { margin-top: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 0 16px; background: var(--panel); }
.filter-details summary { min-height: 44px; display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: .75rem; font-weight: 700; }
.filter-details summary span { margin-left: auto; color: var(--muted-text); font-weight: 400; font-size: .7rem; overflow-wrap: anywhere; }
.filter-details summary::after { content: "+"; margin-left: 8px; font-size: 1.2rem; font-weight: 400; }
.filter-details[open] summary::after { content: "-"; }
.filter-fields { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; padding: 16px 0; }
.filter-actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 0 12px; color: var(--muted-text); font-size: .72rem; }
.filter-actions > span { overflow-wrap: anywhere; }
.ledger-list { list-style: none; margin: 18px 0 0; padding: 0; }
.ledger-row { display: grid; grid-template-columns: 44px minmax(0, 1fr) minmax(100px, .65fr) auto 88px; align-items: center; gap: 16px; padding: 18px 8px; border-bottom: 1px solid var(--line); }
.category-avatar { display: grid; place-items: center; height: 44px; width: 44px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); }
.ledger-row[data-category="Food"] .category-avatar { background: #eeeadb; color: #85632c; }
.ledger-row[data-category="Transport"] .category-avatar { background: #e0ece6; color: #316b54; }
.ledger-row[data-category="Shopping"] .category-avatar { background: #ece4ed; color: #785c76; }
.ledger-row[data-category="Bills"] .category-avatar { background: #e4eafa; color: #445d92; }
.row-description { min-width: 0; }
.row-description strong { display: block; font-size: .85rem; font-weight: 700; overflow-wrap: anywhere; margin-bottom: 5px; }
.row-description span, .row-date { color: var(--muted-text); font-size: .7rem; line-height: 1.5; }
.row-amount { font-size: .85rem; font-weight: 800; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.row-actions { display: flex; }
.row-actions button { font-size: .68rem; padding: 6px; min-width: 44px; }
.list-pagination { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 22px; }
.list-pagination span { color: var(--muted-text); font-size: .72rem; }
.list-pagination button { font-size: .75rem; }
.state { text-align: center; padding: 48px 24px; margin-top: 18px; border: 1px dashed var(--line-strong); border-radius: 18px; color: var(--muted-text); line-height: 1.8; }
.state > svg { margin-bottom: 12px; color: var(--accent); }
.state strong { display: block; font-family: var(--font-display); font-size: 1.7rem; font-weight: 400; color: var(--primary-text); }
.state p { font-size: .85rem; margin: 8px 0 18px; }
.ledger-dialog { width: min(560px, calc(100% - 24px)); max-height: calc(100dvh - 32px); margin: auto; padding: 28px; border: 1px solid var(--line); border-radius: 24px; color: var(--primary-text); background: var(--panel); box-shadow: 0 28px 100px #00000030; overscroll-behavior: contain; }
.ledger-dialog::backdrop { background: #07171db3; backdrop-filter: blur(5px); }
.dialog-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
.dialog-heading h2 { font-family: var(--font-display); font-weight: 400; font-size: 2rem; }
.dialog-heading .eyebrow { font-size: .6rem; margin-bottom: 6px; }
.recorder-fields { display: grid; gap: 20px; }
.field-label { display: flex; gap: 5px; }
.field-label span { color: var(--muted-text); font-weight: 400; }
.amount-input { display: flex; align-items: center; border-bottom: 2px solid var(--line); padding: 6px 12px; }
.amount-input > span { font-family: var(--font-display); color: var(--muted-text); font-size: 1.6rem; }
.amount-input input { border: 0; background: transparent; font-family: var(--font-display); font-size: 2.6rem; padding: 8px 12px; }
.amount-input:focus-within { box-shadow: 0 0 0 3px var(--focus-ring); border-radius: 10px; }
.amount-input input:focus-visible { outline: 0; }
.category-chips { display: flex; flex-wrap: wrap; gap: 8px; border: 0; margin: 24px 0 0; padding: 0; min-width: 0; }
.category-chips legend { margin-bottom: 12px; font-size: .8rem; font-weight: 700; }
.category-button { min-height: 42px; border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; background: transparent; color: var(--muted-text); font-size: .72rem; font-weight: 600; }
.category-button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
.custom-category-details { margin: 12px 0; font-size: .75rem; }
.custom-category-details summary { padding: 10px 0; cursor: pointer; color: var(--accent); }
.new-category { display: flex; align-items: end; gap: 8px; padding: 10px 0; }
.new-category label { flex: 1; min-width: 0; }
.when-details { border-top: 1px solid var(--line); margin-top: 14px; }
.when-details summary { padding: 16px 0; cursor: pointer; font-size: .8rem; }
.when-details summary span { float: right; max-width: 75%; font-size: .7rem; color: var(--muted-text); }
.when-details > div { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.when-details label { grid-column: 1 / -1; }
.quick-actions { display: flex; gap: 10px; margin-top: 24px; }
.quick-actions button { flex: 1; }
.form-message { border-radius: 10px; padding: 12px 14px; font-size: .8rem; line-height: 1.6; }
.error { color: var(--error); background: color-mix(in srgb, var(--error) 9%, transparent); }
.success { color: var(--success); background: color-mix(in srgb, var(--success) 9%, transparent); }
.feedback-toast { position: fixed; z-index: 5; left: 50%; bottom: 24px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; max-width: calc(100% - 32px); padding: 12px 18px; background: var(--primary-text); color: var(--canvas); border-radius: 14px; box-shadow: 0 10px 40px #0002; font-size: .8rem; }
.feedback-toast .text-button { color: inherit; text-decoration: underline; }
.feedback-toast .icon-button { color: inherit; width: 32px; min-height: 32px; padding: 6px; }
.workspace-footer { display: flex; justify-content: space-between; gap: 16px; margin-top: 42px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--muted-text); font-size: .65rem; }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.overview-heading { animation: rise .35s ease-out both; }
.overview-grid { animation: rise .45s .04s ease-out both; }
.transactions-panel { animation: rise .45s .08s ease-out both; }
.export-page { width: min(960px, calc(100% - 40px)); margin: 40px auto; }
.export-page .recent-card { padding: 28px; border: 1px solid var(--line); border-radius: 20px; background: var(--panel); }
.export-page .totals { display: flex; gap: 40px; margin: 28px 0; }
.export-page .totals span, .export-page .expense-list span { display: block; color: var(--muted-text); margin: 6px 0; }
.export-page .expense-list { list-style: none; padding: 0; }
.export-page .expense-list li { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid var(--line); padding: 18px 0; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .overview-grid { grid-template-columns: minmax(0,1.2fr) minmax(250px,1fr); gap: 16px; } .ledger-row { grid-template-columns: 44px minmax(0,1fr) auto 88px; } .row-date { grid-column: 2; grid-row: 2; margin-top: -16px; } .row-description { grid-column: 2; } .row-amount { grid-column: 3; grid-row: 1; } .row-actions { grid-column: 4; grid-row: 1; } }
@media (max-width: 780px) { .ledger-workspace { padding: 28px 24px 40px; } .workspace-topline { margin-bottom: 26px; } .overview-grid { grid-template-columns: minmax(0,1fr) minmax(250px,1fr); } .hero-amount { font-size: 2.7rem; } .spending-hero, .breakdown { padding: 24px; } .filter-fields { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 620px) { html { scroll-padding-top: 20px; } .ledger-workspace { padding: 24px 18px 36px; } .workspace-topline { font-size: .65rem; } .workspace-topline > span:last-child { display: none; } .overview-heading { align-items: flex-start; flex-wrap: wrap; gap: 18px; } .overview-heading h1 { font-size: 2.8rem; } .overview-heading p:last-child { font-size: .8rem; } .overview-heading > button { width: 100%; } .overview-grid { grid-template-columns: minmax(0,1fr); margin-bottom: 32px; } .spending-hero { min-height: 285px; } .hero-amount { font-size: clamp(2.5rem,10vw,3.5rem); } .breakdown { padding: 22px; } .breakdown-list { grid-template-columns: minmax(0,1fr); } .transactions-heading h2 { font-size: 1.2rem; } .download-button { padding: 10px; font-size: .72rem; } .transaction-toolbar { padding: 5px; gap: 4px; } .transaction-toolbar select { width: 120px; font-size: .72rem; padding: 10px 6px; } .search-field input { font-size: 16px; } .ledger-row { grid-template-columns: 38px minmax(0,1fr) auto; gap: 10px; padding: 16px 0; } .category-avatar { width: 38px; height: 38px; border-radius: 12px; } .row-description strong { font-size: .78rem; } .row-amount { font-size: .75rem; } .row-actions { grid-column: 3; grid-row: 2; justify-content: flex-end; } .row-date { margin-top: 0; align-self: center; } .row-actions button { min-height: 36px; padding: 4px; } .row-amount { white-space: normal; overflow-wrap: anywhere; max-width: 125px; } .filter-fields { grid-template-columns: minmax(0,1fr); } .filter-actions { flex-wrap: wrap; } .ledger-dialog { padding: 22px; border-radius: 20px; } .amount-input input { font-size: 2.3rem; } .new-category { flex-wrap: wrap; } .new-category label { flex-basis: 100%; } .workspace-footer { font-size: .6rem; } .feedback-toast { bottom: 12px; width: max-content; } .export-page .expense-list li { flex-wrap: wrap; } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; animation: none !important; transition: none !important; } }
}
`;
