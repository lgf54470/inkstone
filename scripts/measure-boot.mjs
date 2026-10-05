/**
 * Boot timing, on a cold cache, for the three things a reader actually experiences as "slow":
 *
 *   anonymous  — open the site with no session at all.
 *   authed     — open it as a signed-in reader, up to the moment the shell can be used.
 *   blocks     — open a note holding one of every rich block, up to the moment all five have drawn.
 *
 * Every other `measure-*.mjs` here starts from a page that is already up. This one measures the
 * getting-up, because that is the reported problem: `check-bundle-budget` counts the eager graph,
 * but nothing measured how long the boot takes or how many requests it costs, so every claim about
 * startup was a claim about bytes.
 *
 * It reports; it only judges when a ceiling is passed in. The first run of a new build should not
 * judge — pinning a threshold to a single sample enshrines that sample's noise.
 *
 *   node scripts/measure-boot.mjs                                     # dev server
 *   INKSTONE_MEASURE_PREVIEW=1 node scripts/measure-boot.mjs          # built output, previewed
 *   SHELL_MS_MAX=2500 REQUESTS_MAX=400 node scripts/measure-boot.mjs  # judge
 *
 * Env: INKSTONE_CHROME_PATH, INKSTONE_VISUAL_USERNAME/PASSWORD (else the script registers its own
 * account through the API), INKSTONE_MEASURE_PREVIEW, PORT, and the ceilings ANON_MS_MAX,
 * SHELL_MS_MAX, BLOCKS_MS_MAX, REQUESTS_MAX and WORST_TASK_MAX.
 *
 * It deliberately does not report transferred bytes. Summing `transferSize` in the page is not
 * trustworthy here: a service-worker response reports 0, the buffer truncates, and a shared browser
 * cache answers differently per scenario — measured runs disagreed by 60×. Bytes are
 * `check-bundle-budget`'s job, and it measures them from the build, which is the authoritative
 * source anyway.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { chromeExecutablePath, sleep } from './e2e-harness.mjs'

const USE_PREVIEW = process.env.INKSTONE_MEASURE_PREVIEW === '1'
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Boot-Owner'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'boot-password-1'
// `MEASURE_WARM_SW=1` keeps the service worker and its caches in place, so the second and third
// scenarios measure a reload served by the precache instead of a cold start.
const COLD_SW = process.env.MEASURE_WARM_SW !== '1'
// `MEASURE_URL_TALLY=1` keeps every same-origin URL so a run can be attributed to the packages that
// asked for them. Dev serves one request per module, so "how many requests is one package" is the
// only way to see what the request count is actually made of.
const URL_TALLY = process.env.MEASURE_URL_TALLY === '1'
const URL_TALLY_ICONS = URL_TALLY
  ? fs.readdirSync(path.resolve(import.meta.dirname, '../node_modules/lucide-react/dist/esm/icons'))
    .filter((name) => name.endsWith('.mjs'))
    .map((name) => name.replace(/\.mjs$/, ''))
  : []
const CEILINGS = {
  anonMs: Number(process.env.ANON_MS_MAX ?? 0),
  shellMs: Number(process.env.SHELL_MS_MAX ?? 0),
  blocksMs: Number(process.env.BLOCKS_MS_MAX ?? 0),
  requests: Number(process.env.REQUESTS_MAX ?? 0),
  worstTask: Number(process.env.WORST_TASK_MAX ?? 0),
}

/**
 * What "this block has drawn" means, per family. The renderer emits a placeholder carrying the
 * fence body and the interactive layer replaces it, so the attribute is present early: these
 * selectors are the ones the enhance pass leaves behind, not the ones markup alone would produce.
 */
const BLOCK_MARKERS = {
  chart: '[data-chart]',
  mermaid: '[data-mermaid]',
  echarts: '[data-echarts]',
  mindmap: '[data-mindmap], .me-wrap',
  kanban: '[data-kanban]',
}

