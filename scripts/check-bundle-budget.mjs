import fs from 'node:fs'
import path from 'node:path'

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
  music: 96_000,
}

// Eager layer: what the document pulls in plus the boot chunk the entry imports,
// followed through their static imports. Every byte here is fetched before the
// shell can paint, so the whole graph shares one cap instead of per-chunk ones.
const EAGER_BUDGET = 1_000_000

// Landing in the eager graph is how a heavy surface silently becomes everyone's
// startup cost, so the surfaces that must stay split are named, not inferred.
const MUST_BE_LAZY = ['music']

/**
 * A lazy library whose chunks are named by its own build — and one of which is shared
 * with other node modules — cannot be watched by prefix, so it is watched by content:
 * every chunk carrying the needle counts towards one budget. The shared chunk makes the
 * total an upper bound, one that only falls when the library does.
 */
const CONTENT_BUDGETS = [
  { name: '@excalidraw/excalidraw', needle: 'Excalifont', budget: 1_500_000 },
]

// Static imports only: `import("./x.js")` is a dynamic import and stays lazy.
const STATIC_IMPORT = /from"\.\/([A-Za-z0-9._-]+\.js)"|import"\.\/([A-Za-z0-9._-]+\.js)"/g

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

const files = fs.readdirSync(ASSETS_DIR).filter((file) => file.endsWith('.js'))

function staticImportsOf(file) {
  const source = fs.readFileSync(path.join(ASSETS_DIR, file), 'utf8')
  const found = new Set()
  for (const match of source.matchAll(STATIC_IMPORT)) found.add(match[1] ?? match[2])
  return found
}

function eagerGraph() {
  const html = fs.readFileSync(INDEX_HTML, 'utf8')
  const roots = [...html.matchAll(/assets\/([A-Za-z0-9._-]+\.js)/g)].map((match) => match[1])
  // The entry boots the shell with a dynamic import, so the shell is part of the
  // first paint even though no static edge points at it.
  for (const file of files) if (file.startsWith('app-')) roots.push(file)
  const eager = new Set()
  const queue = [...roots]
  while (queue.length) {
    const file = queue.pop()
    if (eager.has(file)) continue
    eager.add(file)
    for (const imported of staticImportsOf(file)) queue.push(imported)
  }
  return eager
}

const eager = eagerGraph()
const eagerBytes = [...eager].reduce((sum, file) => sum + fs.statSync(path.join(ASSETS_DIR, file)).size, 0)
const eagerKib = (eagerBytes / 1024).toFixed(1)
report.push(`eager: ${eagerKib} KiB across ${eager.size} chunks (budget ${(EAGER_BUDGET / 1024).toFixed(1)} KiB)`)
if (eagerBytes > EAGER_BUDGET) {
  failures.push(`eager: ${eagerKib} KiB across ${eager.size} chunks, exceeding the ${(EAGER_BUDGET / 1024).toFixed(1)} KiB budget`)
}
for (const prefix of MUST_BE_LAZY) {
  const leaked = [...eager].filter((file) => file.startsWith(`${prefix}-`) || file === prefix)
  if (leaked.length) {
    failures.push(`${prefix}: ${leaked.join(', ')} is in the eager graph (the lazy split was reverted)`)
  }
}

const lazy = files.filter((file) => !eager.has(file))

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
  const matches = files.filter((file) => fs.readFileSync(path.join(ASSETS_DIR, file)).includes(needle))
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
