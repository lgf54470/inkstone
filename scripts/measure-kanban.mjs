// Manual stress harness for a heavy kanban fence: it writes a board of cards into a note, opens it
// fullscreen and walks the eight views, recording what the board costs the main thread and how long
// each view asked before its own content was drawn.
//
// It is deliberately not part of the CI gate, for the same reason as `measure-preflight.mjs`: frame
// timing on a shared runner is noise, so this reports numbers and a verdict for a human to read. The
// thresholds below are the contract the board aims for, which is why they still fail the run: how long
// the board may take to draw in the note, how long one view may take to switch, and how long a single
// commit of the main thread may last.
//
// The sweep's totals — its frame distribution and how much of the wall clock it spent blocking — are
// reported rather than judged. Eight mounts of the eight views are eight deliberate acts, so a share
// of wall clock over the sweep measures how fast the script clicked, not the board: the same number
// (about 70%) comes back from 500 cards and from 1000, which is exactly why nothing is decided by it.
// What a reader feels is the wait to first paint, the wait after asking for a view, and the longest
// a single commit ever froze the page, and those are the three the verdict reads.
//
// The default size is the ceiling `KANBAN_MAX_ITEMS` lets a fence carry (`kanban/body.ts`) — the
// biggest board that parses, and the one worth measuring. A larger fence draws the block's error
// state instead of a board, which is the guardrail itself rather than something to sample.
//
// Usage: node scripts/measure-kanban.mjs [baseUrl] [cards]
//   CARDS=1000          cards in the fence, capped at the parse ceiling
//   NOTE_MS_MAX=3000    how long the board may take to draw its first card in the note
//   VIEW_MS_MAX=1500    how long one view switch may take before its content is drawn
//   WORST_TASK_MAX=2000 how long one main-thread commit may last
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const CEILING = 1000
const CARDS = Math.min(Number(process.argv[3] ?? process.env.CARDS ?? CEILING), CEILING)
const NOTE_MS_MAX = Number(process.env.NOTE_MS_MAX ?? 3000)
const VIEW_MS_MAX = Number(process.env.VIEW_MS_MAX ?? 1500)
const WORST_TASK_MAX = Number(process.env.WORST_TASK_MAX ?? 2000)
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function chromeExecutablePath() {
  const candidates = [
    process.env.INKSTONE_CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate
    } catch {
      // Best-effort: an unreadable candidate just falls through to the next one.
    }
  }
  throw new Error('no Chrome found; set INKSTONE_CHROME_PATH')
}

const dayOffset = (offset) => {
  const day = new Date()
  day.setDate(day.getDate() + offset)
  return day.toISOString().slice(0, 10)
}

// Every default column is filled on every card, so each view has something of its own to draw: the
// board reads status, the calendar and timeline and Gantt read the dates, the chart reads tags, the
// gallery reads the description. Three statuses keep the board at three columns, which is what a
// fence with no `columns` of its own gets — the shape a reader's own board has.
const STATUSES = ['todo', 'in_progress', 'done']
const TAGS = ['feat', 'improve', 'bug']

function boardFence(cards) {
  const items = Array.from({ length: cards }, (_, index) => ({
    id: `load-${index}`,
    title: `Load card ${index}`,
    description: `Card ${index} of the load fixture.`,
    properties: {
      status: STATUSES[index % STATUSES.length],
      priority: ['low', 'medium', 'high'][index % 3],
      tags: [TAGS[index % TAGS.length]],
      assignee: 'Owner-1',
      startDate: dayOffset(-(index % 30)),
      endDate: dayOffset((index % 30) - 10),
      progress: index % 101,
    },
  }))
  return ['', '```kanban', JSON.stringify({ title: 'Load Board', items }), '```', ''].join('\n')
}

