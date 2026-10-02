// Manual measurement harness for the two graph costs the review could only infer (V-01 / V-02 / V-03 of
// the ledger): how much one global read asks of D1, and how much a settling layout asks of the main
// thread. It is deliberately not part of the CI gate, for the same reason as `measure-kanban.mjs`:
// timings on a shared runner are noise, so this prints numbers and a reading for a human to weigh.
//
// The SQL is *replicated* here rather than imported: the route's statements live inside functions that
// take a Workers `D1Database`, and this script has no TS loader (the repo ships no `vite-node`/`tsx`).
// To keep the replication from drifting silently, every number the statements are built around is read
// back out of the source files at run time (`sourceNumbers` below), so a changed bound fails here
// instead of quietly measuring something the app no longer does.
//
// The database is never touched where it lives: the persisted D1 file of a *non-ephemeral* `npm run
// dev:kv` is copied to a temporary file and the synthetic library is seeded into the copy, so a run
// cannot corrupt a developer's own instance.
//
// Usage: node scripts/measure-graph.mjs [baseUrl] [notes]
//   NOTES=10000            notes in the synthetic D1 library (argv[3] wins); V-02 / V-03 read this
//   DRAW_NODES=600         notes the browser section seeds through the API and draws; V-01 reads this.
//                          It stays below NOTES on purpose: the client cannot ask for more than
//                          `LIMITS.graphNodeLimitMax` nodes, so a bigger library only makes the read
//                          heavier (which is V-02/V-03's question), not the picture.
//   LINKS_PER_NOTE=5       outgoing links per note, so the library holds NOTES * LINKS_PER_NOTE rows
//   D1_PATH=...            the persisted D1 sqlite file, when the default glob finds none
//   SKIP_BROWSER=1         measure D1 only, no Chrome
//   WORST_MS_MAX=250       how long one settling frame may take before the run fails
//   READ_MS_MAX=400        how long one global read may take before the run fails
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
//   INKSTONE_CHROME_PATH   the browser to drive
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const ROOT = path.resolve(import.meta.dirname, '..')
const BASE = process.argv[2] ?? 'http://localhost:7712'
const NOTES = Number(process.argv[3] ?? process.env.NOTES ?? 10_000)
const LINKS_PER_NOTE = Number(process.env.LINKS_PER_NOTE ?? 5)
const WORST_MS_MAX = Number(process.env.WORST_MS_MAX ?? 250)
const READ_MS_MAX = Number(process.env.READ_MS_MAX ?? 400)
const RUNS = Number(process.env.RUNS ?? 5)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The bounds the route and the client share, read out of their own sources. A missing number is a hard
 * failure: the whole point of reading them here is that this script cannot measure a stale shape.
 */
function sourceNumbers() {
  const route = fs.readFileSync(path.join(ROOT, 'src/worker/routes/search/graph.ts'), 'utf8')
  const helpers = fs.readFileSync(path.join(ROOT, 'src/worker/routes/search/helpers.ts'), 'utf8')
  const limits = fs.readFileSync(path.join(ROOT, 'src/shared/constants.ts'), 'utf8')
  const read = (text, name) => {
    const match = text.match(new RegExp(`${name}\\s*(?:=|:)\\s*([0-9_]+)`))
    if (!match) throw new Error(`${name} is no longer a plain numeric constant; update this script`)
    return Number(match[1].replace(/_/g, ''))
  }
  return {
    chunk: read(route, 'GRAPH_NOTE_ID_CHUNK'),
    candidates: read(helpers, 'GRAPH_EDGE_CANDIDATE_LIMIT'),
    limitDefault: read(limits, 'graphNodeLimitDefault'),
    limitMax: read(limits, 'graphNodeLimitMax'),
  }
}

function findPersistedDatabase() {
  const dir = path.join(ROOT, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  const data = files.filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size }))
    .sort((a, b) => b.size - a.size)
  const chosen = process.env.D1_PATH ?? data[0]?.name
  if (!chosen) throw new Error('no persisted D1 file: run `npm run dev:kv` without INKSTONE_EPHEMERAL_DEV once, or set D1_PATH')
  const absolute = path.isAbsolute(chosen) ? chosen : path.join(dir, chosen)
  if (!fs.existsSync(absolute)) throw new Error(`D1 file not found: ${absolute}`)
  return absolute
}