/** A note holding one of every rich block, with prose on both sides of them. */
const ALL_BLOCKS_NOTE = [
  '# Boot probe',
  '',
  'Prose before the blocks, so the renderer is not asked to draw a document of nothing but fences.',
  '',
  '```chart',
  '{"type":"bar","data":{"labels":["Jan","Feb"],"datasets":[{"label":"Revenue","data":[12,19]}]}}',
  '```',
  '',
  '```mermaid',
  'graph TD; A[Start]--> B[Done]',
  '```',
  '',
  '```echarts',
  '{"xAxis":{"type":"category","data":["a","b"]},"yAxis":{},"series":[{"type":"line","data":[1,4]}]}',
  '```',
  '',
  '```mindmap',
  '{"nodeData":{"topic":"Core","children":[{"topic":"Branch"}]}}',
  '```',
  '',
  '```kanban',
  '{"title":"Boot","columns":[{"id":"todo","name":"To do","items":[{"id":"c1","title":"Ship it"}]}]}',
  '```',
  '',
  'Prose after, so a block that never draws cannot hide behind a truncated document.',
  '',
].join('\n')

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(Number(process.env.PORT ?? port)))
    })
  })
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 401) return
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`timed out waiting for ${url}: ${lastError?.message ?? 'no response'}`)
}

/**
 * Installed before any application script runs, so the clock starts at navigation rather than when
 * puppeteer first managed to reply. Marks are taken once, on the frame where they first appear.
 * `document.documentElement` does not exist during the very first evaluation of a fresh document —
 * an unguarded observer threw there and every mark stayed null.
 */
function bootObserverSource(markers, doneSelector) {
  window.__boot = { marks: { bootDone: 0, shell: 0, blocks: {}, done: 0 }, tasks: [], seen: null }
  // The resource-timing buffer holds 250 entries by default, and a cold boot asks for far more than
  // that in the built output — silently truncating the byte totals this script exists to report.
  if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(10_000)
  window.__bootDoneSelector = doneSelector
  const now = () => performance.now()
  const read = () => {
    const root = document.documentElement
    if (!root) return false
    const marks = window.__boot.marks
    if (!marks.bootDone && document.querySelector('#boot.done')) marks.bootDone = now()
    if (!marks.shell && document.querySelector('aside, [data-note-list]')) marks.shell = now()
    if (!marks.done && window.__bootDoneSelector && document.querySelector(window.__bootDoneSelector)) marks.done = now()
    for (const kind of Object.keys(markers)) {
      if (!marks.blocks[kind] && document.querySelector(markers[kind])) marks.blocks[kind] = now()
    }
    return marks.shell && Object.keys(marks.blocks).length >= Object.keys(markers).length
  }
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__boot.tasks.push(Math.round(entry.duration))
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // A headless shell without long-task support reports 0 tasks rather than failing the run:
      // the navigation timings above still stand on their own.
    }
  }
  const observer = new MutationObserver(() => { if (read()) observer.disconnect() })
  const start = () => {
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    read()
  }
  if (document.documentElement) start()
  else document.addEventListener('readystatechange', start, { once: true })
}

async function newMeasuredPage(browser, base, doneSelector) {
  const page = await browser.newPage()
  const client = await page.createCDPSession()
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  // The built output registers a service worker that precaches the whole boot graph, so a second
  // visit is served from disk and measures nothing about the network. Unhook it before a cold run;
  // `swWarm` below is what measures the opposite.
  if (COLD_SW) {
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }).catch(() => {})
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
      await Promise.all(registrations.map((r) => r.unregister()))
      const keys = await caches?.keys?.() ?? []
      await Promise.all(keys.map((k) => caches.delete(k)))
    })
  }
  const tally = { requests: 0, urls: [] }
  page.on('response', (response) => {
    if (!response.url().startsWith(base)) return
    tally.requests++
    if (URL_TALLY) tally.urls.push(response.url().slice(base.length))
  })
  await page.evaluateOnNewDocument(bootObserverSource, BLOCK_MARKERS, doneSelector ?? '')
  await page.setViewport({ width: 1440, height: 900 })
  return { page, tally }
}

