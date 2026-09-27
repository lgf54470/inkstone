/**
 * Manual stress harness for a large music library: it answers the library request with a synthetic
 * catalogue, opens the hub and types into the search box, recording what the query chain costs the
 * reader — the wait to see a list at all, the wait from one keystroke to the ranking that answers
 * it, and the longest the main thread was ever blocked while that happened (FB-PF4).
 *
 * The catalogue is answered at the transport rather than written into the database. A reader with a
 * real collection brings a few thousand rows, and no upload path can put one on a dev instance:
 * uploads are capped at 200 per hour, and a fixture of silence big enough would cost both the hour
 * and the gigabyte it is not worth. What is measured is the client's own chain over those rows —
 * the pinyin pass, the index, the ranking, the windowing, the commit — which is what the endpoint's
 * payload shape decides, so `syntheticLibrary` writes that shape out directly (`MusicTrack` in
 * `src/shared/types/music.ts`) with no covers and no lyric text, the state a freshly loaded library
 * is in. The row count the hub actually drew is part of the report, so a fixture the store refused
 * shows up as a number rather than as a fast one.
 *
 * Deliberately not part of the CI gate, for the same reason as `measure-preflight.mjs` and
 * `measure-kanban.mjs`: frame timing on a shared runner is noise. This reports numbers and a verdict
 * for a human to read, and the thresholds below are the contract the query path aims for — so a
 * breach still fails the run.
 *
 * A keystroke is measured from the search box's own `input` event, not from the protocol round trip
 * that sent it, so the number is the app's cost rather than the harness's. It includes the box's
 * deliberate debounce (`SEARCH_DEBOUNCE_MS` in `music-search-box.tsx`, 200ms) before the store query
 * moves: what is left of the number after that constant is the ranking, the commit and the paint,
 * which is why the threshold below is stated against the whole wait a reader has rather than
 * against a derived remainder.
 *
 * Usage: node scripts/measure-music.mjs [baseUrl] [tracks]
 *   TRACKS=2000         rows the synthetic library holds
 *   OPEN_MS_MAX=3000    from opening the hub to the first row drawn
 *   TYPE_MS_MAX=800     one keystroke (debounce included) to its ranking drawn
 *   GRID_MS_MAX=3000    one keystroke in grid view, where the ranking caps at 200 mounted cards
 *   WORST_TASK_MAX=500  how long one main-thread commit may last while typing
 *   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
 */
import puppeteer from 'puppeteer-core'
import { chromeExecutablePath, dismissUpdatePrompt, loginThroughUi, sleep } from './e2e-harness.mjs'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const TRACKS = Math.min(Math.max(Number(process.argv[3] ?? process.env.TRACKS ?? 2000), 1), 100_000)
const OPEN_MS_MAX = Number(process.env.OPEN_MS_MAX ?? 3000)
const TYPE_MS_MAX = Number(process.env.TYPE_MS_MAX ?? 800)
const GRID_MS_MAX = Number(process.env.GRID_MS_MAX ?? 3000)
const WORST_TASK_MAX = Number(process.env.WORST_TASK_MAX ?? 500)
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
// Long enough that the debounce (200ms), the ranking and the romanization churn of one latin
// keystroke have all landed; the report says when the last of them arrived.
const SETTLE_MS = 700

const OPEN_LABELS = ['打开音乐库', 'Open music library', '展开播放器', 'Expand the player']
const GRID_LABELS = ['网格视图', 'Grid view']
const SEARCH_BOX = 'input[role="combobox"]'
// The probe has to watch a node React keeps: it observes the surface that *holds* the list rather
// than the list's own root, which the app does replace as the answer changes — a detached target
// reports a fast keystroke by never reporting one at all (the first sweep read `null` for most).
const CONTENT_ROOT = '[data-music-content]'
const TABLE_ROOT = '[role="table"]'
const ROW_SELECTOR = '[role="table"] [role="row"][aria-selected]'
const ROW_COUNT_SELECTOR = '[role="table"][aria-rowcount]'
const GRID_ROOT = 'div.grid.grid-cols-2'
const CARD_SELECTOR = `${GRID_ROOT} > [role="group"]`