/** Migrations only run when a request touches the database, so an untouched file has no tables at all. */
function assertSchema(db) {
  const has = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'notes'").get().n
  if (!Number(has)) {
    throw new Error('the D1 file holds no tables yet: open the running instance once (any page load signs in and migrates), then re-run')
  }
}

/** The fixture user and library, written into a copy of the developer's own database file. */
function seedFixture(db, notes, linksPerNote) {
  const userId = 'measure-graph-user'
  const now = 1_700_000_000_000
  db.exec('BEGIN')
  db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, login, name, role, created_at, last_seen_at)
    VALUES (?, ?, 'x', ?, 'Measure', 'owner', ?, ?)`).run(userId, 'measure-graph', 'measure-graph', now, now)
  const insertNote = db.prepare(`INSERT OR REPLACE INTO notes
    (id, user_id, title, title_key, content, excerpt, rev, word_count, char_count, is_archived, created_at, updated_at)
    VALUES (?, ?, ?, ?, '', '', 1, 10, 60, 0, ?, ?)`)
  const insertLink = db.prepare(`INSERT OR REPLACE INTO links (source_note_id, target_key, target_title, target_note_id, user_id)
    VALUES (?, ?, ?, ?, ?)`)
  for (let index = 0; index < notes; index++) {
    const id = `note-${String(index).padStart(6, '0')}`
    insertNote.run(id, userId, `Note ${index}`, `note ${index}`, now - index, now - index)
  }
  for (let index = 0; index < notes; index++) {
    const source = `note-${String(index).padStart(6, '0')}`
    for (let hop = 1; hop <= linksPerNote; hop++) {
      const target = (index + hop * 7) % notes
      const targetId = `note-${String(target).padStart(6, '0')}`
      insertLink.run(source, `note ${target}`, `Note ${target}`, targetId, userId)
    }
  }
  db.exec('COMMIT')
  db.exec('ANALYZE')
  return userId
}

const GLOBAL_PAGE = `SELECT n.id, n.title, n.folder_id, f.name AS folder_name, f.color AS folder_color,
  COALESCE(d.degree, 0) AS degree, COALESCE(d.in_degree, 0) AS in_degree, COALESCE(d.out_degree, 0) AS out_degree
  FROM notes n LEFT JOIN folders f ON f.id = n.folder_id AND f.user_id = n.user_id
  LEFT JOIN (
    SELECT note_id, SUM(is_endpoint) AS degree, SUM(is_target) AS in_degree, SUM(is_source) AS out_degree
    FROM (
      SELECT l.source_note_id AS note_id, 1 AS is_endpoint, 0 AS is_target, 1 AS is_source
        FROM links l JOIN notes adj ON adj.id = l.target_note_id AND adj.user_id = l.user_id
          AND adj.deleted_at IS NULL AND adj.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
      UNION ALL
      SELECT l.target_note_id AS note_id, 1, 1, 0
        FROM links l JOIN notes src ON src.id = l.source_note_id AND src.user_id = l.user_id
          AND src.deleted_at IS NULL AND src.is_archived = 0
        WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
    ) GROUP BY note_id
  ) d ON d.note_id = n.id
  WHERE n.user_id = ? AND n.deleted_at IS NULL AND n.is_archived = 0
  ORDER BY COALESCE(d.degree, 0) DESC, n.updated_at DESC, n.id ASC LIMIT ?`

const DEGREE_ONLY = `SELECT COUNT(*) AS rows, SUM(degree) AS endpoints FROM (
  SELECT note_id, SUM(is_endpoint) AS degree FROM (
    SELECT l.source_note_id AS note_id, 1 AS is_endpoint FROM links l
      JOIN notes adj ON adj.id = l.target_note_id AND adj.user_id = l.user_id
        AND adj.deleted_at IS NULL AND adj.is_archived = 0
      WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
    UNION ALL
    SELECT l.target_note_id AS note_id, 1 FROM links l
      JOIN notes src ON src.id = l.source_note_id AND src.user_id = l.user_id
        AND src.deleted_at IS NULL AND src.is_archived = 0
      WHERE l.user_id = ? AND l.target_note_id IS NOT NULL
  ) GROUP BY note_id)`

const LINK_ROWS = `SELECT source_note_id, target_note_id, target_key, target_title FROM links
  WHERE user_id = ? AND source_note_id IN (?) ORDER BY target_key ASC LIMIT ?`

function timeRuns(db, sql, binds, runs) {
  const samples = []
  let last = null
  for (let index = 0; index < runs; index++) {
    const started = performance.now()
    last = db.prepare(sql).all(...binds)
    samples.push(performance.now() - started)
  }
  samples.sort((a, b) => a - b)
  return { ms: samples[Math.floor(samples.length / 2)], min: samples[0], max: samples[samples.length - 1], rows: last.length, last }
}

function queryPlan(db, sql, binds) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds).map((row) => String(row.detail).trim())
}

function readSection(db, userId, numbers) {
  const page = timeRuns(db, GLOBAL_PAGE, [userId, userId, userId, numbers.limitDefault + 1], RUNS)
  const wide = timeRuns(db, GLOBAL_PAGE, [userId, userId, userId, numbers.limitMax + 1], RUNS)
  const degree = timeRuns(db, DEGREE_ONLY, [userId, userId], RUNS)
  const ids = db.prepare(GLOBAL_PAGE).all(userId, userId, userId, numbers.limitDefault + 1)
    .slice(0, numbers.limitDefault).map((row) => row.id)
  const chunks = []
  for (let index = 0; index < ids.length; index += numbers.chunk) {
    const chunk = ids.slice(index, index + numbers.chunk)
    const sql = LINK_ROWS.replace('IN (?)', `IN (${chunk.map(() => '?').join(',')})`)
    chunks.push(timeRuns(db, sql, [userId, ...chunk, numbers.candidates + 1], RUNS))
  }
  const read = (list) => list.reduce((total, entry) => total + entry.rows, 0)
  return {
    globalPage: { defaultLimit: page, maxLimit: wide },
    degree: { ms: degree.ms, min: degree.min, max: degree.max, aggregated: Number(degree.last[0].rows), endpoints: Number(degree.last[0].endpoints) },
    linkReads: { chunks: chunks.length, rows: read(chunks), ms: chunks.reduce((total, entry) => total + entry.ms, 0), max: Math.max(...chunks.map((entry) => entry.max)) },
    plans: { globalPage: queryPlan(db, GLOBAL_PAGE, [userId, userId, userId, 351]), linkReads: queryPlan(db, LINK_ROWS.replace('IN (?)', 'IN (?,?)'), [userId, ids[0], ids[1], numbers.candidates + 1]) },
  }
}

function localSection(db, userId) {
  const neighborhood = (depth) => `WITH RECURSIVE neighborhood(id, depth, path) AS (
    SELECT ? AS id, 0 AS depth, ',' || ? || ',' AS path
    UNION
    SELECT adjacent.id, neighborhood.depth + 1, neighborhood.path || adjacent.id || ','
    FROM neighborhood
    JOIN links l ON l.user_id = ? AND l.target_note_id IS NOT NULL
      AND (l.source_note_id = neighborhood.id OR l.target_note_id = neighborhood.id)
    JOIN notes adjacent ON adjacent.id = CASE
      WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END
      AND adjacent.user_id = l.user_id AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0
    WHERE neighborhood.depth < ? AND INSTR(neighborhood.path, ',' || adjacent.id || ',') = 0
  ), nearby AS (SELECT id, MIN(depth) AS depth FROM neighborhood GROUP BY id)
  SELECT COUNT(*) AS rows FROM nearby`
  const center = 'note-000000'
  const out = {}
  for (const depth of [1, 2, 3]) {
    const samples = []
    let rows = 0
    for (let index = 0; index < RUNS; index++) {
      const started = performance.now()
      rows = Number(db.prepare(neighborhood(depth)).get(center, center, userId, depth).rows)
      samples.push(performance.now() - started)
    }
    samples.sort((a, b) => a - b)
    out[`depth${depth}`] = { ms: samples[Math.floor(samples.length / 2)], max: samples[samples.length - 1], nodes: rows }
  }
  return out
}

function describeReads(measure, numbers) {
  const lines = [
    'V-02 how many links rows one global read takes',
    `  a page of ${numbers.limitDefault} nodes -> ${measure.linkReads.chunks} chunked statements (<=${numbers.chunk} ids each), reading back ${measure.linkReads.rows} links rows in ${measure.linkReads.ms.toFixed(1)}ms, slowest single statement ${measure.linkReads.max.toFixed(1)}ms`,
    `  candidate cap ${numbers.candidates} (past it the page is truncated); page cost including the degree aggregation: median ${measure.globalPage.defaultLimit.ms.toFixed(1)}ms / worst ${measure.globalPage.defaultLimit.max.toFixed(1)}ms at the default limit, median ${measure.globalPage.maxLimit.ms.toFixed(1)}ms / worst ${measure.globalPage.maxLimit.max.toFixed(1)}ms at ${numbers.limitMax}`,
    'V-03 the degree aggregation',
    `  aggregates ${measure.degree.aggregated} note rows over ${measure.degree.endpoints} endpoints, median ${measure.degree.ms.toFixed(1)}ms / worst ${measure.degree.max.toFixed(1)}ms (${((measure.degree.ms / measure.globalPage.defaultLimit.ms) * 100).toFixed(0)}% of the page read)`,
    `  plan: ${measure.plans.globalPage.join(' | ')}`,
    `  links read plan: ${measure.plans.linkReads.join(' | ')}`,
  ]
  return lines.join('\n')
}

/** The library the browser measures against, built through the public API so the route sees its own shape. */
async function seedThroughApi(base, count, linksPerNote) {
  const headers = { 'content-type': 'application/json', 'x-inkstone-client': '1' }
  const username = process.env.INKSTONE_MEASURE_USERNAME ?? 'graph-perf'
  const password = process.env.INKSTONE_MEASURE_PASSWORD ?? 'supersecret99'
  const grab = (res) => (res.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')
  const started = Date.now()
  let cookie = grab(await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers, body: JSON.stringify({ username, password }),
  }).then((res) => (res.status === 200 ? res : Promise.reject(new Error(`login ${res.status}`)))).catch(() => ({ headers: { getSetCookie: () => [] } })))
  if (!cookie) {
    // The fixture account is created the first time the script runs; after that it signs in again, which
    // is what lets a second run reuse a library it already paid 25 seconds to write.
    const registered = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers, body: JSON.stringify({ username, password, locale: 'en-US' }),
    })
    cookie = grab(registered)
    if (registered.status !== 201) {
      throw new Error(`the fixture account is neither signed in nor creatable (register ${registered.status}); `
        + 'run this against a fresh instance, or point INKSTONE_MEASURE_USERNAME/PASSWORD at one that exists')
    }
  }
  const id = (index) => `Perf note ${index}`
  // Seeding 600 notes costs ~26 seconds, so a run that finds a library of the asked size keeps it: the
  // measurement wants a library this big, not a freshly written one.
  const existing = await fetch(`${base}/api/graph?mode=global&limit=50`, { headers: { ...headers, cookie } })
    .then((res) => res.json())
    .then((body) => Number(body?.meta?.totalNodes ?? 0), () => 0)
  if (existing >= count) return { cookie, ms: 0, count: existing, reused: true }
  for (let index = 0; index < count; index++) {
    const links = Array.from({ length: linksPerNote }, (_unused, hop) => `[[${id((index + hop * 7) % count)}]]`).join(' and ')
    const res = await fetch(`${base}/api/notes`, {
      method: 'POST', headers: { ...headers, cookie },
      body: JSON.stringify({ title: `Perf note ${index}`, content: `# Perf note ${index}\n\nLinks to ${links}.\n` }),
    })
    if (res.status >= 400) throw new Error(`the instance refused note ${index}: ${res.status}`)
  }
  return { cookie, ms: Date.now() - started, count, reused: false }
}