async function signIn(page) {
  const signedIn = await page.evaluate(async (username, password) => {
    const fields = [...document.querySelectorAll('input')]
    const secret = fields.find((field) => field.type === 'password')
    if (!secret) return true
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(fields[0], username)
    fields[0].dispatchEvent(new Event('input', { bubbles: true }))
    setter.call(secret, password)
    secret.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    document.querySelector('button[type="submit"]')?.click()
    await new Promise((resolve) => setTimeout(resolve, 2_500))
    return !document.querySelector('input[type="password"]')
  }, USERNAME, PASSWORD)
  if (!signedIn) throw new Error(`sign-in failed for ${USERNAME}; pass INKSTONE_VISUAL_USERNAME/PASSWORD for this instance`)
}

// The fence goes through the real editor: the board reads its content from the client store, which a
// note written through the API never touches. The paste and the first card's own arrival are timed
// together, since what a reader feels on a board this size is the wait until it is drawn.
async function writeBoard(page, markdown) {
  await page.keyboard.down('Control')
  await page.keyboard.press('n')
  await page.keyboard.up('Control')
  await sleep(1_800)
  const started = Date.now()
  await page.evaluate((text) => {
    const editor = document.querySelector('.cm-content')
    const data = new DataTransfer()
    data.setData('text/plain', text)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, markdown)
  const drew = await page
    .waitForFunction(() => Boolean(document.querySelector('.ink-prose [data-kanban] [data-item-id]')), { timeout: 60_000 })
    .then(() => true, () => false)
  const ms = Date.now() - started
  const drawn = await page.evaluate(() => ({
    note: document.querySelectorAll('.ink-prose [data-kanban] [data-item-id]').length,
    error: document.querySelector('.ink-prose [data-kanban] .kanban-error')?.textContent?.trim().slice(0, 80) ?? '',
  }))
  return { ms, drew, ...drawn }
}

async function openFullscreen(page) {
  const started = Date.now()
  const pressed = await page.evaluate(() => {
    const button = document.querySelector('.ink-prose [data-kanban] [data-kanban-fullscreen]')
    if (!button) return false
    button.click()
    return true
  })
  if (!pressed) throw new Error('the block drew no full screen control')
  const opened = await page
    .waitForFunction(() => Boolean(document.querySelector('.kanban-fullscreen [data-kanban-header]')), { timeout: 60_000 })
    .then(() => true, () => false)
  await sleep(600)
  const drawn = await page.evaluate(() => document.querySelectorAll('.kanban-fullscreen [data-item-id]').length)
  return { ms: Date.now() - started, opened, drawn }
}

/**
 * The eight views a fence with no `views` of its own offers, each with the panel its own tab draws.
 * The tab is found by name in both languages, as the visual gate finds it: the board draws a view
 * under its own name when it has one and under the type's translated label when it does not.
 */
const KANBAN_VIEWS = [
  { type: 'board', labels: ['看板', 'Board'] },
  { type: 'table', labels: ['表格', 'Table'] },
  { type: 'chart', labels: ['图表', 'Chart'] },
  { type: 'calendar', labels: ['日历', 'Calendar'] },
  { type: 'timeline', labels: ['时间轴', 'Timeline'] },
  { type: 'gantt', labels: ['甘特图', 'Gantt'] },
  { type: 'list', labels: ['列表', 'List'] },
  { type: 'gallery', labels: ['画廊', 'Gallery'] },
]

/** Frames and long tasks over the whole sweep, the way preflight samples its pass. */
async function startSampling(page) {
  await page.evaluate(() => {
    window.__frames = []
    window.__tasks = []
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(Math.round(now - last))
      last = now
      window.__raf = requestAnimationFrame(tick)
    }
    window.__raf = requestAnimationFrame(tick)
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__tasks.push(Math.round(entry.duration))
      }).observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask is unsupported here: the frame intervals still tell the story
    }
  })
}

