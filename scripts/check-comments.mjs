import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const allowed = new Map([
  ["scripts/bench-scrypt.mjs", [
    "/**\n * Measures scrypt cost with the production parameters\n * (SCRYPT_N = 2**14, r = 8, p = 5) so parameter and throttle-budget\n * decisions are grounded in measured numbers, not guesses.\n */",
    "// p worker threads need ~128 * N * r * p bytes of memory",
    "// throttle: 8 attempts per 10 minutes",
  ]],
  ["scripts/check-bundle-budget.mjs", [
    "// Chunk prefixes follow the kebab-case lazy import paths (settings dir → settings-*).",
  ]],
  ["scripts/check-i18n.mjs", [
    "// Demo mode ships a pre-populated workspace whose seed data (welcome notes,",
    "// community gallery entries) is authored demo content in the demo locale, not",
    "// UI chrome rendered by the i18n layer. Like the OAuth consent page above, it",
    "// bypasses the English-only source rule; the strings themselves still live",
    "// only in seed data, never in JSX or component props.",
    "// Tag names are note data, not UI copy rendered by the i18n layer. The",
    "// built-in to-do tag is one such data constant; it is written here so the",
    "// raw-text scan below can blank it out.",
    "// The OAuth consent page is a self-contained HTML document with its own",
    "// language switch (cookie-based); it does not use the React i18n layer.",
    "// Tag-name constants (note data, not UI copy) are allowed to carry the",
    "// localized tag literal they match against.",
    "// allowedHanFragments keeps first-occurrence replacement on purpose: some",
    "// fragments are substrings of others, so global replacement would blank",
    "// the shared prefix before the longer phrase ever gets a chance to match.",
  ]],
  ["scripts/check-module-state.mjs", [
    "/**\n * Guards against module-level mutable state.\n *\n * 1. src/worker must hold NO module-level mutable state: Cloudflare Workers\n *    reuse isolates across requests, so a module-scope `let` or a module-scope\n *    Map/Set that is mutated at request time would leak data between users.\n * 2. `useState` at module scope (outside a component) is a React misuse;\n *    state must live inside components or in an explicit store module.\n */",
    "// 1. Worker: no module-level mutable bindings.",
    "// Inline-literal `new Set([...])` tables are immutable lookups; only empty",
    "// initializers are runtime-fillable and therefore cross-request mutable.",
    "// 2. Client: no module-level useState (React hook outside a component).",
  ]],
  ["scripts/ci-bench-report.mjs", [
    "// Generous headroom for shared CI runners; the point is catching an order-of-magnitude regression.",
  ]],
  ["scripts/e2e.mjs", [
    "// The stream must actually exceed the 25 MiB attachment limit (plus the",
    "// multipart overhead allowance) for the streaming size guard to fire;",
    "// anything below it parses as an invalid form instead (400).",
  ]],
  ["scripts/seed-dev-notes.mjs", [
    "// Seeds a dev:kv instance with a realistic multi-year vault for perf A/Bs.",
    "//",
    "// Usage:  node scripts/seed-dev-notes.mjs [count] [years]",
    "//   count  notes to seed (default 19800)",
    "//   years  calendar span to spread them over (default 2)",
    "//",
    "// Registers (or logs in as) the perf account, then calls the dev-only",
    "// /api/dev/seed route on the locally running worker, which writes D1 directly",
    "// so created_at/updated_at are spread across the window (the public API always",
    "// stamps \"now\", yielding a degenerate single-day vault).",
  ]],
  ["scripts/sync-comments-allowlist.mjs", [
    "/**\n * One-off regeneration of the comment allowlist inside check-comments.mjs.\n * Mirrors the checker's scanScript logic (TypeScript AST literal ranges +\n * comment regex) so the allowlist stays an exact inventory of every comment\n * in the scanned files. Run: node scripts/sync-comments-allowlist.mjs\n */",
  ]],
  ["src/client/components/activity-calendar.test.ts", [
    "// jsdom has no layout engine, so these guards assert the anti-wrap CSS contract",
    "// (whitespace-nowrap + truncate) instead of pixel measurement.",
    "// One seven-column row of clickable weekday labels above the heat cells.",
    "// 2026-09 has the first Monday on the 7th: column 0 (Mon) filters 09-07..09-13.",
  ]],
  ["src/client/components/activity-calendar.tsx", [
    "// The calendar's inputs (counts, notesByDay, diary lookup) now keep their",
    "// identity whenever a notes-map commit touches none of the read fields, so a",
    "// shallow memo lets the whole heatmap subtree skip rendering on such commits",
    "// (typing pauses still legitimately rebuild today's slice and re-render).",
    "/** Increments each time an external jump (e.g. a settings-preview click) targets the month view, triggering a fade-in + accent ring flash. */",
    "/** Reusable calendar + activity heatmap: navigable month grid, yearly month columns, and a GitHub-style weekly strip, with optional per-day note lists. */",
    "// Marks an external month jump (settings preview click) or an internal jump (week click, gap-cell follow, endpoint locate) with the same fade-in + receding accent ring.",
    "/** Convert an inclusive month range (0-11 indices within a year) to inclusive day keys. */",
  ]],
  ["src/client/components/date-range-popover.test.ts", [
    "// Three fixed pills + two default custom presets + the pencil button.",
  ]],
  ["src/client/components/date-range-popover.tsx", [
    "/** Compute the day keys for a fixed quick preset range anchored at `today`. */",
    "/** Move a preset within its list by one position (no-op at the edges). */",
    "/** Floating editor for an inclusive date-range filter: pick a start or end endpoint on a mini month calendar, leap to nearby months, apply fixed or rolling quick ranges, or clear the range. */",
    "// Locate feedback mirrors the sidebar-calendar jumpFlash: when the popover opens aimed at the range end month, or the endpoint toggles, the mini grid pulses with the accent ring.",
    "// Drag payload is best-effort; the drop handler re-reads the index from state, not dataTransfer.",
  ]],
  ["src/client/components/feedback.tsx", [
    "// Landing focus on the undo action is the keyboard fast-path, but it must never",
    "// interrupt typing, steal from an open dialog, or fight another undo toast.",
  ]],
  ["src/client/components/tag-filter-popover.tsx", [
    "/** Shared multi-tag picker: searchable tag checklist with note counts and an any/all match-mode switch. */",
  ]],
  ["src/client/components/tag-name-highlight.tsx", [
    "/** Renders a tag name with the matched query substring emphasized, used by tag pickers. */",
  ]],
  ["src/client/demo/backend.ts", [
    "// Match the real worker contract: facetsFull may only be true when the response carries the",
    "// complete folders/tags lists. The demo always sends full snapshots when anything changed, so",
    "// the flag follows `hasChanged`; a no-change catchup must not claim completeness (it would make",
    "// the client's full-snapshot consolidation replace its freshly collected folders with []).",
  ]],
  ["src/client/demo/state.ts", [
    "// Welcome notes are deliberately dated a few weeks back: with no edits within the last ~10 days,",
    "// the rolling date filter's follow-edit window stays parked at the newest edit and the gap hint",
    "// (newest edit outside a today-anchored window) is directly visible in the demo.",
  ]],
  ["src/client/editor/code-languages.ts", [
    "// Highlighting removed: no code languages are loaded.",
    "// Kept as empty array so the editor behaves as plain Markdown without syntax colors.",
  ]],
  ["src/client/editor/paste.ts", [
    "// Upload failure degrades to the error placeholder below via the null result.",
  ]],
  ["src/client/features/blog/blog-categories-modal.tsx", [
    "/* Form: Add or Edit Category */",
    "/* Existing Categories List */",
  ]],
  ["src/client/features/blog/blog-comments-view.tsx", [
    "/* Top filter toolbar */",
    "/* Status tabs */",
    "/* Search & Refresh */",
    "/* Batch action bar if items selected */",
    "/* Comments List */",
    "/* Comment Header */",
    "/* Avatar */",
    "/* Article reference link */",
    "/* Comment Content */",
    "/* Action Buttons */",
  ]],
  ["src/client/features/blog/blog-dashboard-view.tsx", [
    "/* Welcome & quick action banner */",
    "/* Control Bar: Range + Traffic Filter + Refresh */",
    "/* Real traffic filter banner */",
    "/* 4 Core KPI Cards */",
    "/* Total Views (PV) */",
    "/* Total Visitors (UV) */",
    "/* Published Posts */",
    "/* Daily Views */",
    "/* Main Trend Chart */",
    "/* 4 Audience Demographics & Breakdown Cards */",
    "/* Top 10 Posts */",
    "/* Visitor Geography */",
    "/* Traffic Sources */",
    "/* Devices and Systems */",
    "/* Lower Section: Realtime Logs & Pending Comments */",
    "/* Real-time Visit Logs */",
    "/* Pending Comments & Moderation */",
  ]],
  ["src/client/features/blog/blog-hub-modal.tsx", [
    "// Sub-modals state",
    "/* Top Header */",
    "/* Workspace Body */",
    "/* Sidebar */",
    "/* Content Area */",
    "/* Sub-modals */",
  ]],
  ["src/client/features/blog/blog-note-submenu.tsx", [
    "// 1. Update backend blog post status to unpublished",
    "// 2. Update original note Frontmatter: isPublished = false",
    "/* 1. View in Blog */",
    "/* 2. Copy Blog Link */",
    "/* 3. View Comments & Stats */",
    "/* 4. Post Settings */",
    "/* 5. Sync from Note */",
    "/* Separator */",
    "/* 6. Unpublish */",
  ]],
  ["src/client/features/blog/blog-publish-modal.tsx", [
    "// Helper to extract clean image URL from Markdown or plain string",
    "// Find first image in note content as suggested cover",
    "// Matches markdown images: ![alt](url)",
    "// Initialize form state",
    "// Parse Frontmatter from note content",
    "// Auto-generate initial slug",
    "// Check Frontmatter Cover",
    "// Inherit tags from note tags or frontmatter tags",
    "// Real-time slug validation",
    "// 1. Save or Update in Blog Backend",
    "// 2. Dual-way linkage: Update original note Frontmatter!",
    "// Add or update: isPublished: true/false, Cover: coverUrl",
  ]],
  ["src/client/features/blog/blog-settings-modal.tsx", [
    "// Site basic states",
    "// Traffic & logs states",
    "// Save traffic & retention filters",
    "/* Traffic Filters Section */",
    "/* Log Retention and Limits Section */",
    "/* Retention Days */",
    "/* Max Log Records */",
    "/* Cleanup Actions */",
    "/* Site Basic Info */",
    "/* Author Info */",
    "/* Comments and Pagination Rule */",
    "/* Social Links */",
  ]],
  ["src/client/features/command/shortcuts-panel.test.ts", [
    "// Narrow the results to a single row; the cursor must clamp back inside.",
  ]],
  ["src/client/features/command/shortcuts-panel.tsx", [
    "/** Invokes the underlying command for registry-backed rows (command-palette parity). */",
  ]],
  ["src/client/features/folders/folder-icon-submenu.tsx", [
    "// Pick first grapheme/character",
  ]],
  ["src/client/features/folders/folder-template-modal.tsx", [
    "/* Search */",
    "/* Template options */",
    "/* Option: No template */",
    "/* User & Built-in Templates */",
  ]],
  ["src/client/features/folders/manage-folders-modal.tsx", [
    "/* Controls bar: search and add */",
    "/* Inline create form */",
    "/* Folder list */",
    "/* Icon button/badge */",
    "/* Name or Rename input */",
    "/* Action buttons */",
    "/* Inline Color Picker */",
    "/* Inline Icon Picker */",
    "/* Sub-modal: Folder Template */",
  ]],
  ["src/client/features/folders/move-to-folder-submenu.tsx", [
    "/* Header */",
    "/* Gmail-style underline search input */",
    "/* Folder list */",
    "/* Divider */",
    "/* Actions */",
  ]],
  ["src/client/features/graph/graph-panel.tsx", [
    "// Notes created from unresolved nodes land in the graph's folder scope so",
    "// they inherit the folder name for the `{{folder}}` template placeholder.",
    "// Private browsing or a locked-down browser can reject local preferences.",
    "// The sidebar's cmd/ctrl+click selections join the graph's own tag filter.",
  ]],
  ["src/client/features/list/range-preset-persist.ts", [
    "/** Load the user's custom rolling range presets, falling back to the defaults. */",
  ]],
  ["src/client/features/list/use-gap-indicator.test.ts", [
    "// While peeking, the observed window is the expanded range, so the live gap goes quiet but the last one is kept.",
    "// The rolling window is re-materialized from the anchor (today), not the pre-peek snapshot.",
  ]],
  ["src/client/features/list/use-gap-indicator.ts", [
    "/** Newest non-deleted note's edit day key (null when there are no notes). */",
    "/** Newest edit's distance/direction outside the observed window (null when inside or inputs are empty). */",
    "/** The gap value rendered while a peek hides the live one. */",
    "/** Expanded range while a peek is active; doubles as the observed window during the peek. */",
    "/** The window to restore after a peek when no rolling filter is active. */",
    "/** Temporarily expand the window to cover the whole gap; returns the expanded range or null. */",
    "/** Restore the window after a peek. */",
    "/** Single source of truth for the \"newest edit outside the window\" indicator shared by the filter chip, the calendar banner, and the dashed calendar day. */",
    "/** Recomputes the shared gap whenever the notes or the date filter change. Mount once, anywhere in the tree. */",
  ]],
  ["src/client/features/list/use-rolling-filter.ts", [
    "/** Latest non-deleted note's edit date key (null when there are no notes). */",
    "// Several list-side consumers (gap indicator, rolling filter, list header) all",
    "// scan the whole notes map after every derived commit; memoize by the map",
    "// identity in a WeakMap so one commit pays exactly one O(n) scan and the cache",
    "// entry dies with the replaced map (no strong retention).",
    "/** Newest edit key with whole days it sits outside the selected window (null when it is inside or the inputs are empty). */",
    "/** Window covering both the current range and the whole gap up to the newest edit (null when the edit is inside or inputs are empty). */",
    "/** Day key the rolling window anchors on: the newest edit for the follow-edit direction, otherwise the later of the calendar today and the newest edit (the \"now\" moment — the window end advances with the save stream instead of staying pinned to the natural day). */",
    "/** Subscribes to note saves: any edit mutates the notes store, so `latestEditKey` recomputes the moment a note is written and the window re-materializes with zero latency. A single midnight-aligned tick covers only the today-anchored direction. */",
    "/** Keeps the rolling date filter materialized: the window recomputes whenever a note save (or the day rollover) changes its anchor. Mount once, anywhere in the tree. */",
  ]],
  ["src/client/features/preview/outline.test.ts", [
    "// Each button should render an svg icon",
    "// H1",
    "// minLevel 1, offset 0",
    "// H2",
    "// 8 + 1 * 10",
    "// H3",
    "// 8 + 2 * 10",
    "// H4",
    "// 8 + 3 * 10",
    "// Click handler test",
    "// H2 with minLevel=2 starts at 8px",
    "// H3 with minLevel=2 has 1 level indentation = 18px",
    "// First H1 does not have mt-1.5",
    "// Second H1 has mt-1.5",
  ]],
  ["src/client/features/settings/note-settings.tsx", [
    "// Live preview: what the template looks like with the placeholders filled in.",
  ]],
  ["src/client/features/share/share-edit-modal.tsx", [
    "/* Public link display and quick actions */",
    "/* Core action triggers: analytics, qr code, share hub */",
    "/* Share status switch */",
    "/* Folder selection */",
    "/* Tag selection */",
    "/* Tag chips */",
    "/* Add tag input */",
    "/* Custom slug */",
    "/* Access passcode */",
    "/* Expiration */",
    "/* Note analytics modal */",
    "/* QR code modal */",
  ]],
  ["src/client/features/share/share-form.ts", [
    "// A new or replaced passcode must be at least 4 characters (the server",
    "// enforces the same minimum); short codes are trivially brute-forced.",
  ]],
  ["src/client/features/share/share-hub-sidebar.tsx", [
    "/* Share folders */",
    "/* Share tags */",
  ]],
  ["src/client/features/share/share-note-submenu.tsx", [
    "/* Search input */",
    "/* Folder list */",
    "/* Current tags chips */",
    "/* Add tag input */",
    "/* Suggested tags */",
    "/* 1. View QR code */",
    "/* 2. Copy public link */",
    "/* 3. Move to folder */",
    "/* 4. Move to tags */",
    "/* 5. View analytics */",
    "/* 6. Edit share settings */",
    "/* 7. Revoke share if currently shared */",
  ]],
  ["src/client/features/share/share-page.tsx", [
    "// Share pages always block external images (no option): visitors never",
    "// opt in, so third parties cannot track them via note images. The",
    "// server enforces this too by omitting `https:` from CSP img-src on /s/*.",
  ]],
  ["src/client/features/share/share-settings-modal.tsx", [
    "/* Traffic Filters Section */",
    "/* Log Retention and Limits Section */",
    "/* Retention Days */",
    "/* Max Log Records */",
    "/* Cleanup Actions */",
  ]],
  ["src/client/features/share/share-visit-logs-modal.tsx", [
    "/* Controls Toolbar */",
    "/* Traffic Filter Tabs */",
    "/* Search & Actions */",
    "/* Quick Clean Dropdown */",
    "/* Logs Table */",
    "/* Time */",
    "/* Note & Slug */",
    "/* Location */",
    "/* Referrer */",
    "/* Client (Device / OS / Browser) */",
    "/* Type Badge */",
    "/* Fingerprint */",
    "/* Pagination Footer */",
  ]],
  ["src/client/features/sidebar/sidebar-calendar.tsx", [
    "// Single cached projection replaces the three whole-vault Object.values",
    "// scans: a typing commit only re-derives the edited note's day slice and",
    "// title slot, leaving every untouched output identity stable.",
    "// Every ActivityCalendar prop is stabilized so the shallow memo only skips",
    "// the subtree when the projection identities genuinely didn't change.",
  ]],
  ["src/client/features/sidebar/sidebar/sidebar-folders.tsx", [
    "// The count feeds the delete-confirmation only; the visible row badge is the",
    "// tree's totalNotes. Look it up from the shared memoized navigation projection",
    "// instead of scanning the whole notes map per folder row per render.",
  ]],
  ["src/client/features/tags/tag-mutations.ts", [
    "// The rollback already surfaced the failure toast; a refresh warning would double-toast.",
  ]],
  ["src/client/features/templates/template-gallery.tsx", [
    "// The fullwidth comma (\\uFF0C) is the typographic default for Chinese input.",
  ]],
  ["src/client/features/workspace/context-menu/types.ts", [
    "/**\n * Everything an EditorContextMenu item builder can read or trigger.\n * Assembled once per render by the `EditorContextMenu` component and handed to\n * the per-context builder modules so each branch stays a pure function of the\n * menu state (decoupled from the component's hooks and DOM plumbing).\n */",
  ]],
  ["src/client/lib/api.ts", [
    "/**\n * Client-side ApiError (consumer of the HTTP boundary). Deliberately mirrors\n * the worker's ApiError (src/worker/lib/errors.ts) without sharing the class:\n * the two layers must stay import-decoupled, and the client carries extra\n * client-only states (offline/timeout) that have no server counterpart.\n */",
  ]],
  ["src/client/lib/calendar-tree.test.ts", [
    "// A typing-derived summary commit clones the whole map but changes only",
    "// excerpt/wordCount/updatedAt on one note — none of which feed the tree.",
    "// Summary-only edits keep the tree identity.",
    "// Losing the todo tag removes the note from the todo tree.",
    "// Renaming the configured todo tag rebuilds against the new membership.",
    "// A summary-only edit under the new tag set still hits the cache.",
    "// Dropping the todo filter widens the tree to every note (same slot, new build).",
    "// A mulberry32 PRNG so the differential run is deterministic across runs.",
    "// The untouched day keeps its exact array identity.",
    "// The edited day is rebuilt with the new updatedAt ordering.",
    "// The owner changes title; note b (later in map order) takes over.",
    "// Renaming a non-owner leaves the slot untouched.",
    "// A late map-order note sharing a title never steals the slot.",
    "// Reviving re-adds the note everywhere with its new timeline position.",
    "// A missing target acts as a brand-new note.",
    "// Same-millisecond ties have no consumable order (the UI only",
    "// reads id/title), and only the order of equal timestamps can",
    "// diverge: the naive rebuild follows map insertion while the",
    "// incremental re-appends notes that left and re-entered a day.",
    "// Compare with a canonical (updatedAt, id) sort instead.",
  ]],
  ["src/client/lib/calendar-tree.ts", [
    "// Left padding (px) for a sidebar tree row at the given visual level, where level 0 is a root row.",
    "// Virtual rows count the root at depth -1, so a row's visual level is its depth plus one.",
    "// The sidebar calendar/todo trees bucket notes only by createdAt, deletedAt and",
    "// (for the todo tree) todo-tag membership. A typing-derived summary commit",
    "// changes none of those, yet it replaces the whole notes-map identity, so both",
    "// trees were rebuilt from scratch over the whole vault on every commit while",
    "// typing. Cache each built tree and, on a notes-map change, bail out of the",
    "// rebuild with a cheap field-by-field scan that returns the same tree identity",
    "// unless the structure genuinely changed; unchanged identity lets every",
    "// downstream consumer skip re-rendering entirely.",
    "// A store commit clones only the notes it actually touched into a",
    "// fresh map, so reference equality means none of the input fields can",
    "// have changed on this note (createdAt/deletedAt live on the object).",
    "// The input-equality walk runs for every tree on every notes-map commit, so",
    "// its verdict is memoized per map identity: React StrictMode re-renders the",
    "// same commit twice and unrelated consumers may pass the same map again, and",
    "// each of those calls would otherwise rescan the whole vault for nothing.",
    "// The activity-heatmap calendar derives three whole-vault structures from each",
    "// note (per-day updatedAt counts, first-note-per-title lookup, per-day note",
    "// lists), and every typing pause commits a notes-map identity change, so all",
    "// three Object.values scans used to re-run over the full vault per commit.",
    "// Build the projection once and then repair it by diffing note references: a",
    "// commit only replaces the edited note's object, so untouched day buckets and",
    "// the title map keep their identities (memoized consumers skip them), and only",
    "// the edited note's old/new day slices and title slot are recomputed.",
    "// First-wins over insertion order, matching the naive rebuild: the map holds",
    "// the first alive note per title, so a vacated slot is re-claimed by the first",
    "// alive note in map order that still carries the title.",
    "// The naive rebuild only ever records days with at least one note, so the",
    "// incremental must drop a key when its count reaches zero (keeps the map",
    "// bounded and matches the reference shape exactly).",
    "// A commit that touched fields this projection does not read",
    "// (excerpt, tags, pin, ...): keep every output identity stable.",
    "// updatedAt feeds both the day key and the day-list sort, so it",
    "// must match down to the millisecond for the slice to be skipped.",
    "// An alive note whose projection fields actually changed.",
    "// Same day: per-day count is unchanged; only the day's list needs",
    "// rebuilding, so the counts map keeps its identity.",
    "// An id vanished from the map without a tombstone: drop its stale",
    "// contributions (a rare path that costs one extra walk when it fires).",
  ]],
  ["src/client/lib/db-cache-spec.ts", [
    "// Shared behavior specs for the two-level shell cache. Each backend test file",
    "// (the hand-written idb-keyval mock and the fake-indexeddb-backed real module)",
    "// runs these identical scenarios, so a change can never pass one backend's",
    "// expectations while silently diverging on the other's.",
    "// The minimal storage surface the scenarios touch: real reads/writes/seeding",
    "// plus the mutation recorder the flush-traffic assertions inspect. Backends",
    "// implement it against their own storage (map mock vs fake-indexeddb).",
    "// Backends settle a scheduled flush differently: the in-memory mock finishes on",
    "// pure microtasks inside the fake-timer advance, while fake-indexeddb commits",
    "// transactions on real macrotasks that need an explicit event-loop drain.",
    "// Per-note layout on disk: every summary has its own key, plus one index key.",
    "// Second load goes through the index with two batched reads and no migration writes.",
    "// An old build stored flat keys under a bare 'userId' marker; booting the",
    "// new code first binds a different account, then switches back to u1 so",
    "// bindLocalUser's migrateLegacyData moves the flat keys into u1's scope,",
    "// and loadShell then upgrades the single-key notes array per note.",
    "// A second boot is fully idempotent: two batched reads, no migration writes.",
    "// The upgraded cache stays fully usable offline: edit, flush, reload.",
  ]],
  ["src/client/lib/db-multitab.idb.test.ts", [
    "// This file runs the same multi-tab scenarios as db-multitab.test.ts, but every",
    "// freshTab() opens its own real idb-keyval connection to one fake-indexeddb",
    "// database — the same multi-connection shape two browser tabs have — instead of",
    "// sharing one Map. The mirror and recorder live on a hoisted object because",
    "// vi.resetModules re-evaluates db.ts (and the mock factory) per fresh tab.",
    "// fake-indexeddb commits transactions on real macrotasks (setImmediate), which",
    "// the fake-timer advance does not wait for; drain the event loop with real",
    "// timers until the recorded mutations stop growing, then re-enable fake timers.",
  ]],
  ["src/client/lib/db-multitab.test.ts", [
    "// Two \"tabs\" are two independent evaluations of db.ts's module state. They must",
    "// share one IndexedDB, so the mock disk lives on a hoisted object that survives",
    "// vi.resetModules, while each fresh import of ./db gets its own baseline/timers.",
  ]],
  ["src/client/lib/db-shell.idb.test.ts", [
    "// This file runs the same shell-cache scenarios as db-shell.test.ts, but with",
    "// the real idb-keyval module on top of fake-indexeddb: values travel through",
    "// actual IDBObjectStore transactions, connection handles, and request events",
    "// instead of a hand-written Map. The wrapper below only records traffic; every",
    "// read and write db.ts performs goes to the genuine IndexedDB implementation.",
    "// fake-indexeddb commits transactions on real macrotasks (setImmediate), which",
    "// the fake-timer advance does not wait for; drain the event loop with real",
    "// timers until the recorded mutations stop growing, then re-enable fake timers.",
  ]],
  ["src/client/lib/db-shell.test.ts", [
    "// Hand-written in-memory idb-keyval mock: instantaneous and fully synchronous,",
    "// so the 10k-note flush-traffic benchmark and CI gate stay fast. The behavior",
    "// scenarios it runs are shared verbatim with the fake-indexeddb backend in",
    "// db-shell.idb.test.ts, which exercises the same code against real IndexedDB",
    "// semantics.",
    "// The harness drives the real localDb implementation; only the IndexedDB",
    "// primitive is mocked, so the write traffic it reports is exactly what the",
    "// shipping shell-cache code produces per flush.",
    "// Warm the cache the way boot does (initial pull -> full build flush), then",
    "// measure typing bursts: one summary commit per typing pause, coalesced",
    "// into a single shell flush.",
    "// Regression guard for the two-level layout: a single-note edit must never",
    "// re-serialize the whole vault on the flush path.",
  ]],
  ["src/client/lib/db.ts", [
    "// The shell cache is two-level: one `note-summary:<id>` key per note plus a",
    "// lightweight `noteIndex` id list. A typing-derived summary commit therefore",
    "// only upserts the one changed note instead of re-serializing the whole vault;",
    "// boot still reads every summary in a single getMany over the index. The shell",
    "// is a read cache for the next boot, not a source of truth: the coalescing",
    "// window collapses bursts into one flush (a lost tail at most delays the",
    "// cached shell by one window on abrupt close), and the flush tail chain keeps",
    "// each diff-based write from racing the previous one.",
    "// An offline tab never sees another tab's brand-new notes; merging with the",
    "// on-disk index keeps those entries when this tab rewrites the index, while",
    "// ids this tab deleted are still dropped (stale ids heal on the next pull).",
    "// The index read-merge-write is the one whole-value shell write two tabs can",
    "// race; Web Locks serializes it across tabs so a concurrent merge reads the",
    "// winner's index instead of a stale one. Browsers without Web Locks fall back",
    "// to the plain merge, which stays correct when flushes never overlap.",
  ]],
  ["src/client/lib/export-folder.test.ts", [
    "// Mock URL.createObjectURL",
  ]],
  ["src/client/lib/export-folder.ts", [
    "// Pre-calculate relative path from root for every folder in the tree",
    "// Group notes by relative directory to avoid file collisions",
  ]],
  ["src/client/lib/export-note.ts", [
    "// Respect the user's external-images choice: when blocked, exported HTML",
    "// shows the same placeholder as the preview instead of leaking image URLs.",
  ]],
  ["src/client/lib/folder-prefs.ts", [
    "// quota or private mode",
  ]],
  ["src/client/lib/fuzzy.ts", [
    "/**\n * Fast ordered-subsequence prefilter with the same acceptance semantics as\n * fuzzyMatch (monotonic indexOf per query character), so it never rejects a\n * candidate fuzzyMatch would accept. Used to shrink large candidate pools\n * (e.g. the note list) before scoring.\n */",
  ]],
  ["src/client/lib/graph-settings.ts", [
    "/** How the tag filter combines: any tag (union) or all tags (intersection). */",
    "/** Whether clearing the sidebar selection also resets the graph's own tag filter. */",
    "/** Whether clearing the sidebar selection also closes the graph panel. */",
    "/** The graph settings toggles: the single source of truth for the panel, docs, and tests. */",
  ]],
  ["src/client/lib/i18n.ts", [
    "/** Provides typed runtime localization with on-demand locale loading. */",
    "// Preload the other locale in background for instant switching, but don't block init",
  ]],
  ["src/client/lib/id.ts", [
    "/**\n * Client-side random ID helpers. Consolidates the crypto.randomUUID fallback\n * ladder that used to be duplicated across the API layer, markdown renderer\n * and the notes store.\n */",
    "/** Strongest available random id: randomUUID → CSPRNG hex → timestamp+random. */",
    "/** randomUUID with a timestamp+random fallback (for write/outbox ids). */",
  ]],
  ["src/client/lib/markdown/enhance.test.ts", [
    "// Highlighting still ran, but the hostile source survives only as inert text.",
    "// KaTeX renders inter-word spaces as U+00A0; normalize before comparing.",
  ]],
  ["src/client/lib/markdown/enhance.ts", [
    "// KaTeX output is machine-generated from math source (\\color values",
    "// are strictly validated and \\href is inert at trust:false), but it",
    "// is still written through the same sanitizer as every other HTML",
    "// fragment so a future KaTeX change cannot introduce a sink.",
  ]],
  ["src/client/lib/markdown/renderer.test.ts", [
    "// The code text itself is escaped content, never a live attribute.",
    "// 1. With curly braces {line-numbers}",
    "// 2. Without curly braces line-numbers",
    "// 3. With {showLineNumbers} and highlight lines {2}",
    "// 4. With explicit disable {line-numbers=false}",
  ]],
  ["src/client/lib/markdown/renderer.ts", [
    "/** Builds the sanitized Markdown rendering pipeline and its Inkstone-specific syntax extensions. */",
    "/** `true` when the caller opted into loading external https images (preview.externalImages). */",
    "// External https images are blocked by default (privacy default; the server",
    "// CSP drops `https:` from img-src while preview.externalImages is off, so",
    "// this is defense-in-depth for raw-HTML images too). Same-origin http(s)",
    "// URLs, relative paths, data:/blob: keep loading, and the whole check is",
    "// skipped when the caller passes `{ externalImages: true }`.",
    "// Placeholder instead of a broken <img>: the browser never loads an",
    "// external image while blocked, so no request leaves the origin.",
    "/** True for http(s) URLs that point to a different origin than the app itself. */",
    "/** Allow external https images; defaults to false (blocked). */",
  ]],
  ["src/client/lib/markdown/sanitize.ts", [
    "/**\n * Single sanitization entry point for every HTML string the markdown pipeline\n * writes into the DOM. The main render pass (markdown-it output) and the\n * async enhancers (Prism token HTML, KaTeX output) must each go through one of\n * these helpers so no producer can bypass the whitelist by inserting DOM after\n * the initial DOMPurify pass.\n */",
    "// The renderer is the only producer of this HTML, so the whitelist is",
    "// exact: every tag markdown-it and the Inkstone extensions can emit,",
    "// nothing else. SVG/MathML/forms stay out entirely to avoid the",
    "// mXSS-prone element combinations; task checkboxes are re-inserted as",
    "// DOM nodes after sanitization, so `input` is intentionally absent.",
    "/**\n * Prism token HTML is produced by the Prism grammar tokenizer from code text\n * (Prism escapes `<`/`&` inside tokens, so this is defense-in-depth). Only\n * `span` tokens with their `class` survive; anything Prism ever failed to\n * escape is parsed and then dropped as an element while its text content is\n * preserved, so the visible code never changes.\n */",
    "/**\n * KaTeX output spans/svg are generated from math source. `\\color` values are\n * strictly validated by KaTeX (hex or lowercase names only) so the `style`\n * attributes it emits never carry attacker-controlled CSS; `\\href`/`\\url` are\n * inert unless `trust` is enabled, so no link-carrying attributes are needed.\n * Navigation-capable attributes are still forbidden to contain a future KaTeX\n * regression that copies user text into an attribute value.\n */",
  ]],
  ["src/client/lib/note-filter.ts", [
    "/** Decide whether a note belongs to the active list view, optionally stacked with a multi-tag selection (`any` or `all` must match). */",
  ]],
  ["src/client/lib/note-persist.ts", [
    "/**\n * Coalesces per-keystroke IndexedDB writes (outbox + cached content) behind\n * one short timer: only the latest payload per note is ever persisted, so a\n * burst of typing collapses into a single outbox rewrite per note instead of\n * serializing every pending note body on every keystroke.\n */",
  ]],
  ["src/client/lib/sync.ts", [
    "/**\n   * Applies live setting changes (realtime toggle, poll interval) without\n   * tearing down the engine, its WebSocket, or its leadership claim.\n   */",
    "// The engine is created exactly once; later setting changes are pushed",
    "// through updateConfig instead of rebuilding the whole engine.",
  ]],
  ["src/client/lib/tag-selection.ts", [
    "/** Clears the multi-tag selection shared by the sidebar, list/palette filters, and graph; optionally confirms with a toast (a string overrides the default message). */",
    "/** The toast key for a graph clear, or null for the default message, based on the clear-behavior preferences. */",
  ]],
  ["src/client/lib/tag-sort.ts", [
    "/** Rank a tag name against a query: exact match, then prefix, then earlier substring. */",
    "/** Sort tags for a picker: by query relevance when searching, otherwise by note count (then name). */",
  ]],
  ["src/client/lib/template-notes.ts", [
    "/** Creates a note from a template and opens it, returning the new note id (or null on failure). */",
  ]],
  ["src/client/lib/test-render.ts", [
    "/** Idempotent jsdom shims needed to render React components in unit tests. */",
    "/** Render a React node into a fresh container appended to document.body (portals land on body as usual). */",
  ]],
  ["src/client/lib/time.ts", [
    "/** Day-key arithmetic: the key `delta` days after (or before) `key`. */",
    "/** Inclusive day window of `days` entries ending at `anchor` (1 = a single day). */",
    "/** Whole days from `a` to `b` (negative when `b` is earlier), using UTC day math to stay DST-safe. */",
    "/** Key of the week's first day (per `weekStart`) containing `key`. */",
    "/** Whether an inclusive day-key range spans exactly one aligned week. */",
  ]],
  ["src/client/lib/undo-focus-pref.ts", [
    "/** Whether undo toasts should auto-focus their action button (explicit \"no-distraction\" opt-out). */",
  ]],
  ["src/client/store/note-templates.ts", [
    "/** Coordinates the client-side template library: built-in seeding, categories and CRUD. */",
    "/**\n * Merge newer built-in entries into an existing library without touching user\n * templates or user edits. Runs when the stored seed version is behind.\n */",
    "// Refresh catalog-sourced fields (name, description, content, tags) on",
    "// built-in entries the user never edited: user edits flip `builtin` to",
    "// false, so those are skipped and never overwritten by a re-seed.",
    "// Customizing a built-in template hands ownership to the user,",
    "// so it becomes deletable and drops the \"built-in\" badge.",
    "// Category ids are preserved when they exist locally (custom",
    "// categories imported in the same batch included); unknown",
    "// ids fall back to Uncategorized instead of dangling.",
  ]],
  ["src/client/store/notes-test-utils.ts", [
    "/**\n * Reusable test harness for the notes store (src/client/store/notes.ts).\n *\n * The store reads `api` and `localDb` through the module singletons at call time, so tests can\n * install in-memory stubs on those objects without vi.mock. Install once per test file in\n * `beforeAll` (or per test in `beforeEach`) and point `notesMockServer` at the notes under test.\n *\n * Usage:\n *   import { installNotesApiStub, installLocalDbStubs, notesMockServer, noteSummary } from './notes-test-utils'\n *   beforeAll(() => { installNotesApiStub(); installLocalDbStubs(); })\n *   beforeEach(() => { notesMockServer.notes = new Map(); notesMockServer.patchCalls = [] })\n */",
    "/** In-memory stand-in for the account's server-side note storage. */",
    "/** Note ids whose next patch should 409 once (simulating a write from another device), then succeed. */",
    "/**\n * Replace `api.notes.patch` with an in-memory implementation that applies the patch body to the\n * matching note in `notesMockServer.notes` and returns the updated full note (rev bumped), mirroring\n * the real endpoint's response shape.\n */",
    "/** Apply the summary-flag subset of a patch body to a note (folder moves plus pin/star/archive). */",
    "// Another device already advanced the note past the client's revision.",
    "/**\n * Neutralize the IndexedDB-backed persistence surface the note mutation paths touch\n * (optimistic shell saves and content caching), so store actions run purely against the mock api.\n * Assignments go through a loose cast: the stubs intentionally ignore their real signatures.\n */",
    "/** Build a minimal NoteSummary fixture. */",
  ]],
  ["src/client/store/notes.test.ts", [
    "/**\n * Integration tests for the store-level undo contract behind the light note mutations\n * (move to folder, batch pin, star). Each action must optimistically apply, persist through\n * the (mocked) api, and post exactly one undo toast whose action reverts every affected note.\n */",
    "/** Run a fire-and-forget undo closure and flush the queued patch writes. */",
    "// A single-note revert confirms with a plain success toast.",
    "// Batch reverts stay silent: no extra toast was posted.",
    "// Only `b` changed; the api saw exactly one patch call.",
    "// Destructive actions get a longer undo window than the default light-operation window.",
    "// Attempt 1 conflicted (rev 1); attempt 2 retried with the adopted revision (rev 2).",
  ]],
  ["src/client/store/notes.ts", [
    "/** Coordinates the note cache, offline write-ahead log, optimistic updates, and server synchronization.\n *\n * This file is the composition root of the notes store: it owns the zustand store\n * instance (`useNotes`) and the store-level undo/toast helpers. The heavy lifting\n * lives in `store/notes/` — see `model.ts` (state), `persist.ts` (write staging),\n * `outbox.ts` (offline replay), `reconcile.ts` (merge), and `selectors.ts` (hooks).\n */",
    "/** Patch shape accepted by `patchNote` (summary flags plus folder moves). */",
    "/** Undo window for destructive actions (e.g. moving a note to the trash): longer than the default 3800ms. */",
    "/** Batch toast title for a count-aware mutation (e.g. \"Moved 3 notes\"). */",
    "/**\n * The shared store-level undo contract for light mutations: apply `patch` to every id in\n * `undoPatches`, then offer one undo toast running each note's captured revert patch.\n * `notify: 'confirm'` turns the action into a silent revert that confirms with a plain\n * toast; `'none'` reverts without any toast (batch undos).\n */",
    "// Single-note reverts confirm with a plain toast describing the reverted state; batch reverts stay silent.",
    "// Cache read failed (IndexedDB hiccup); fall through to the server fetch below.",
    "// Keep the front matter `title` property in sync with the note title",
    "// whenever the note already declares one (opt-out per settings).",
    "// Reverse sync: when the body's front matter `title` property changes,",
    "// adopt it as the note title so both stay in agreement (opt-out per",
    "// settings).",
    "// Reconnect pulls race with the connection coming up; the next event or manual refresh retries.",
    "// Outbox replay is retried on the next pull; keep the UI responsive meanwhile.",
  ]],
  ["src/client/store/notes/acknowledge.ts", [
    "/** Cross-tab broadcast acknowledgements: apply outbox results and base advancements from other tabs. */",
    "// Best-effort count refresh; the next outbox event or pull retries it.",
  ]],
  ["src/client/store/notes/adopt.ts", [
    "/** Adopting fetched/created/saved notes into the store (summary plus content caches). */",
  ]],
  ["src/client/store/notes/folder-mutations.ts", [
    "/** Optimistic folder mutations: begin/commit/rollback against pending-folder state. */",
  ]],
  ["src/client/store/notes/folder-ops.ts", [
    "/** Pure folder-tree manipulation used by optimistic folder mutations. */",
  ]],
  ["src/client/store/notes/model.ts", [
    "/** Notes store model: shared types plus module-level mutable state (single browser-tab singletons). */",
    "/** Tags when creating from a tag view: added to the front matter tags and available as the `{{tags}}` context. */",
    "/** Archive or unarchive a note, posting a store-level undo toast (`notify: 'confirm'` confirms a silent revert, `'none'` reverts silently for batch undos). */",
    "/** Archive or unarchive many notes with one shared undo toast that reverts the whole batch. */",
    "/** Star or unstar a note, posting a store-level undo toast (`notify` mirrors `setArchived`). */",
    "/** Star or unstar many notes with one shared undo toast. */",
    "/** Pin or unpin a note, posting a store-level undo toast (`notify` mirrors `setArchived`). */",
    "/** Pin or unpin many notes with one shared undo toast. */",
    "/** Move notes to a folder (null = unfiled) with one undo toast restoring each note's previous folder. */",
    "/** Mutable scalar state shared across modules. Imported ESM bindings are read-only,\n * so assigned-through singletons (timers, generations, promise slots) live in this object. */",
  ]],
  ["src/client/store/notes/new-note.ts", [
    "/** Fresh-note construction: template expansion, front-matter title sync, and caret memory. */",
    "/**\n * Build the initial content of a fresh note from the user-configured template\n * (see settings.notes.newNoteTemplate), merging any tags passed from a tag\n * view into the front matter `tags` list. `{{cursor}}` is resolved by\n * renderNewNoteTemplate so the editor can place the caret there. An empty or\n * whitespace-only template yields a blank note, matching the pre-template\n * behavior.\n */",
    "// Interpolate placeholders before the tag merge: the YAML round-trip in",
    "// mergeTagsIntoFrontMatter would mangle raw `{{...}}` tokens (they parse",
    "// as flow mappings) and leave them unreplaced in the final note.",
    "/** Pending caret positions for freshly created notes, consumed by the editor on mount. */",
  ]],
  ["src/client/store/notes/note-mutations.ts", [
    "/** Optimistic note-summary mutations (move/star/pin/archive/trash/restore) with conflict recovery. */",
  ]],
  ["src/client/store/notes/outbox.ts", [
    "/** Offline write-ahead replay: dependency-ordered outbox flush, conflict rebase, and 404 recovery. */",
  ]],
  ["src/client/store/notes/persist.ts", [
    "/** Text-write staging: coalesced IndexedDB persistence, outbox enqueue, and per-note write serialization. */",
  ]],
  ["src/client/store/notes/reconcile.ts", [
    "/** Merge/reconcile helpers: fold remote summaries/lists together with pending optimistic state. */",
  ]],
  ["src/client/store/notes/runtime.ts", [
    "/** Offline-journal runtime: dirty-revision advancement, purge snapshots, rebase and settle helpers. */",
  ]],
  ["src/client/store/notes/selectors.ts", [
    "/** Read-side selectors and hooks: navigation counts, visible notes, folder tree, active-note lookups. */",
    "// Tags gathered with cmd/ctrl+click in the sidebar are consumed by the",
    "// next new-note action, then cleared.",
    "// Re-sorting the whole visible set after every autosave derivation is the",
    "// most expensive idle work while typing; defer it so input stays on the",
    "// urgent lane and the list reorders one frame later.",
  ]],
  ["src/client/store/notes/shell-save.ts", [
    "/** Deferred persistence of the note/folder/tag shell cache. */",
  ]],
  ["src/client/store/notes/summary.ts", [
    "/** Deferred summary derivation (excerpt/word count/tags) for notes being edited. */",
  ]],
  ["src/client/store/notes/sync.ts", [
    "/** Full-sync paging and consolidation for the note store pull path. */",
  ]],
  ["src/client/store/notes/util.ts", [
    "/** ID generation, outbox key helpers, and tiny shared predicates for the notes store. */",
  ]],
  ["src/client/store/notes/workspace.ts", [
    "/** Workspace/intent helpers: view scoping for initial note selection and workspace-state snapshots. */",
  ]],
  ["src/client/store/pwa.ts", [
    "// Reset the flag once the toast is gone, so a later installed worker can",
    "// notify again instead of being permanently suppressed.",
  ]],
  ["src/client/store/session.ts", [
    "// Push unsaved offline edits before clearing local data, otherwise",
    "// they would be silently dropped. Dynamic import keeps the session",
    "// store free of a circular dependency on the notes store.",
  ]],
  ["src/client/store/ui.ts", [
    "/** Marks an undo toast: accent icon/tint in the UI and a short vibration cue. */",
    "/** How multi-selected tags filter the note list and palette: any or all. */",
    "/** Inclusive date range (YYYY-MM-DD keys) the note list is filtered to, set from the sidebar calendar. */",
    "/** When set, `dateFilter` is the live-materialized window of this rolling filter. */",
    "/** Unified note-list search query; part of the persisted filter combo cleared by `clearAllFilters`. */",
    "/** Sort the user left behind when entering a calendar folder view, restored on exit. */",
    "/** External jump request for the sidebar heatmap calendar (from the settings preview); consumed by SidebarCalendar. */",
    "/** Clears the full filter combo (query, date/relative, tags) with an undo toast restoring the exact previous combination. */",
    "// Quota or private-mode writes can throw; in-memory state stays authoritative for the session.",
    "// Keep the multi-select when entering a folder view so it stacks with",
    "// the folder filter; any other navigation clears the selection.",
    "/**\n * Post a toast carrying a one-click undo action; the single helper behind every store-level undo flow.\n * `duration` overrides the default window (dangerous actions pass a longer one via their caller).\n */",
    "// The view transition can be skipped (reduced motion, interrupted navigation); the circular reveal is purely decorative.",
  ]],
  ["src/shared/constants.ts", [
    "/**\n * Session lifetime design (sliding window):\n * - `SESSION_TTL_MS` (90d): absolute cap. A session row/cookie never outlives 90 days,\n *   bounding the window in which a stolen session token stays usable.\n * - `SESSION_RENEW_BEFORE_MS` (45d = TTL/2): renewal threshold. On an authenticated\n *   request, if less than this much TTL remains, the session is extended back to the\n *   full 90 days (see middleware/auth.ts and lib/session-store.ts).\n *\n * Trade-offs: renewal only happens for requests that already presented a valid\n * session, so an abandoned session dies within at most 90 days (no idle-forever\n * sessions, maintenance sweeps the rows), while an active user never gets logged out\n * as long as they authenticate at least once per 45 days. The half-life threshold\n * also bounds write amplification: each session triggers at most one DB renewal\n * write per 45 days of activity. The 45-day window is generous enough to survive\n * the app's offline period (offline edits are queued locally and flushed on\n * reconnect, which needs a still-valid session) yet short enough that a freshly\n * stolen cookie's remaining lifetime stays bounded.\n */",
    "/**\n * Default template inserted at the top of new notes. Keep placeholders ASCII:\n * they are filled in at creation time with the localized note title and the\n * current date/time. First line must be `---` (a leading blank line would\n * prevent the front matter from being parsed).\n */",
    "// External https images are blocked by default (renderer placeholder + CSP",
    "// `img-src` without `https:`); opt in per user. Share pages stay blocked",
    "// regardless of this value.",
    "/**\n * Merge a partial patch into the current settings.\n *\n * Sections that the patch does not touch are passed through by reference,\n * so subscribers observing a specific section (e.g. `settings.editor`) are\n * not re-rendered when an unrelated section changes.\n */",
    "/**\n * Guards the referential-stability contract of mergeSettingsPatch: sections\n * the patch did not touch must keep their object identity, otherwise narrow\n * store subscriptions silently regress into full-app re-renders on every\n * settings change.\n */",
  ]],
  ["src/shared/escape.ts", [
    "/**\n * HTML-escape untrusted text (all five metacharacters: & < > \" ').\n * Single canonical implementation shared by client and worker so escaping\n * semantics never drift between layers.\n */",
  ]],
  ["src/shared/markdown-utils/front-matter.ts", [
    "/**\n * Update an existing front matter property in-place, keeping the body and all\n * other properties untouched. Returns the rewritten content, or `null` when\n * the content has no parseable front matter, the property does not exist, or\n * nothing changes. Passing `null` as `value` deletes the property.\n */",
  ]],
  ["src/shared/markdown-utils/index.ts", [
    "/** Pure Markdown analysis shared by the browser and Worker runtimes. */",
  ]],
  ["src/shared/markdown-utils/templates.ts", [
    "/**\n * Fills the placeholders of a new-note template (`{{title}}`, `{{createdAt}}`,\n * `{{date}}`, `{{time}}`, `{{today}}`, `{{tomorrow}}`, `{{yesterday}}`, plus\n * contextual `{{folder}}` and `{{tags}}` values passed via `extra`). Shared by\n * the client (note creation, settings preview) and the worker (MCP\n * create_note). Values are quoted when needed so the rendered front matter\n * stays valid YAML; callers pass the resolved title (with any localized\n * fallback applied). Contextual placeholders without a value render as empty.\n */",
    "// Contextual values are inserted verbatim: `{{tags}}` commonly expands into",
    "// a flow list like `tags: [daily, reading]`, which quoting would corrupt.",
    "/**\n * Adds a tag to a note's front matter `tags`/`tag` list (creating the property\n * when missing), without touching the body. Returns the rewritten content, or\n * `null` when there is no parseable front matter or the tag is already\n * present. Used when creating a note from a tag view so the tag lands in the\n * properties.\n */",
    "/**\n * Merges tags into a rendered template's front matter `tags` list, shifting a\n * pending caret position by the bytes inserted before it. Must run after\n * placeholder interpolation: the YAML round-trip would mangle raw `{{...}}`\n * tokens (they parse as flow mappings) and leave them unreplaced.\n */",
    "/**\n * Renders a new-note template into final content, removing the `{{cursor}}`\n * marker (if any) and reporting its position so callers can place the caret.\n * Shared by note creation, the settings preview, and the editor command that\n * inserts the template at the caret. The sentinel character cannot occur in\n * real template output, so the reported position is always in final content.\n */",
  ]],
  ["src/shared/note-templates.ts", [
    "/**\n * Built-in template library catalog.\n *\n * The gallery is seeded per user from this catalog on first run. Names,\n * descriptions and Markdown bodies live in the locale resources (one entry per\n * language), so the catalog only references message keys. Bump\n * `TEMPLATE_SEED_VERSION` when adding or changing built-in entries: hydration\n * merges the missing/updated entries into existing user libraries without\n * touching user-created templates or user edits.\n */",
    "/**\n * Cross-cutting labels (not categories) used to tag built-in templates. Each\n * key maps to a localized label; user templates keep arbitrary free-form tags.\n */",
    "/**\n * Increment when the built-in catalog changes so already-seeded libraries pick\n * up new or updated entries. User edits to an entry that shares a built-in id\n * are never overwritten by a re-seed.\n */",
    "/**\n * Portable format for exporting/importing a user's template library. Only\n * user-created templates and categories are exported; built-ins are re-seeded\n * by the app itself and stay out of the file.\n */",
    "/**\n * Parses and validates an exported template library. Returns null when the\n * payload is not a well-formed export; malformed entries are dropped\n * individually so a partially broken file can still be imported.\n */",
  ]],
  ["src/shared/types/api.ts", [
    "/** A rolling date filter: N days ending either at the newest edit (`edit`) or at today (`today`). */",
  ]],
  ["src/shared/types/graph.ts", [
    "/** Tags to filter by. Overrides `tag`; sent comma-separated. */",
    "/** How multiple tags combine: `any` (default) for union, `all` for intersection. */",
  ]],
  ["src/shared/types/list.ts", [
    "/** Exact row count of the current view; only present on the first page to keep deep-paging cheap. */",
  ]],
  ["src/shared/types/notes.ts", [
    "/** True for categories shipped with the app; they cannot be renamed or deleted. */",
    "/** True for templates shipped with the app; they can be edited but not deleted. */",
    "/** Free-form labels shown in the gallery and used as a filter. */",
    "/** Manual sort position within the category; falls back to `updatedAt` when absent. */",
  ]],
  ["src/shared/types/settings.ts", [
    "/** Load external (https) images in rendered notes. Off by default: external\n   *  images are replaced with a blocked placeholder (renderer-level), and the\n   *  server drops `https:` from CSP `img-src` while it is off — so raw-HTML\n   *  images in notes stay blocked on the app page and are ALWAYS blocked on\n   *  share pages (/s/*), where visitors never opt in. */",
    "/** Tag(s, comma-separated) that file notes into the sidebar to-do tree; null falls back to the locale default. */",
  ]],
  ["src/worker/app.ts", [
    "// External https images: only signed-in SPA pages may load them, and only",
    "// when the user opted in via preview.externalImages. API/authorize/share",
    "// pages always omit `https:` from img-src — share visitors never opt in, so",
    "// third parties cannot track them through images in shared notes. This CSP",
    "// is the enforcement layer for raw-HTML <img> tags, which the client-side",
    "// renderer gate cannot see.",
    "// Inline scripts (theme bootstrap, MCP login page, dev React preamble)",
    "// are allowed through a fresh per-response nonce instead of",
    "// 'unsafe-inline', so a future injection point cannot execute scripts.",
    "// Ensure the schema exists (WeakMap-cached), then read against the raw D1.",
    "/** Adds a per-response nonce to every inline script in an HTML response and returns the CSP script source. */",
    "/* An unparseable redirect_uri simply contributes no extra origin to the CSP. */",
  ]],
  ["src/worker/backup/s3.ts", [
    "/* Best-effort: an unreadable error body falls back to the generic hints below. */",
  ]],
  ["src/worker/backup/snapshot/index.ts", [
    "/** Produces restorable JSON, readable Markdown, and attachment files for every backup target. */",
  ]],
  ["src/worker/db/schema/index.ts", [
    "/** Defines the idempotent final D1 schema initialized by every Worker isolate. */",
  ]],
  ["src/worker/db/schema/migrations.ts", [
    "// Explicit whitelist (not a regex over SCHEMA_STATEMENTS) so later",
    "// additions like mcp_api_keys can never be picked up accidentally.",
    "// Only CREATE TABLE / INDEX statements: D1 does not reliably support",
    "// ALTER TABLE ADD COLUMN with constraints, so the AI search preference",
    "// lives in app_meta (key `ai-search-enabled:<userId>`) instead of a",
    "// new column on the pre-existing mcp_preferences table.",
    "// Source-side graph traversal (local graph mode BFS, MCP explore) queries",
    "// links by user + source and by user + target; the OR join can only use",
    "// both branches when each side has its own user-scoped index.",
  ]],
  ["src/worker/db/schema/runtime.ts", [
    "// Existing installations must converge additively. CREATE IF NOT EXISTS",
    "// never rewrites user data; running table creation before indexes also",
    "// lets a partially initialized database recover missing feature tables.",
  ]],
  ["src/worker/db/writes.ts", [
    "/** Keeps tags, backlinks, full-text indexes, and change records consistent with note writes. */",
  ]],
  ["src/worker/env.ts", [
    "/** Workers AI binding for semantic search; optional so AI search degrades gracefully. */",
    "/** Present only in the dev-only wrangler.kv.toml; unlocks /api/dev/seed for local perf seeding. */",
  ]],
  ["src/worker/import/attachments.ts", [
    "/** Attachment handling for the import pipeline: dedupe, persist, map and link. */",
  ]],
  ["src/worker/import/backup.ts", [
    "/** Markdown-backup import: manifest parsing, entry verification and batch restore. */",
  ]],
  ["src/worker/import/bundle.ts", [
    "/** Inkstone export-bundle import: folders, notes, tags and attachments restored from an export JSON. */",
  ]],
  ["src/worker/import/folders.ts", [
    "/** Folder creation for the import pipeline: prime the cache, then create paths segment by segment. */",
  ]],
  ["src/worker/import/markdown.ts", [
    "/** Plain .md/.markdown/.txt import with optional Obsidian asset resolution. */",
  ]],
  ["src/worker/import/notes.ts", [
    "/** Note-level writes for the import pipeline: index lookup, insert and guarded update. */",
  ]],
  ["src/worker/import/shared.ts", [
    "/** Pure helpers shared across the import pipeline. */",
  ]],
  ["src/worker/import/types.ts", [
    "/** Shared types for the import pipeline (Inkstone exports, Markdown backups, plain .md/.txt files). */",
  ]],
  ["src/worker/import/zip.ts", [
    "/** ZIP entry classification and backup selection for the import pipeline. */",
  ]],
  ["src/worker/index.ts", [
    "// Codex CLI drops the `iss` callback parameter while its rmcp",
    "// dependency enforces it whenever the authorization server advertises",
    "// `authorization_response_iss_parameter_supported` (openai/codex#31573), so",
    "// login fails even though the parameter is on the wire. Serve the metadata",
    "// without that flag to keep codex compatible; the standard RFC 9207 `iss`",
    "// parameter is still appended to callbacks for conforming clients.",
  ]],
  ["src/worker/lib/errors.ts", [
    "/**\n * Worker-side ApiError (producer of the HTTP boundary). Deliberately mirrors\n * the client's ApiError (src/client/lib/api.ts) without sharing the class:\n * the two layers must stay import-decoupled, and the worker adds static\n * factories and a strict status union the client does not need.\n */",
  ]],
  ["src/worker/lib/image.ts", [
    "// Malformed or truncated image data is routine for probes; degrade to unknown dimensions.",
  ]],
  ["src/worker/lib/password.ts", [
    "// Measured on a dev machine (node:crypto, avg of 5): ~250 ms per hash with these",
    "// params — about 300x below the 75 s worst-case budget the login throttle allows",
    "// (8 attempts per 10 minutes), so cost can be raised later without breaking it.",
  ]],
  ["src/worker/lib/request.ts", [
    "// CF-Connecting-IP is injected by the Cloudflare edge and cannot be",
    "// spoofed there. On any other runtime the header is client-controlled,",
    "// so ignore it rather than trusting it for throttling.",
  ]],
  ["src/worker/lib/scoped-organizer.ts", [
    "/**\n * Scoped folder/tag CRUD shared by the \"hub\" organizer stacks (attachment\n * drive, share center, blog). Each hub keeps its own tables\n * (`*_folders` / `*_tags`) and its own detach target, but the row shape,\n * defaults and ordering rules are identical, so a single implementation\n * replaces the three near-copy route sections.\n *\n * The notes `folders`/`tags` tables are intentionally NOT routed through this\n * module: they carry note-specific semantics (nested depth limits, concurrent\n * guarded soft-delete, note-content tag rewrites with rollback, the changes\n * log) that a shared simple engine cannot express without distortion.\n */",
    "/** Entity table whose rows carry `folder_id` and are detached when a hub folder is deleted. */",
    "/**\n * Deletes a hub folder: children in `childTable` and nested hub folders are\n * detached (moved to the root) before the row is removed. Mirrors the old\n * three-statement batch; returns `false` when the id does not exist.\n */",
    "/** Deletes a tag row; returns the deleted name so callers can clean up entity JSON tag lists. */",
  ]],
  ["src/worker/lib/session-store.ts", [
    "/**\n * Extend a session back to the full TTL. Only call this from an authenticated\n * request whose session is inside the renewal window (see SESSION_RENEW_BEFORE_MS);\n * never call it from unauthenticated paths — renewal must not resurrect or\n * prolong a session the user has not just proven possession of.\n */",
  ]],
  ["src/worker/mcp/ai-search.ts", [
    "/**\n * Private AI semantic search for the MCP module.\n *\n * Notes are embedded with Workers AI (`@cf/baai/bge-m3`, 1024 dims,\n * multilingual) and the vectors live in D1 — no public query endpoint, one\n * index per account. Content changes are queued and drained in the\n * background; when the AI binding is missing or the model call fails the\n * feature degrades to plain lexical search instead of failing (the old\n * behavior that surfaced as HTTP 503s).\n */",
    "// Stored in app_meta instead of a column on mcp_preferences: D1 does not",
    "// reliably support ALTER TABLE ADD COLUMN with constraints, and app_meta",
    "// exists on every database without any migration.",
    "/**\n * Queues a note for embedding (or vector deletion). The single row per note\n * uses last-write-wins semantics: a delete supersedes a pending embed and\n * vice versa. Queuing is skipped entirely while the account has AI search\n * disabled, except deletions which always clean up stale vectors.\n */",
    "/**\n * Processes queued embedding jobs. Called from the hourly cron with a large\n * budget and from write paths (via waitUntil) with a small one. Items are\n * processed sequentially so Workers AI rate limits are respected; a failing\n * item stops the batch and is retried on the next run.\n */",
    "// The account turned AI search off; its queue would otherwise grow forever.",
    "/**\n * Semantic retrieval over the account's embedding index. Returns null when\n * AI is unavailable or the query embedding fails; the caller degrades to\n * lexical search.\n */",
    "/**\n * Reciprocal-rank fusion: merges two ranked lists into one by rank, so a\n * note that ranks well in both lexical and semantic search surfaces above\n * one that only appears in a single index.\n */",
    "/** Calls the Workers AI embedding model and returns a Float32Array. */",
    "/** Handles both the `{ data: [{ embedding }] }` and `{ shape, data }` shapes. */",
  ]],
  ["src/worker/mcp/api-keys.ts", [
    "/**\n * Static API keys for MCP access.\n *\n * Small or generic MCP clients (scripts, SDKs, unnamed agents) cannot run the\n * OAuth 2.1 dance, so they authenticate with a plain `Authorization: Bearer\n * <key>` header — the universal HTTP standard. The OAuth provider resolves\n * these tokens through its official `resolveExternalToken` hook; the key is\n * never stored or returned again, only its SHA-256 hash.\n */",
    "// 32 random bytes encoded as unpadded base64url is exactly 43 characters.",
    "/**\n * Resolves a bearer token to an account. Returns null for unknown, revoked,\n * or malformed keys so the OAuth provider can answer with 401 invalid_token.\n */",
  ]],
  ["src/worker/mcp/library/graph.ts", [
    "// Per-node round trips (up to 2 queries x up to 100 nodes) serialized a whole",
    "// MCP graph exploration; batch each BFS level into chunked IN queries instead",
    "// so a full explore costs a handful of requests. Chunk at 80 to stay under",
    "// D1's sql-variable limit with the user binding included.",
    "// Keep the original per-node LIMIT 100 cap in aggregate, split into a",
    "// source-side and a target-side query (each satisfies its own index) so",
    "// the batch never fetches more than the sequential version would.",
  ]],
  ["src/worker/mcp/oauth.ts", [
    "// Static API keys let small or generic MCP clients authenticate with a",
    "// plain `Authorization: Bearer ink_...` header instead of running the",
    "// full OAuth 2.1 dance. Keys are hashed and revocable.",
    "// This path runs before the API handler, so ensure the schema exists",
    "// (cheap after the first request thanks to the initialization cache).",
  ]],
  ["src/worker/mcp/operations.ts", [
    "// The mutation itself failed before committing; remove the pending row",
    "// so the client can retry the same operation_id cleanly.",
    "// The mutation already committed. Keep the pending row so a retry goes",
    "// through the recovery path instead of re-executing and colliding",
    "// (e.g. create_note with the same id).",
  ]],
  ["src/worker/mcp/retrieval/search.ts", [
    "// AI unavailable, rate-limited, or malformed response: degrade to lexical.",
  ]],
  ["src/worker/mcp/writes/content.ts", [
    "/** Final content for an MCP-created note: explicit content wins, blank notes follow the interpolated template. */",
  ]],
  ["src/worker/mcp/writes/ops.ts", [
    "// Blank MCP-created notes follow the user's configured new-note template.",
  ]],
  ["src/worker/middleware/auth.ts", [
    "// Sliding-window renewal (see SESSION_RENEW_BEFORE_MS in shared/constants):",
    "// only extend a session that is still valid AND inside its last 45 days, so",
    "// (a) an abandoned session still expires within the 90-day absolute cap,",
    "// (b) each session gets at most one DB renewal write per 45 days, and",
    "// (c) unauthenticated requests (e.g. expired sessions) can never extend",
    "//     their own lifetime. The cookie Max-Age is refreshed in lockstep so",
    "//     the browser copy does not expire before the server-side row.",
  ]],
  ["src/worker/realtime/sync-hub.ts", [
    "// Best-effort teardown: the socket may already be closed; there is nothing to recover.",
    "// A socket can drop between getWebSockets() and send(); skip it and keep broadcasting.",
  ]],
  ["src/worker/routes/auth.ts", [
    "// Avatar data URLs can reach tens of KB; the 256 KB profile body limit is the cap.",
    "// Account-wide cap so a distributed botnet cannot retry one account",
    "// from many IPs forever; cleared on every successful sign-in, so a",
    "// normal user only ever notices it after 30 failed attempts per hour.",
    "// A successful sign-in proves this identity and IP are legitimate:",
    "// clear every throttling key (identity, IP, and account level) so a",
    "// shared IP / NAT is never locked out by a full window of attempts.",
  ]],
  ["src/worker/routes/blog/comments.ts", [
    "// --------------------------------------------------------------------------",
    "// 12. Comments Moderation Management (Complete Moderation Center)",
    "// --------------------------------------------------------------------------",
    "// 'all' | 'pending' | 'approved' | 'rejected' | 'spam'",
  ]],
  ["src/worker/routes/blog/index.ts", [
    "// Ensure session loaded for manage routes",
  ]],
  ["src/worker/routes/blog/organizer.ts", [
    "/* Corrupt post tags are skipped so one bad row cannot break the dashboard. */",
    "// 11. Categories Management",
  ]],
  ["src/worker/routes/blog/posts.ts", [
    "// 5. List Posts",
    "// 'all' | 'published' | 'draft' | 'pinned'",
    "// 6. Create / Publish Post",
    "// 7. Update Post",
    "// 8. Delete / Unpublish Post",
    "// 9. Sync Post from Note",
    "// 10. Batch Post Operations",
  ]],
  ["src/worker/routes/blog/public.ts", [
    "// --------------------------------------------------------------------------",
    "// Public API Routes for Astro Frontend (CORS enabled)",
    "// --------------------------------------------------------------------------",
    "// Add CORS headers for Astro frontend",
    "// Public site info & settings",
    "// Public posts list with filters & pagination",
    "// Public post detail (increments views)",
    "// Atomically increment views",
    "// Asynchronously record visit to blog_visits",
    "// Get previous and next posts for navigation",
    "// Public categories list with post counts",
    "// Public tags list with post counts",
    "/* Corrupt post tags are skipped so one bad row cannot break the dashboard. */",
    "// Public timeline (Archive by year and month)",
    "// Public calendar distribution",
    "// Map by YYYY-MM-DD",
    "// Public comments list for a post",
    "// Public submit comment",
  ]],
  ["src/worker/routes/blog/settings.ts", [
    "// Helper: load blog settings from app_meta",
    "// 2. Settings",
    "// 3. Slug availability check",
    "// 4. Get post by noteId",
  ]],
  ["src/worker/routes/blog/stats.ts", [
    "// --------------------------------------------------------------------------",
    "// Blog Manage Routes (Authenticated)",
    "// --------------------------------------------------------------------------",
    "// 1. Get Blog Stats & Dashboard",
    "/* Corrupt post tags are skipped so one bad row cannot break the dashboard. */",
    "// 1.1 Blog Global Analytics (Dashboard)",
  ]],
  ["src/worker/routes/community-templates.ts", [
    "// Publishing (or updating) counts against a per-user hourly budget so a",
    "// single account cannot flood the shared directory; authors updating",
    "// their own templates consume the same budget, which is acceptable.",
  ]],
  ["src/worker/routes/dev.ts", [
    "// Dev-only seeding for local perf benchmarking (dev:kv). Outside a dev",
    "// instance the DEV_SEED variable is absent, so these routes 404. The public",
    "// API always stamps created_at/updated_at with the current time, which turns",
    "// every seed vault into a degenerate single-calendar-day layout; writing D1",
    "// directly with spread timestamps is what makes client-side perf A/B (shell",
    "// cache, calendar heatmap, virtual trees) run against a realistic multi-year",
    "// vault instead.",
    "/** Idempotently replace the `seed-*` vault with `count` notes spread day-by-day over `years` years, several notes per day with intra-day hour offsets. */",
  ]],
  ["src/worker/routes/files.ts", [
    "// The usage panel re-opens and re-pages often while note contents rarely",
    "// change between opens; keep one exact reference map per user for a short",
    "// window so page 2, filters and re-opens skip the full content scan.",
    "// The cache lives in D1 (attachment_refs + an app_meta freshness stamp), so",
    "// every isolate shares the rebuild instead of scanning all note bodies once",
    "// per isolate within the window.",
    "// Corrupt stamp: fall through to a rebuild.",
    "// The freshness stamp is written last, so readers never observe a",
    "// half-rebuilt table: they only consult it when the stamp is fresh.",
    "// When the caller only needs presence (e.g. pruning), stopping as soon as",
    "// every wanted id has been found is exact: unscanned notes could only add",
    "// more references for already-found ids, never create new ones.",
  ]],
  ["src/worker/routes/folders.ts", [
    "// Patch format checks run in-route after the ownership lookup so cross-user writes surface 404 first.",
  ]],
  ["src/worker/routes/mcp-authorize.ts", [
    "/* Unreadable user settings fall back to the Accept-Language header. */",
  ]],
  ["src/worker/routes/mcp-settings.ts", [
    "// Kick off the first batch immediately; the rest is drained by the cron.",
  ]],
  ["src/worker/routes/notes/edit.ts", [
    "// The SQL SET fragments derive from the same patches list that answers",
    "// the local row projection, so the two can never drift apart.",
  ]],
  ["src/worker/routes/notes/helpers.ts", [
    "// Read every candidate once in a single batched query instead of one SELECT",
    "// per candidate; the guarded UPDATE still catches concurrent edits and only",
    "// conflicting candidates get a fresh single-row read on retry.",
    "// The guarded write was lost to a concurrent edit: re-read just this",
    "// note and retry with fresh state.",
  ]],
  ["src/worker/routes/notes/list.ts", [
    "// COUNT(*) over the view predicate is only needed on the first page (the",
    "// client never re-reads `total` once paging starts); deep pages skip it so",
    "// the cost does not grow with every deleted row the index has to walk.",
  ]],
  ["src/worker/routes/search.ts", [
    "// Drain synchronously (up to the read-path cap) before querying: a search",
    "// that follows note edits within the FTS drain delay should still hit the",
    "// index instead of silently falling back to LIKE. The background drain",
    "// keeps handling the remainder and deletes.",
    "// `tagsMatch=all` intersects the tag filters, otherwise any match qualifies.",
  ]],
  ["src/worker/routes/share/public.ts", [
    "// If header referer is simply this share page itself, it's not an external referrer",
    "/* An unparseable referer header simply means \"no external referrer\". */",
    "/* Unparseable referer candidates are skipped; analytics degrade to a null referrer. */",
    "// Real human visit = not an automated bot/spider",
  ]],
  ["src/worker/routes/share/shares.ts", [
    "/* Malformed legacy tags degrade to \"no tags\" instead of failing the share render. */",
  ]],
  ["src/worker/routes/sync.ts", [
    "// A non-empty `after` key always means the caller is mid-way through a",
    "// full snapshot page chain; keep serving snapshot pages regardless of",
    "// `since`, so following the returned nextKey can never silently drop",
    "// remaining pages.",
    "// Never move the client's cursor backwards, even if it reported a",
    "// seq ahead of the server (e.g. data was trimmed).",
  ]],
  ["src/worker/routes/tags.ts", [
    "// Format is checked after the ownership lookup so cross-user writes surface 404 first.",
    "// Read every candidate once in a single batched query instead of one SELECT",
    "// per candidate; the guarded UPDATE still catches concurrent edits and only",
    "// conflicting candidates get a fresh single-row read on retry.",
    "// The guarded write was lost to a concurrent edit: re-read just this",
    "// note and retry with fresh state.",
  ]],
  ["src/worker/routes/transfer.ts", [
    "// Preserved export surface: parseImportConflict / importedBundleTitle /",
    "// importedMarkdownTitle used to live in this file; runBatched was re-exported",
    "// here for consumers that import the transfer route module.",
  ]],
  ["tests/share-analytics.test.ts", [
    "// too short (< 3)",
    "// too long (> 64)",
    "// spaces",
    "// slashes",
    "// non-ascii",
    "// query symbols",
    "// Default / All enabled:",
    "// Exclude bots only:",
    "// All disabled:",
    "// With table alias:",
  ]],
  ["tests/throttle-session.test.ts", [
    "/**\n * Minimal D1Database-compatible shim over node:sqlite so the real upsert SQL\n * in throttle.ts / session-store.ts executes against SQLite instead of being\n * re-implemented in the test.\n */",
    "// Rewind the last attempt far enough to expire the window and the lock.",
    "// The 4th failure reached the escalation chain (fails 2 → locked for the",
    "// ip key); assertNotLocked must now throw for that key but not others.",
  ]],
  ["vite.config.ts", [
    "// Keep optional preview renderers and their language modules behind dynamic-import boundaries.",
  ]],
])
const found = new Map()
const failures = []
const roots = ['src', 'scripts', 'tests']
const files = [
  ...roots.filter((root) => fs.existsSync(root)).flatMap((root) => [...walk(path.resolve(root))]),
  ...['vite.config.ts', 'vitest.config.ts', 'index.html', 'wrangler.toml'].map((file) => path.resolve(file)),
]