const SAMPLE_AND_LAYOUT = `
  window.__frames = []
  window.__tasks = []
  let last = performance.now()
  const tick = (now) => { window.__frames.push(now - last); last = now; window.__raf = requestAnimationFrame(tick) }
  window.__raf = requestAnimationFrame(tick)
  try { new PerformanceObserver((list) => { for (const entry of list.getEntries()) window.__tasks.push(entry.duration) }).observe({ entryTypes: ['longtask'] }) } catch {}
`

/**
 * What one settling frame costs, and how much of it is painting. The paint number comes from the real
 * draw functions fed by the real layout builder; the physics share is the difference between the frame
 * the browser reported and that paint cost, because `advancePhysics` is module-private and this script
 * does not export product code just to time it.
 */
async function paintBenchmark(page, nodes, linksPerNote) {
  return page.evaluate(async ({ nodes, linksPerNote }) => {
    const module = await import('/src/client/features/graph/graph-panel/canvas-draw.ts')
    const constants = await import('/src/client/features/graph/graph-panel/constants.ts')
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 760
    const ctx = canvas.getContext('2d')
    const ids = Array.from({ length: nodes }, (_unused, index) => `bench-${index}`)
    const data = {
      nodes: ids.map((id, index) => ({
        id, title: `Bench note ${index}`, kind: 'note', degree: linksPerNote, inDegree: 1, outDegree: linksPerNote,
        folderId: null, folderName: null, folderColor: null, tags: [],
      })),
      edges: ids.flatMap((id, index) => Array.from({ length: linksPerNote }, (_unused, hop) => ({ source: id, target: ids[(index + hop * 7) % ids.length] }))),
      meta: { mode: 'global', centerId: null, depth: 1, totalNodes: nodes, totalEdges: nodes * linksPerNote, truncated: false, limit: nodes },
    }
    const prefs = { ...constants.DEFAULT_PREFERENCES, limit: nodes }
    const state = {
      nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: canvas.width, height: canvas.height,
      viewLeft: 0, viewTop: 0, dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 0, raf: 0, schedule: null,
    }
    const buildStart = performance.now()
    module.buildInitialLayout(data, prefs, state)
    const buildMs = performance.now() - buildStart
    const colors = module.readThemeColors()
    const style = getComputedStyle(document.body)
    const paint = () => {
      ctx.clearRect(0, 0, state.width, state.height)
      ctx.save()
      ctx.translate(state.offsetX, state.offsetY)
      ctx.scale(state.scale, state.scale)
      module.drawEdges({ ctx, state, colors, emphasizedId: null, arrows: true })
      module.drawNodes({ ctx, state, colors, emphasizedId: null, neighborIds: new Set(), groupBy: 'none', selectedIdRef: { current: null }, activeNoteIdRef: { current: null } })
      module.drawLabels({ ctx, state, colors, emphasizedId: null, neighborIds: new Set(), fontFamily: style.getPropertyValue('--font-ui'), scale: state.scale, labels: true })
      ctx.restore()
    }
    const samples = []
    for (let frame = 0; frame < 40; frame++) {
      const started = performance.now()
      paint()
      samples.push(performance.now() - started)
    }
    samples.sort((a, b) => a - b)
    return { nodes: state.nodes.length, edges: state.edges.length, buildMs, paintMedian: samples[20], paintMax: samples[samples.length - 1] }
  }, { nodes, linksPerNote })
}