async function sweepViews(page) {
  const views = []
  for (const view of KANBAN_VIEWS) {
    const pressed = await page.evaluate((labels) => {
      const root = document.querySelector('.kanban-fullscreen')
      const tab = [...(root?.querySelectorAll('[role="tab"]') ?? [])].find((item) =>
        labels.includes(item.textContent.trim()),
      )
      if (!tab) return ''
      tab.click()
      return tab.textContent.trim()
    }, view.labels)
    const started = Date.now()
    const arrived = await page
      .waitForFunction(
        (type) => Boolean(document.querySelector(`.kanban-fullscreen [data-kanban-view-type="${type}"]`)),
        { timeout: 30_000 },
        view.type,
      )
      .then(() => true, () => false)
    const ms = Date.now() - started
    // The panel is measured with the cards it drew, so a view that failed to draw is visible as a fast
    // number rather than a good one: an empty surface is what a broken view costs.
    const drawn = await page.evaluate((type) => {
      const panel = document.querySelector(`.kanban-fullscreen [data-kanban-view-type="${type}"]`)
      return { nodes: panel?.querySelectorAll('*').length ?? 0, cards: panel?.querySelectorAll('[data-item-id]').length ?? 0 }
    }, view.type)
    views.push({ type: view.type, pressed, ms, arrived, ...drawn })
  }
  return views
}

async function stopSampling(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const frames = window.__frames
    const tasks = window.__tasks
    const ascending = [...frames].sort((a, b) => a - b)
    return {
      frames: frames.length,
      p50: ascending[Math.floor(ascending.length / 2)] ?? 0,
      p95: ascending[Math.floor(ascending.length * 0.95)] ?? 0,
      worstFrame: Math.max(0, ...frames),
      framesOver50: frames.filter((value) => value > 50).length,
      longTasks: tasks.length,
      blockingMs: tasks.reduce((sum, value) => sum + Math.max(0, value - 50), 0),
      worstTask: Math.max(0, ...tasks),
    }
  })
}

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 180_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
let report = null
let failure = ''
try {
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await signIn(page)
  await sleep(2_500)
  const note = await writeBoard(page, boardFence(CARDS))
  if (!note.drew) failure = `the board never drew in the note${note.error ? `: ${note.error}` : ''}`
  const overlay = failure ? null : await openFullscreen(page)
  if (!failure && !overlay.opened) failure = 'the overlay never drew its header'
  await startSampling(page)
  const sweptAt = Date.now()
  const views = failure ? [] : await sweepViews(page)
  const window = Date.now() - sweptAt
  const sampled = await stopSampling(page)
  const share = window > 0 ? sampled.blockingMs / window : 0
  report = { cards: CARDS, note, overlay, window, views, ...sampled, blockShare: Math.round(share * 1000) / 1000 }
  if (!failure) {
    const undrawn = views.filter((view) => !view.arrived || !view.pressed || !view.nodes)
    const slow = views.filter((view) => view.ms > VIEW_MS_MAX)
    if (note.ms > NOTE_MS_MAX) failure = `the board took ${note.ms}ms to draw its first card (limit ${NOTE_MS_MAX}ms)`
    else if (undrawn.length) failure = `${undrawn.map((view) => view.type).join(', ')}: the view never drew its own panel`
    else if (slow.length) failure = `${slow.map((view) => `${view.type} took ${view.ms}ms`).join(', ')} (limit ${VIEW_MS_MAX}ms)`
    else if (sampled.worstTask > WORST_TASK_MAX) failure = `a commit took ${sampled.worstTask}ms (limit ${WORST_TASK_MAX}ms)`
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
console.log(
  `✓ ${report.cards} cards: first card in ${report.note.ms}ms, overlay opened in ${report.overlay.ms}ms, ` +
    `worst view ${Math.max(...report.views.map((view) => view.ms))}ms, worst commit ${report.worstTask}ms ` +
    `(${report.longTasks} commits over 50ms, ${Math.round(report.blockShare * 100)}% of the sweep's wall clock)`,)