/**
 * Opens the probe note the only way a reader can: by clicking its row. The click is stamped on the
 * page's own clock because `blocksMs` is measured from navigation, and without the stamp the cost
 * of getting the shell up and the cost of drawing five blocks would be one indistinguishable number.
 */
async function clickNoteRow(page, id, timeoutMs = 25_000) {
  // The shell marker fires as soon as the sidebar exists, which is well before the note list has
  // hydrated from the sync — one attempt at that moment finds no row. Poll instead, and on failure
  // say how many rows the list did have, so a missing row is distinguishable from a wrong selector.
  // Rows carry data-note-id and are windowed, so the id is the only stable handle: matching on the
  // title text would also hit the note's own heading once it opens.
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const clicked = await page.evaluate((noteId) => {
      const row = document.querySelector(`[data-note-id="${noteId}"]`)
      if (!row)
        return { at: 0, rows: document.querySelectorAll('[role="option"]').length, total: document.querySelectorAll('[data-note-id]').length }
      row.click()
      return { at: performance.now(), rows: 0, total: 0 }
    }, id)
    if (clicked.at) return clicked.at
    if (Date.now() > deadline)
      throw new Error(`note row for ${id} never appeared; the list had ${clicked.rows} rows and ${clicked.total} note-ids in the document`)
    await sleep(250)
  }
}

async function runScenario(browser, base, { label, url, expectBlocks, timeoutMs, afterShell, doneSelector }) {
  const { page, tally } = await newMeasuredPage(browser, base, doneSelector)
  const wallStart = Date.now()
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded' })
  const deadline = Date.now() + timeoutMs
  let state = null
  let openedAt = 0
  for (;;) {
    state = await page.evaluate(() => window.__boot)
    if (afterShell && !openedAt && state.marks.shell) {
      await sleep(400)
      openedAt = await clickNoteRow(page, afterShell)
    }
    const drawn = Object.keys(state.marks.blocks).length
    const reached = expectBlocks
      ? drawn >= Object.keys(BLOCK_MARKERS).length
      : Boolean(doneSelector ? state.marks.done : state.marks.shell)
    if (reached || Date.now() > deadline) break
    await sleep(100)
  }
  const nav = await page.evaluate(() => {
    const entry = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    return {
      fcp: fcp ? Math.round(fcp.startTime) : 0,
      dcl: entry ? Math.round(entry.domContentLoadedEventEnd) : 0,
      bodyChars: document.body ? document.body.innerHTML.length : 0,
      asides: document.querySelectorAll('aside').length,
      fences: document.querySelectorAll('[data-mermaid],[data-chart],[data-echarts],[data-kanban],[data-mindmap]').length,
      // A response served by the service worker has transferSize 0 — it never touched the network.
      // Counting those as free would report a warm-SW reload as if it were the cold boot.
      fromServiceWorker: performance.getEntriesByType('resource').filter((e) => e.transferSize === 0 && e.initiatorType === 'fetch').length,
      entries: performance.getEntriesByType('resource').length,
    }
  })
  await page.close()
  const drawn = Object.keys(state.marks.blocks).length
  return {
    label,
    requests: tally.requests,
    fcpMs: nav.fcp,
    dclMs: nav.dcl,
    bootDoneMs: Math.round(state.marks.bootDone),
    shellMs: Math.round(state.marks.shell),
    blocksDrawn: drawn,
    blocksMs: expectBlocks ? Math.round(Math.max(0, ...Object.values(state.marks.blocks))) : 0,
    openedAtMs: Math.round(openedAt),
    blocksFromClickMs: expectBlocks && openedAt ? Math.round(Math.max(0, ...Object.values(state.marks.blocks)) - openedAt) : 0,
    longTasks: state.tasks.length,
    longTaskTotalMs: state.tasks.reduce((sum, t) => sum + t, 0),
    worstTaskMs: state.tasks.length ? Math.max(...state.tasks) : 0,
    wallMs: Date.now() - wallStart,
    complete: expectBlocks
      ? drawn >= Object.keys(BLOCK_MARKERS).length
      : Boolean(doneSelector ? state.marks.done : state.marks.shell),
    // Kept so a run that never reached its marker says what the page did contain, instead of the
    // script having to be re-run with probes bolted on to find out.
    urls: tally.urls,
    shape: nav,
  }
}