// A mix of latin and CJK names, so the pinyin pass has real work to do: the first latin keystroke
// is what triggers it, and a fixture of pure ASCII would measure a path nobody's library has.
const WORDS = ['Aurora', '夜航', 'Bramble', '潮汐', 'Cinder', 'Dune', 'Echo', '萤火', 'Fathom', 'Gale']
const ALBUMS = ['First Light', '深夜电台', 'Paper Rooms', '潮间带']

/** The library endpoint's own payload, written out: `count` rows, no covers, no lyric text. */
function syntheticLibrary(count) {
  const now = Date.now()
  const tracks = Array.from({ length: count }, (_, index) => {
    const pad = String(index).padStart(5, '0')
    return {
      id: `measure-${pad}`,
      title: `${WORDS[index % WORDS.length]} ${pad}`,
      artist: WORDS[(index * 3 + 1) % WORDS.length],
      album: ALBUMS[index % ALBUMS.length],
      durationMs: 180_000 + (index % 60) * 1_000,
      source: 'r2',
      format: 'mp3',
      webdavPath: null,
      mime: 'audio/mpeg',
      sizeBytes: 3_000_000 + index,
      coverUrl: null,
      lyric: null,
      hasLyric: false,
      tagIds: [],
      isFavorite: false,
      isPinned: false,
      playCount: 0,
      lastPlayedAt: null,
      contentHash: null,
      createdAt: now - index,
      updatedAt: now - index,
    }
  })
  const stats = {
    trackCount: count,
    favoriteCount: 0,
    pinnedCount: 0,
    playlistCount: 0,
    tagCount: 0,
    totalBytes: tracks.reduce((sum, track) => sum + track.sizeBytes, 0),
    totalDurationMs: tracks.reduce((sum, track) => sum + track.durationMs, 0),
  }
  return { tracks, tags: [], playlists: [], stats }
}

/**
 * Answers the library read with the fixture and lets every other request through. Installed before
 * the first navigation on purpose: the store trusts a library it loaded less than a minute ago, so
 * intercepting after the app has booted can leave the real (empty) library in place and the whole
 * sweep measuring nothing.
 */
async function serveLibrary(page, payload) {
  await page.setRequestInterception(true)
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (!path.endsWith('/api/music/library')) {
      void request.continue().catch(() => {})
      return
    }
    void request
      .respond({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
      .catch(() => {})
  })
}

async function countMatching(page, selector) {
  return page.evaluate((sel) => document.querySelectorAll(sel).length, selector)
}

/**
 * A real pointer press on a drawn control, found by accessible name or by its own text. Both are
 * needed: the toolbar's icon buttons carry `aria-label`s, while a segmented control's option is a
 * button whose name is its label and which names nothing else.
 *
 * The wait is on the control being the thing a pointer would actually hit: this app puts transient
 * notices over the surfaces that open it, and a press that lands on one reads as a control that does
 * nothing. The blocker is part of the failure message for that reason.
 */
async function clickNamed(page, labels, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let blocker = 'no control with that name is drawn'
  while (Date.now() < deadline) {
    const target = await page.evaluate((names) => {
      const drawn = [...document.querySelectorAll('button')].filter((item) => item.getClientRects().length > 0)
      const control = drawn.find((item) => names.includes(item.getAttribute('aria-label') ?? ''))
        ?? drawn.find((item) => names.includes(item.textContent.trim()))
      if (!control) return { missing: true }
      control.scrollIntoView({ block: 'center' })
      const box = control.getBoundingClientRect()
      const point = { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
      const hit = document.elementFromPoint(point.x, point.y)
      const reachable = !hit || hit === control || control.contains(hit) || hit.contains(control)
      return { point, reachable, blocker: hit ? (hit.getAttribute('aria-label') ?? hit.className.toString().slice(0, 40)) : 'nothing' }
    }, labels)
    if (target.missing) blocker = 'no control with that name is drawn'
    else if (target.reachable) {
      await page.mouse.click(target.point.x, target.point.y)
      return
    } else blocker = `the press would land on ${target.blocker}`
    await sleep(250)
  }
  throw new Error(`no control named ${labels.join(' / ')} became hittable in ${timeout}ms: ${blocker}`)
}

async function openHub(page, expected) {
  const started = Date.now()
  await clickNamed(page, OPEN_LABELS)
  const drawn = await page
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, { timeout: 30_000 }, ROW_SELECTOR)
    .then(() => true, () => false)
  const firstRowMs = Date.now() - started
  // The hub draws whatever the store already had — on a dev instance that is the offline cache's
  // leftover — and the intercepted response lands a beat later. Reading the table at the first row
  // therefore reports the cost of that leftover library (two rows here) as if it were the fixture's,
  // so this waits for the row count the sweep was asked to measure. `firstRowMs` keeps the raw
  // number, and a fixture that never arrives still shows up as the mismatch the check below names.
  await page
    .waitForFunction(
      ({ table, want }) => Number(document.querySelector(table)?.getAttribute('aria-rowcount') ?? 0) >= want,
      { timeout: 30_000 },
      { table: ROW_COUNT_SELECTOR, want: expected },
    )
    .catch(() => {})
  return { ms: Date.now() - started, firstRowMs, drawn, ...(await readTable(page)) }
}