async function browserSection() {
  const { chromeExecutablePath } = await import('./e2e-harness.mjs')
  const puppeteer = (await import('puppeteer-core')).default
  const health = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) }).then((res) => res.ok, () => false)
  if (!health) throw new Error(`${BASE} is not answering /api/health; start a non-ephemeral \`npm run dev:kv\``)
  const drawn = Number(process.env.DRAW_NODES ?? 600)
  const seeded = await seedThroughApi(BASE, drawn, LINKS_PER_NOTE)
  const browser = await puppeteer.launch({ executablePath: chromeExecutablePath(), headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle2', timeout: 60_000 })
    await page.evaluate((cookie) => { document.cookie = cookie }, seeded.cookie)
    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(3_500)
    await page.evaluate((limit) => localStorage.setItem('inkstone.graph.preferences.v1', JSON.stringify({ limit })), limitOf(drawn))
    await page.reload({ waitUntil: 'networkidle2' })
    await sleep(3_500)
    await page.evaluate(SAMPLE_AND_LAYOUT)
    const openedAt = Date.now()
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyK')
    await page.keyboard.up('Control')
    await sleep(1_200)
    await page.keyboard.type('graph')
    await sleep(1_200)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-surface="graph"] canvas', { timeout: 30_000 })
    await sleep(Number(process.env.SETTLE_WINDOW_MS ?? 8_000))
    const sampled = await page.evaluate(() => {
      cancelAnimationFrame(window.__raf)
      const frames = window.__frames.slice(1).sort((a, b) => a - b)
      const tasks = window.__tasks.slice().sort((a, b) => a - b)
      const at = (list, share) => list[Math.min(list.length - 1, Math.floor(list.length * share))] ?? 0
      return {
        frames: frames.length,
        mean: frames.reduce((total, value) => total + value, 0) / Math.max(1, frames.length),
        p95: at(frames, 0.95), max: at(frames, 1),
        tasks: tasks.length, worstTask: at(tasks, 1),
        drawn: document.querySelectorAll('[data-surface="graph"] canvas').length,
        stats: document.querySelector('[data-surface="graph"]')?.textContent?.slice(0, 60),
      }
    })
    const bench = await paintBenchmark(page, drawn, LINKS_PER_NOTE)
    const perFrame = sampled.mean
    return { seededInMs: seeded.ms, count: seeded.count, reused: seeded.reused, settle: sampled, bench, physicsEstimate: perFrame - bench.paintMedian }
  } finally {
    await browser.close()
  }
}