function judge(rows) {
  const failures = []
  for (const row of rows) {
    if (!row.complete)
      failures.push(`${row.label}: never reached its marker (shell ${row.shellMs}ms, blocks ${row.blocksDrawn}/5, aside ${row.shape.asides}, fences ${row.shape.fences}, body ${row.shape.bodyChars} chars)`)
    const ceiling = row.label === 'anonymous' ? CEILINGS.anonMs : row.label === 'authed' ? CEILINGS.shellMs : CEILINGS.blocksMs
    const actual = row.label === 'blocks' ? row.blocksMs : row.shellMs
    if (ceiling && actual > ceiling) failures.push(`${row.label}: ${actual}ms over the ${ceiling}ms ceiling`)
    if (CEILINGS.requests && row.requests > CEILINGS.requests) failures.push(`${row.label}: ${row.requests} requests over ${CEILINGS.requests}`)
    if (CEILINGS.worstTask && row.worstTaskMs > CEILINGS.worstTask) failures.push(`${row.label}: worst long task ${row.worstTaskMs}ms over ${CEILINGS.worstTask}ms`)
  }
  return failures
}

const port = await freePort()
// `localhost`, not `127.0.0.1`: the dev server binds the IPv6 loopback only, so a v4 literal
// connects to nothing and the run times out waiting for a server that is already up.
const base = `http://localhost:${port}`
const server = spawn('npx', USE_PREVIEW
  ? ['vite', 'preview', '--port', String(port), '--strictPort']
  : ['vite', '--mode', 'kv', '--port', String(port), '--strictPort'], {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, INKSTONE_EPHEMERAL_DEV: '1' },
  stdio: ['ignore', 'ignore', 'pipe'],
})
let serverLog = ''
server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 240_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const rows = []
let failure = ''
try {
  await waitForUrl(base)

  // First, while this browser still has no session cookie anywhere in its jar.
  rows.push(await runScenario(browser, base, {
    label: 'anonymous',
    url: '/',
    expectBlocks: false,
    timeoutMs: 60_000,
    // A signed-out reader has no shell to wait for; what they are waiting for is the login form.
    doneSelector: 'input[type="password"]',
  }))

  // Registering through the API puts the session cookie in the browser's shared jar, so every page
  // opened after this point is signed in without a UI round trip in front of the measurement.
  const setup = await browser.newPage()
  await setup.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  const registered = await setup.evaluate(async (origin, user, pass) => {
    const response = await fetch(`${origin}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Inkstone-Client': '1' },
      body: JSON.stringify({ username: user, password: pass }),
    })
    return { status: response.status, ok: response.ok }
  }, base, USERNAME, PASSWORD)
  await setup.close()
  if (!registered.ok && registered.status !== 409)
    throw new Error(`could not create the probe account: HTTP ${registered.status}\n--- server stderr (tail) ---\n${serverLog.slice(-2000)}`)

  rows.push(await runScenario(browser, base, { label: 'authed', url: '/', expectBlocks: false, timeoutMs: 60_000 }))

  const writer = await browser.newPage()
  await writer.goto(`${base}/`, { waitUntil: 'domcontentloaded' })
  const note = await writer.evaluate(async (content) => {
    const created = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Inkstone-Client': '1' },
      body: JSON.stringify({ title: 'Boot probe', content }),
    })
    const body = await created.json()
    return { status: created.status, id: body.note?.id ?? body.id ?? null }
  }, ALL_BLOCKS_NOTE)
  await writer.close()
  if (!note.id) throw new Error(`could not write the all-blocks note: HTTP ${note.status}`)

  rows.push(await runScenario(browser, base, {
    label: 'blocks',
    url: '/',
    expectBlocks: true,
    timeoutMs: 150_000,
    afterShell: note.id,
  }))
} catch (error) {
  failure = String(error?.stack ?? error)
} finally {
  await browser.close().catch(() => {})
  server.kill('SIGTERM')
}

console.log(`\nboot measurement (${USE_PREVIEW ? 'preview of the built output' : 'dev server'}, ${COLD_SW ? 'cold cache, service worker unhooked' : 'service worker left in place'}, ${base})`)
console.log('scenario    requests     FCP     DCL  bootDone   shell   blocks  open→5  bySW  tasks  total/max')
if (URL_TALLY) {
  for (const row of rows) {
    if (!row.urls) continue
    const groups = new Map()
    for (const url of row.urls) {
      const clean = url.slice(1).split('?')[0]
      const key = clean.startsWith('.vite/deps/')
        // Pre-bundled dependency: name the package it came from, because "how many requests is one
        // package" is the only way to see what the dev request count is made of.
        ? `deps/${clean.slice('.vite/deps/'.length).replace(/-[A-Za-z0-9_-]{6,}\.(js|map)$/, '')}`
        : clean.startsWith('src/')
        ? `src/${clean.split('/').slice(0, 3).join('/')}`
        : clean.replace(/\/[A-Za-z0-9_.-]*$/, '/')
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    // Attribute the dependency sub-chunks by name against the icon list the package actually ships,
    // so "how much of the dev request count is lucide" is a measured number, not an impression.
    const iconNames = new Set(URL_TALLY_ICONS)
    const isIcon = (url) => {
      const file = url.split('/').pop()?.split('?')[0] ?? ''
      return iconNames.has(file.replace(/-[A-Za-z0-9_-]{6,}\.(js|map)$/, ''))
    }
    const iconRequests = row.urls.filter(isIcon).length
    const depRequests = row.urls.filter((u) => u.includes('/deps/')).length
    console.log(`\n${row.label}: ${row.urls.length} requests = ${depRequests} prebundled deps (${iconRequests} lucide icons) + ${row.urls.filter((u) => u.startsWith('/src/')).length} app sources`)
    console.log(`  top groups of ${row.urls.length}`)
    for (const [key, count] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))
      console.log(`  ${String(count).padStart(5)}  ${key}`)
  }
}
for (const row of rows) {
  console.log(
    row.label.padEnd(11),
    String(row.requests).padStart(8),
    String(row.fcpMs).padStart(8),
    String(row.dclMs).padStart(7),
    String(row.bootDoneMs).padStart(10),
    String(row.shellMs).padStart(7),
    `${row.blocksDrawn}/5@${row.blocksMs}`.padStart(10),
    String(row.blocksFromClickMs || '').padStart(8),
    String(row.swServed).padStart(9),
    String(row.longTasks).padStart(6),
    `${row.longTaskTotalMs}/${row.worstTaskMs}`.padStart(10),
  )
}
const failures = judge(rows)
if (failure) console.log(`\nFAILED: ${failure}\n--- server stderr (tail) ---\n${serverLog.slice(-1500)}`)
else if (!failures.length) console.log(Object.values(CEILINGS).some(Boolean)
  ? '\nboot measurement passed every ceiling'
  : '\nreported only, and nothing was incomplete. Re-run with SHELL_MS_MAX / REQUESTS_MAX / ... to turn a measurement into a budget.')
else if (!Object.values(CEILINGS).some(Boolean)) {
  // An unreached marker is a failure whether or not a ceiling was set; swallowing it here is how a
  // broken observer would print a table of zeros and exit as if it had measured something.
  console.log('\nboot measurement failed (no ceiling was needed to notice this):')
  for (const line of failures) console.log(`  ${line}`)
}
else {
  console.log('\nboot measurement failed:')
  for (const line of failures) console.log(`  ${line}`)
}
process.exit(failure || failures.length ? 1 : 0)