/**
 * What the table says about its own list: the rows it drew (a window over a long list, which is the
 * point of the window) and the row count it was given. The second is what says the fixture arrived
 * — `aria-rowcount` is the ranking's own total, so a store that never took the synthetic library
 * shows up here as a number rather than as a fast one.
 */
async function readTable(page) {
  return page.evaluate(({ rows, table }) => ({
    rows: document.querySelectorAll(rows).length,
    total: Number(document.querySelector(table)?.getAttribute('aria-rowcount') ?? 0),
  }), { rows: ROW_SELECTOR, table: ROW_COUNT_SELECTOR })
}

/**
 * Watches one list's own container and the box's input events from inside the page, so a keystroke's
 * cost is read without a protocol round trip in the middle of it. Every mutation after an input is
 * stamped: the first is the ranking the reader was waiting for, the last is when the churn that
 * follows it — the pinyin pass hands its batches to the store, and each batch re-renders — stopped.
 */
async function installProbe(page, container) {
  await page.evaluate(({ box, root }) => {
    const input = document.querySelector(box)
    const list = document.querySelector(root)
    if (!input || !list) throw new Error('the probe found no search box or list to watch')
    const probe = { inputAt: 0, mutations: [] }
    window.__musicProbe = probe
    input.addEventListener('input', () => {
      probe.inputAt = performance.now()
    })
    probe.observer = new MutationObserver(() => {
      if (probe.inputAt) probe.mutations.push(performance.now())
    })
    probe.observer.observe(list, { childList: true, subtree: true, characterData: true })
  }, { box: SEARCH_BOX, root: container })
}

/** The stamps of one keystroke, plus the evidence that the list answered it with something. */
async function readProbe(page, selector) {
  return page.evaluate(({ sel, rowCount }) => {
    const probe = window.__musicProbe
    const times = probe.mutations
    const inputAt = probe.inputAt
    probe.inputAt = 0
    probe.mutations = []
    const rows = document.querySelectorAll(sel).length
    const first = document.querySelector(sel)?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 32) ?? ''
    return {
      firstMs: times.length ? Math.round(times[0] - inputAt) : null,
      settleMs: times.length ? Math.round(times[times.length - 1] - inputAt) : null,
      mutations: times.length,
      rows,
      total: Number(document.querySelector(rowCount)?.getAttribute('aria-rowcount') ?? 0),
      first,
    }
  }, { sel: selector, rowCount: ROW_COUNT_SELECTOR })
}

async function focusSearchBox(page) {
  await page.click(SEARCH_BOX)
}

async function clearSearchBox(page) {
  await focusSearchBox(page)
  await page.keyboard.down('Control')
  await page.keyboard.press('a')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await sleep(SETTLE_MS)
}

/** Types `text` one character at a time, settling after each so one keystroke's cost is its own. */
async function typeSequence(page, text, selector) {
  const steps = []
  for (let index = 0; index < text.length; index++) {
    await page.keyboard.type(text[index])
    await sleep(SETTLE_MS)
    steps.push({ typed: text.slice(0, index + 1), ...(await readProbe(page, selector)) })
  }
  return steps
}

