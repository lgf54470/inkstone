// Manual stress harness for the presentation preflight pass: it opens a show on a long,
// heavy deck (every slide a diagram plus enough prose to paginate) and records what the
// background measuring costs the main thread while it fills the slide list.
//
// It is deliberately not part of the CI gate. Frame timing on shared runners is not a
// stable signal — the same build can pass and fail on noise — so this reports numbers and
// a verdict for a human to read. The thresholds below are the contract the pass aims for,
// which is why they still fail the run: `blocks/share` is the main-thread time the pass is
// allowed to occupy, and `worstFrame` the longest single commit it may cause.
//
// Usage: node scripts/measure-preflight.mjs [baseUrl] [slides]
//   WINDOW_MS=12000 PARAS=22  how long to sample, and how much prose each slide carries
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const SLIDES = Number(process.argv[3] ?? process.env.SLIDES ?? 40)
const WINDOW_MS = Number(process.env.WINDOW_MS ?? 12_000)
const PARAS = Number(process.env.PARAS ?? 22)
const BLOCK_SHARE_MAX = 0.25
const WORST_FRAME_MAX = 250
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

// Every slide carries a diagram and enough prose to paginate, so a slice's cost is the heavy
// end of what a real deck asks for rather than a best case.
function deckOf(slides, paras) {
  const slide = (index) => [
    `## Slide ${index + 1}`,
    '',
    '```mermaid',
    'flowchart LR',
    `  A[Slide ${index + 1}] --> B[Rendered]`,
    '```',
    '',
    ...Array.from({ length: paras }, (_, line) => `Paragraph ${line + 1} on slide ${index + 1}.`).flatMap((line) => [line, '']),
  ].join('\n')
  return `${Array.from({ length: slides }, (_, index) => slide(index)).join('\n---\n\n')}\n`
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

// The deck is typed into the real editor: a note created through the API bypasses the client
// store, and the show reads its content from that store.
async function writeDeck(page, markdown) {
  await page.keyboard.down('Control')
  await page.keyboard.press('n')
  await page.keyboard.up('Control')
  await sleep(1_800)
  await page.evaluate((text) => {
    const editor = document.querySelector('.cm-content')
    const data = new DataTransfer()
    data.setData('text/plain', text)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, markdown)
  await sleep(3_000)
}

// A fixed window keeps runs comparable: the frame cost is always measured over the same span,
// and how far the pass got inside it is reported next to it.
async function openShowAndSample(page) {
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
  const started = Date.now()
  await page.evaluate(() => {
    // The label is localized, so the escaped form of the zh-CN wording is matched too.
    const button = [...document.querySelectorAll('button')].find((el) => /presentation|\u6f14\u793a\u6a21\u5f0f/i.test(el.getAttribute('aria-label') ?? ''))
    if (!button) throw new Error('start-presentation button not found')
    button.click()
  })
  await page.waitForSelector('[data-slide-preflight], [data-presentation-rail]', { timeout: 15_000 })
  while (Date.now() - started < WINDOW_MS) await sleep(250)
  return page.evaluate(() => {
    cancelAnimationFrame(window.__raf)
    const frames = window.__frames
    const tasks = window.__tasks
    const ascending = [...frames].sort((a, b) => a - b)
    const counter = document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent ?? ''
    return {
      frames: frames.length,
      p50: ascending[Math.floor(ascending.length / 2)] ?? 0,
      p95: ascending[Math.floor(ascending.length * 0.95)] ?? 0,
      worstFrame: Math.max(0, ...frames),
      framesOver50: frames.filter((value) => value > 50).length,
      longTasks: tasks.length,
      blockingMs: tasks.reduce((sum, value) => sum + Math.max(0, value - 50), 0),
      worstTask: Math.max(0, ...tasks),
      entries: document.querySelectorAll('[data-presentation-rail] [data-entry-index]').length,
      slides: Number.parseInt(counter.split('/')[1] ?? '0', 10),
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
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await signIn(page)
  await sleep(2_500)
  await writeDeck(page, deckOf(SLIDES, PARAS))
  const sampled = await openShowAndSample(page)
  const share = sampled.blockingMs / WINDOW_MS
  report = { deck: SLIDES, window: WINDOW_MS, paras: PARAS, ...sampled, blockShare: Math.round(share * 1000) / 1000 }
  if (sampled.entries <= sampled.slides) failure = `the rail listed ${sampled.entries} entries for ${sampled.slides} slides: the pass did not list pages`
  else if (share > BLOCK_SHARE_MAX) failure = `the pass used ${Math.round(share * 100)}% of the main thread (limit ${BLOCK_SHARE_MAX * 100}%)`
  else if (sampled.worstFrame > WORST_FRAME_MAX) failure = `a frame took ${sampled.worstFrame}ms (limit ${WORST_FRAME_MAX}ms)`
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
console.log(`✓ preflight stayed within budget (${Math.round(report.blockShare * 100)}% of the thread, worst frame ${report.worstFrame}ms)`)
