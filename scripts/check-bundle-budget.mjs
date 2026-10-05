import fs from 'node:fs'
import path from 'node:path'
import { readChunks, firstPaintChunks, FIRST_PAINT_ROOT_PREFIXES } from './lib/boot-graph.mjs'

const ASSETS_DIR = path.resolve('dist/client/assets')
const INDEX_HTML = path.resolve('dist/client/index.html')

// Lazy layer: chunks fetched when a surface opens, capped one by one. Prefixes
// follow the kebab-case lazy import paths (settings dir → settings-*).
const BUDGETS = {
  settings: 40_000,
  'account-settings': 80_000,
  'editor-settings': 40_000,
  'sync-settings': 40_000,
  'data-settings': 60_000,
  'about-settings': 40_000,
  'backup-settings': 60_000,
  'mcp-settings': 60_000,
  // 'music-' matches every music chunk: the hub modal, the floating card, the
  // immersive layer and the shared transport/artwork code. All of them are
  // opened on demand, so the cap is per chunk and the layer they belong to is
  // asserted by MUST_BE_LAZY below.
  //
  // 96_000 → 100_000: the shared store chunk carries the online-source half of the feature, and one
  // round added three of them to it — the search scope, the per-catalogue table (switch + ask order)
  // and the session memo that stops a query being asked twice. Measured 96.8 KiB against the old cap,
  // with the biggest other music chunk (the hub modal) at 92.3 KiB and unchanged by that work. The cap
  // stays per chunk and the lazy assertion below still holds the layer; what it buys is headroom for
  // the next feature rather than room for a rewrite.
  music: 100_000,
}

/**
 * Eager layer: the document's own chunks plus the static closure of every surface the first render
 * mounts (see `scripts/lib/boot-graph.mjs`). Every byte here is fetched before a signed-in user sees
 * anything, so the whole graph shares one cap instead of per-chunk ones.
 *
 * 976.6 KiB → 3 515.6 KiB. This is not a growth in what ships at boot — it is the same bytes the
 * previous seed counted as lazy. The old graph seeded itself with `app-` only, so `shell-*` and
 * `workspace-*` (3 446 KiB raw / 1 064 KiB gzip measured 2026-10-05) sat outside the budget while
 * being mounted on the first render. Re-seeding made 29 chunks become 303.
 *
 * The new value is a ledger entry, not a target: it is set at the measured size plus one small
 * feature of headroom, and it is only allowed to fall. `docs/improvement/startup-perf/plan-with-qoder-1.md`
 * batches B6/B7 are what bring it back down.
 */
const EAGER_BUDGET = 3_600_000

// Landing in the eager graph is how a heavy surface silently becomes everyone's
// startup cost, so the surfaces that must stay split are named, not inferred.
const MUST_BE_LAZY = ['music', 'vendor-echarts']

/**
 * Surfaces already living in the boot graph, named so the gate stays green while the fix is
 * scheduled and red for anything new. Each entry is removed when its batch lands — and a stale
 * entry is itself a failure below, so this list cannot quietly accumulate.
 *
 * music: `app-shell.tsx:21` statically imports the `features/music` barrel for the floating player,
 * the hub modal, the immersive overlay, the session sync and the track menu, so nine music chunks
 * ride along. Tracked by plan batch B6 (barrel → sub-barrel).
 */
const KNOWN_IN_BOOT = ['music']

/**
 * A lazy library whose chunks are named by its own build — and one of which is shared
 * with other node modules — cannot be watched by prefix, so it is watched by content:
 * every chunk carrying the needle counts towards one budget. The shared chunk makes the
 * total an upper bound, one that only falls when the library does.
 */
const CONTENT_BUDGETS = [
  { name: '@excalidraw/excalidraw', needle: 'Excalifont', budget: 1_500_000 },
  // Measured 2026-10-04: one chunk, 1.12 MB raw / 371 kB gzipped, holding the whole library because an
  // option may name any chart type. It is fetched by the first ```echarts block in a session and by
  // nothing else — `MUST_BE_LAZY` below is what keeps that from drifting.
  { name: 'echarts', needle: 'ec_inner_', budget: 1_200_000 },
]

const failures = []
const report = []

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`bundle budget check failed: ${ASSETS_DIR} does not exist; run the build first`)
  process.exit(1)
}
if (!fs.existsSync(INDEX_HTML)) {
  console.error(`bundle budget check failed: ${INDEX_HTML} does not exist; run the build first`)
  process.exit(1)
}

const build = readChunks(ASSETS_DIR)
const files = build.files