/** Frames and long tasks, the way the other two harnesses sample theirs. */
async function startSampling(page) {
  await page.evaluate(() => {
    window.__frames = []
    window.__tasks = []
    window.__marks = []
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(Math.round(now - last))
      last = now
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // The start is kept, not just the duration: a slow commit is only actionable once the
          // report says which phase it landed in — see `markPhase` below.
          window.__tasks.push({ start: entry.startTime, duration: Math.round(entry.duration) })
        }
      }).observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask is unsupported here: the frame intervals still tell the story
    }
  })
}

/**
 * Stamps a phase boundary in the page's own clock, the one the long-task entries are timed on.
 * Node's clock (Date.now()) cannot be compared with them, so the marks have to be taken inside.
 */
async function markPhase(page, name) {
  await page.evaluate((label) => {
    window.__marks.push({ name: label, at: performance.now() })
  }, name)
}

/** Which phase a long task started in: the last mark stamped before it. */
function phaseOf(marks, start) {
  let phase = 'before the first phase'
  for (const mark of marks) {
    if (mark.at <= start) phase = mark.name
  }
  return phase
}

async function stopSampling(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const frames = window.__frames
    const tasks = window.__tasks
    const marks = window.__marks ?? []
    const ascending = [...frames].sort((a, b) => a - b)
    const worst = tasks.reduce((heaviest, task) => (task.duration > (heaviest?.duration ?? -1) ? task : heaviest), null)
    // The phase a task started in is the last mark stamped before it — the page's own clock.
    const phaseAt = (start) => {
      let phase = 'before the first phase'
      for (const mark of marks) if (mark.at <= start) phase = mark.name
      return phase
    }
    // Kept per phase rather than as one maximum: a deliberate mount (the reader pressed a toggle and
    // waits once) and a commit under the reader's fingers are different contracts. The kanban harness
    // already reports its view-switch totals without judging them; this is the same distinction, so
    // the typing phases are what the commit budget below is applied to.
    const byPhase = {}
    for (const task of tasks) {
      const phase = phaseAt(task.start)
      byPhase[phase] = Math.max(byPhase[phase] ?? 0, task.duration)
    }
    return {
      frames: frames.length,
      p50: ascending[Math.floor(ascending.length / 2)] ?? 0,
      p95: ascending[Math.floor(ascending.length * 0.95)] ?? 0,
      worstFrame: Math.max(0, ...frames),
      framesOver50: frames.filter((value) => value > 50).length,
      longTasks: tasks.length,
      blockingMs: tasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      worstTask: worst?.duration ?? 0,
      worstTaskPhase: worst ? phaseAt(worst.start) : 'nothing over the threshold',
      worstTaskByPhase: byPhase,
    }
  })
}

async function measureTyping(page, probeRoot, selector) {
  await installProbe(page, probeRoot)
  await clearSearchBox(page)
  await focusSearchBox(page)
  const latin = await typeSequence(page, 'auror', selector)
  const cjk = await typeSequence(page, '夜航', selector)
  return { latin, cjk }
}

/**
 * Switches the list to the grid and measures that switch plus one broad keystroke in it. The grid
 * mounts a card per match where the table windows its rows, so this is the heavier of the two — and
 * a broad query is the case that fills its 200-card budget.
 *
 * The box is cleared before the toggle is pressed: the switch lives in the list's own header, and a
 * query that matched nothing draws the empty state instead of that header, which would leave this
 * phase pressing a control that is not there for a reason it did not cause.
 */
async function measureGridSwitch(page) {
  await clearSearchBox(page)
  const started = Date.now()
  await clickNamed(page, GRID_LABELS)
  const drawn = await page
    .waitForFunction((sel) => document.querySelectorAll(sel).length > 0, { timeout: 30_000 }, CARD_SELECTOR)
    .then(() => true, () => false)
  const switching = { ms: Date.now() - started, drawn, cards: await countMatching(page, CARD_SELECTOR) }
  await installProbe(page, CONTENT_ROOT)
  await focusSearchBox(page)
  await page.keyboard.type('a')
  await sleep(SETTLE_MS)
  return { switching, typed: { typed: 'a', ...(await readProbe(page, CARD_SELECTOR)) } }
}