function limitOf(nodes) {
  return Math.min(sourceNumbers().limitMax, Math.max(sourceNumbers().limitDefault, nodes))
}

function describeLayout(read) {
  const lines = [
    `V-01 what one settling frame costs (browser, ${read.bench.nodes} nodes on screen)`,
    `  fixture: ${read.reused ? `reused the ${read.count} notes already on the instance` : `wrote ${read.count} notes x ${LINKS_PER_NOTE} links through the public API in ${read.seededInMs}ms`}`,
    `  settle window: ${read.settle.frames} frames, mean ${read.settle.mean.toFixed(1)}ms, p95 ${read.settle.p95.toFixed(1)}ms, worst ${read.settle.max.toFixed(1)}ms; ${read.settle.tasks} long tasks, longest ${read.settle.worstTask.toFixed(1)}ms`,
    `  painting (real functions, real ctx, offscreen 1200x760): median ${read.bench.paintMedian.toFixed(2)}ms per frame, worst ${read.bench.paintMax.toFixed(2)}ms; building the layout (first physics steps included) ${read.bench.buildMs.toFixed(1)}ms over ${read.bench.nodes} nodes / ${read.bench.edges} edges`,
    `  physics by subtraction: ${read.settle.mean.toFixed(1)}ms frame - ${read.bench.paintMedian.toFixed(1)}ms paint = ${read.physicsEstimate.toFixed(1)}ms, an upper bound because the difference also carries the browser's own compositing and reclaim`,
    `  what the surface says: ${read.settle.stats}`,
  ]
  return lines.join('\n')
}