for (const file of files) {
  const extension = path.extname(file).toLowerCase()
  const text = fs.readFileSync(file, 'utf8')
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(extension)) scanScript(file, text)
  else if (extension === '.css') scanCss(file, text)
  else if (extension === '.html' && /<!--[\s\S]*?-->/.test(text)) failures.push(`${relative(file)} contains an HTML comment`)
  else if (extension === '.toml' && /^[ \t]*#/m.test(text)) failures.push(`${relative(file)} contains a TOML comment`)
}

let approvedCount = 0
for (const [file, comments] of allowed) {
  approvedCount += comments.length
  const seen = found.get(file)
  for (const comment of comments) {
    if (!seen?.has(comment)) {
      failures.push(`${file} no longer contains an approved comment; remove it from the allowlist: ${preview(comment)}`)
    }
  }
}

if (failures.length) {
  console.error(`comment policy check failed (${failures.length}):`)
  failures.forEach((failure) => console.error(`  ${failure}`))
  process.exit(1)
}

console.log(`comment policy check passed: ${approvedCount} approved English architecture notes across ${allowed.size} files and no other code comments`)

function scanScript(file, text) {
  const scriptKind = file.endsWith('.tsx') || file.endsWith('.jsx')
    ? ts.ScriptKind.TSX
    : file.endsWith('.js') || file.endsWith('.mjs') || file.endsWith('.cjs')
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind)
  const literalRanges = []
  collectLiterals(source)
  literalRanges.sort((left, right) => left.start - right.start)

  const comments = /\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g
  for (const match of text.matchAll(comments)) {
    if (!insideLiteral(match.index)) check(file, match[0])
  }

  function collectLiterals(node) {
    if (
      ts.isRegularExpressionLiteral(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) literalRanges.push({ start: node.getStart(source), end: node.getEnd() })
    ts.forEachChild(node, collectLiterals)
  }

  function insideLiteral(index) {
    return literalRanges.some((range) => index >= range.start && index < range.end)
  }
}

function scanCss(file, text) {
  let quote = null
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quote) {
      if (char === '\\') index++
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") quote = char
    else if (char === '/' && text[index + 1] === '*') failures.push(`${relative(file)} contains a CSS comment`)
  }
}

function check(file, comment) {
  const name = relative(file)
  if (!allowed.get(name)?.includes(comment)) {
    failures.push(`${name} contains an unapproved code comment: ${preview(comment)}`)
    return
  }
  const seen = found.get(name) ?? new Set()
  seen.add(comment)
  found.set(name, seen)
}

function preview(comment) {
  const flat = comment.replace(/\s+/g, ' ').trim()
  return flat.length > 96 ? `${flat.slice(0, 96)}...` : flat
}

function relative(file) {
  return path.relative(process.cwd(), file).replaceAll('\\', '/')
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(target)
    else yield target
  }
}