// The commits the reader pays attention to are the ones that arrive while they type; the mount of a
// view they just asked for is a one-off that this report prints (see `worstTaskByPhase`) instead.
function interactiveWorst(sampled) {
  return Object.entries(sampled.worstTaskByPhase ?? {})
    .filter(([phase]) => phase.startsWith('typing'))
    .reduce((worst, [, ms]) => Math.max(worst, ms), 0)
}

function findSlowest(steps) {
  return steps.reduce((worst, step) => (step.firstMs !== null && step.firstMs > (worst?.firstMs ?? -1) ? step : worst), null)
}

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 180_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
// Built up as it is measured rather than assembled at the end: when a phase throws, the numbers the
// earlier phases already paid for are still what the run has to show.
const report = { tracks: TRACKS }
let failure = ''
try {
  await page.setViewport({ width: 1440, height: 900 })
  await serveLibrary(page, syntheticLibrary(TRACKS))
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await loginThroughUi(page, { username: USERNAME, password: PASSWORD })
  await dismissUpdatePrompt(page)
  report.hub = await openHub(page, TRACKS)
  if (!report.hub.drawn || report.hub.rows < 1) failure = `the hub drew no rows over a ${TRACKS}-row library`
  await startSampling(page)
  await markPhase(page, 'opened')
  const started = Date.now()
  await markPhase(page, 'typing (list)')
  report.typed = await measureTyping(page, CONTENT_ROOT, ROW_SELECTOR)
  await markPhase(page, 'switching to the grid')
  report.grid = await measureGridSwitch(page)
  await markPhase(page, 'typing (grid)')
  const sampled = await stopSampling(page)
  const window = Date.now() - started
  report.window = window
  report.blockShare = window > 0 ? Math.round((sampled.blockingMs / window) * 1000) / 1000 : 0
  Object.assign(report, sampled)
  const { hub, typed, grid } = report
  const slowKeystroke = findSlowest([...typed.latin, ...typed.cjk])
  if (!failure && hub.total < TRACKS) failure = `the list was handed ${hub.total} rows of a ${TRACKS}-row library`
  else if (hub.ms > OPEN_MS_MAX) failure = `opening the hub took ${hub.ms}ms (limit ${OPEN_MS_MAX}ms)`
  else if (slowKeystroke && slowKeystroke.firstMs > TYPE_MS_MAX) {
    failure = `typing "${slowKeystroke.typed}" took ${slowKeystroke.firstMs}ms to be ranked (limit ${TYPE_MS_MAX}ms)`
  } else if (grid.typed.firstMs !== null && grid.typed.firstMs > GRID_MS_MAX) {
    failure = `a keystroke in grid view took ${grid.typed.firstMs}ms (limit ${GRID_MS_MAX}ms)`
  } else if (interactiveWorst(sampled) > WORST_TASK_MAX) {
    failure = `a commit under the reader's fingers took ${interactiveWorst(sampled)}ms (limit ${WORST_TASK_MAX}ms)`
  }
} catch (error) {
  failure = String(error?.message ?? error)
} finally {
  await browser.close()
}

console.log(JSON.stringify(report, null, 2))
if (failure) {
  console.error(`✗ ${failure}`)
  process.exit(1)
}
const keystrokes = [...report.typed.latin, ...report.typed.cjk]
console.log(
  `✓ ${report.tracks} rows: hub opened in ${report.hub.ms}ms (${report.hub.rows} rows drawn), ` +
    `slowest keystroke ${findSlowest(keystrokes)?.firstMs ?? 0}ms, grid switch ${report.grid.switching.ms}ms, ` +
    `grid keystroke ${report.grid.typed.firstMs ?? 0}ms over ${report.grid.typed.rows} cards, ` +
    `worst commit under the fingers ${interactiveWorst(report)}ms, worst mount ${report.worstTask}ms during ` +
    `${report.worstTaskPhase} (${report.longTasks} commits over 50ms)`,
)