async function main() {
  const numbers = sourceNumbers()
  const source = findPersistedDatabase()
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inkstone-graph-measure-')), 'fixture.sqlite')
  fs.copyFileSync(source, copy)
  for (const side of ['-wal', '-shm']) if (fs.existsSync(source + side)) fs.copyFileSync(source + side, copy + side)
  const db = new DatabaseSync(copy)
  assertSchema(db)
  const started = Date.now()
  const userId = seedFixture(db, NOTES, LINKS_PER_NOTE)
  const seededIn = Date.now() - started
  const counts = db.prepare('SELECT (SELECT COUNT(*) FROM notes WHERE user_id = ?) n, (SELECT COUNT(*) FROM links WHERE user_id = ?) l').get(userId, userId)
  console.log(`fixture: ${source} → ${copy}`)
  console.log(`fixture: ${counts.n} notes / ${counts.l} links seeded in ${seededIn}ms (bounds: chunk=${numbers.chunk} candidates=${numbers.candidates} limit=${numbers.limitDefault}..${numbers.limitMax})`)

  const reads = readSection(db, userId, numbers)
  console.log(describeReads(reads, numbers))
  const local = localSection(db, userId)
  console.log(`V-02b the local neighbourhood walk: ${Object.entries(local).filter(([key]) => key.startsWith('depth')).map(([key, value]) => `${key} ${value.nodes} nodes / ${value.ms.toFixed(1)}ms (worst ${value.max.toFixed(1)}ms)`).join(', ')}`)
  db.close()
  fs.rmSync(path.dirname(copy), { recursive: true, force: true })

  const failing = []
  if (reads.globalPage.maxLimit.max > READ_MS_MAX) failing.push(`one global read took ${reads.globalPage.maxLimit.max.toFixed(0)}ms > ${READ_MS_MAX}ms`)
  if (reads.degree.max > READ_MS_MAX) failing.push(`the degree aggregation took ${reads.degree.max.toFixed(0)}ms > ${READ_MS_MAX}ms`)

  if (!process.env.SKIP_BROWSER) {
    const layout = await browserSection()
    console.log(describeLayout(layout))
    if (layout.settle.max > WORST_MS_MAX) failing.push(`one frame lasted ${layout.settle.max.toFixed(0)}ms > ${WORST_MS_MAX}ms`)
  }
  console.log(`\nreading: ${failing.length ? `over budget - ${failing.join('; ')}` : 'inside budget (reported, not a reason to change code)'}`)
}

if (process.env.SKIP_MAIN !== '1') main().then(() => process.exit(0), (error) => { console.error(String(error?.stack ?? error)); process.exit(1) })