// A bundle where no dynamic import was found is a bundle whose edges this script cannot read —
// rolldown changed its quoting style, or the assets dir is a stale/partial build. Either way the
// eager closure below would swallow the whole app and the budget would report nonsense, so the
// measurement itself is gated.
if (build.dynamicEdges === 0) {
  console.error(`bundle budget check failed: no dynamic import edge found across ${files.length} chunks; the edge regexes in scripts/lib/boot-graph.mjs no longer match this build`)
  process.exit(1)
}

const eager = firstPaintChunks(build, fs.readFileSync(INDEX_HTML, 'utf8'))
for (const prefix of FIRST_PAINT_ROOT_PREFIXES) {
  if (!eager.unmatchedRoots.includes(prefix)) continue
  failures.push(`eager: no chunk named "${prefix}*" exists, so the first-paint graph is understated — rename the source module or update FIRST_PAINT_ROOT_PREFIXES in scripts/lib/boot-graph.mjs`)
}
const eagerBytes = eager.bytes
const eagerKib = (eagerBytes / 1024).toFixed(1)
report.push(`eager: ${eagerKib} KiB across ${eager.chunks.size} chunks (budget ${(EAGER_BUDGET / 1024).toFixed(1)} KiB)`)
if (eagerBytes > EAGER_BUDGET) {
  failures.push(`eager: ${eagerKib} KiB across ${eager.chunks.size} chunks, exceeding the ${(EAGER_BUDGET / 1024).toFixed(1)} KiB budget`)
}
for (const prefix of MUST_BE_LAZY) {
  const leaked = [...eager.chunks].filter((file) => file.startsWith(`${prefix}-`) || file === prefix)
  if (!leaked.length) continue
  if (KNOWN_IN_BOOT.includes(prefix)) {
    report.push(`${prefix}: ${leaked.length} chunks are in the boot graph — tracked, see KNOWN_IN_BOOT`)
    continue
  }
  failures.push(`${prefix}: ${leaked.join(', ')} is in the eager graph (the lazy split was reverted)`)
}
// Bidirectional like every other ledger in this repo: a prefix that no longer leaks has to come out
// of KNOWN_IN_BOOT, so the list cannot quietly accumulate exemptions that hide a future regression.
for (const prefix of KNOWN_IN_BOOT) {
  if ([...eager.chunks].some((file) => file.startsWith(`${prefix}-`) || file === prefix)) continue
  failures.push(`${prefix}: listed in KNOWN_IN_BOOT but no longer in the eager graph — remove the exemption`)
}

const lazy = files.filter((file) => !eager.chunks.has(file))

for (const [prefix, budget] of Object.entries(BUDGETS)) {
  const matches = lazy.filter((file) => file.startsWith(`${prefix}-`))
  if (matches.length === 0) {
    failures.push(`${prefix}: no lazy chunk found (lazy split may have been reverted)`)
    continue
  }
  for (const file of matches) {
    const bytes = fs.statSync(path.join(ASSETS_DIR, file)).size
    const kib = (bytes / 1024).toFixed(1)
    report.push(`${prefix}: ${kib} KiB (budget ${(budget / 1024).toFixed(1)} KiB)`)
    if (bytes > budget) {
      failures.push(`${prefix}: ${file} is ${kib} KiB, exceeding the ${(budget / 1024).toFixed(1)} KiB budget`)
    }
  }
}

for (const { name, needle, budget } of CONTENT_BUDGETS) {
  const matches = files.filter((file) => build.contents.get(file).includes(needle))
  if (matches.length === 0) {
    failures.push(`${name}: no chunk carries "${needle}" (the library may have been dropped)`)
    continue
  }
  const bytes = matches.reduce((sum, file) => sum + fs.statSync(path.join(ASSETS_DIR, file)).size, 0)
  const kib = (bytes / 1024).toFixed(1)
  report.push(`${name}: ${kib} KiB across ${matches.length} chunks (budget ${(budget / 1024).toFixed(1)} KiB)`)
  if (bytes > budget) {
    failures.push(`${name}: ${kib} KiB across ${matches.length} chunks, exceeding the ${(budget / 1024).toFixed(1)} KiB budget`)
  }
}

if (failures.length === 0) {
  console.log(`bundle budget check passed (eager + ${Object.keys(BUDGETS).length} lazy prefixes):`)
  report.forEach((line) => console.log(`  ${line}`))
  process.exit(0)
} else {
  console.error('bundle budget check failed:')
  failures.forEach((line) => console.error(`  ${line}`))
  process.exit(1)
}
