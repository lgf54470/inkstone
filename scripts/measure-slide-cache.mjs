// Manual measurement for the presentation's two slide caches (N-23).
//
// The idle pass prepares a page for every slide of the deck and stores it under a key that names the
// deck, the theme and the stage size. Both caches are capped, and a cap *below* the deck's page count
// means the pass evicts the slides it prepared first while it prepares the ones it has not reached —
// so the show re-renders from scratch on the way back, and the slide list can be holding a page whose
// prepared markup is already gone. Whether that is what the visual gate's blank-thumbnail assertions
// (`L-1`'s three) actually measure cannot be decided from the code, so this script puts numbers to it:
// how long the fill pass takes, and how long returning to the first page costs once it is done.
//
// It is deliberately not part of CI: the question is a magnitude and a comparison between two builds,
// and both are read off the printed lines by a person. Run it on the code as it stands, change the
// caps, run it again — the pair is the evidence, not either half.
//
// Usage: node scripts/measure-slide-cache.mjs [baseUrl] [slides]
//   PARAS=2            how much prose each slide carries besides its diagram
//   SETTLE_MS=1500     grace given to a re-render before it is counted as instant
//   HOME_RETURN_MAX_MS  the ceiling a cache hit should comfortably stay under (default 400)
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const SLIDES = Number(process.argv[3] ?? process.env.SLIDES ?? 70)
const PARAS = Number(process.env.PARAS ?? 2)
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 1_500)
const HOME_RETURN_MAX_MS = Number(process.env.HOME_RETURN_MAX_MS ?? 400)
const PASS_TIMEOUT_MS = Number(process.env.PASS_TIMEOUT_MS ?? 90_000)
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

// Every slide carries a mermaid diagram, because a diagram is the block whose prepared markup the
// cache exists to protect: re-enhancing one is visible as a flash back to its placeholder, and a
// cache miss costs exactly that work again.
function deckOf(slides, paras) {
  const slide = (index) => [
    `## Slide ${index + 1}`,
    '',
    '```mermaid',
    'flowchart LR',
    `  A[Slide ${index + 1}] --> B[Rendered]`,
    '```',
    '',
    ...Array.from({ length: paras }, (_, line) => `Paragraph ${line + 1} on slide ${index + 1}.\n`),
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

// The deck is typed into the real editor: a note created through the API never enters the client
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

const DIAGRAM_IN_STAGE = () => {
  const surface = document.querySelector('[data-slide-canvas] [data-slide-page]')
  return { svg: surface ? surface.querySelectorAll('svg').length : -1, katex: surface ? surface.querySelectorAll('.katex').length : -1 }
}

async function openShow(page) {
  await page.evaluate(() => {
    // The label is localized, so the escaped form of the zh-CN wording is matched too.
    const button = [...document.querySelectorAll('button')].find((el) => /presentation mode|\u6f14\u793a\u6a21\u5f0f/i.test(el.getAttribute('aria-label') ?? ''))
    if (!button) throw new Error('the control that opens the show is missing')
    button.click()
  })
  await page.waitForSelector('[data-slide-canvas]', { timeout: 20_000 })
}

// How long the background pass needs to list every page of the deck — the dialog carries the flag,
// so this is the show's own answer rather than a guessed wait.
async function timeThePass(page) {
  const started = Date.now()
  while (Date.now() - started < PASS_TIMEOUT_MS) {
    const complete = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('data-slide-list-complete') === 'true')
    if (complete) return { passMs: Date.now() - started, complete: true }
    await sleep(250)
  }
  return { passMs: Date.now() - started, complete: false }
}

// Return to the first page and time how long the projector takes to show its diagram again. A cache
// hit is a paint; an eviction is a re-render of a diagram, which is the work the cap decides away.
async function timeHomeReturn(page) {
  await page.keyboard.press('Home')
  const started = Date.now()
  let seen = { svg: 0, katex: 0 }
  while (Date.now() - started < 8_000) {
    seen = await page.evaluate(DIAGRAM_IN_STAGE)
    if (seen.svg > 0) break
    await sleep(50)
  }
  const diagramMs = Date.now() - started
  const painted = seen.svg > 0
  const listed = await page.evaluate(() => ({
    entries: document.querySelectorAll('[data-presentation-rail] [data-entry-index]').length,
    preparedThumbs: [...document.querySelectorAll('[data-presentation-rail] [data-entry-index]')]
      .filter((item) => item.querySelector('.mermaid svg, svg')).length,
  }))
  return { diagramMs, painted, ...listed }
}

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 300_000,
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
  await openShow(page)
  const pass = await timeThePass(page)
  await sleep(SETTLE_MS)
  const home = await timeHomeReturn(page)
  report = { deck: SLIDES, paras: PARAS, ...pass, ...home, homeReturnMaxMs: HOME_RETURN_MAX_MS }
  if (!pass.complete) failure = `the pass did not finish listing ${SLIDES} slides within ${PASS_TIMEOUT_MS}ms (${pass.passMs}ms elapsed)`
  else if (!home.painted) failure = `the first page never showed its diagram again (readback ${JSON.stringify(home)})`
  else if (home.diagramMs > HOME_RETURN_MAX_MS) failure = `returning to the first page took ${home.diagramMs}ms (limit ${HOME_RETURN_MAX_MS}ms) — the page was re-rendered, not read from cache`
  else if (home.entries < report.deck) failure = `the list holds ${home.entries} entries for a ${report.deck}-slide deck`
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
console.log(`✓ a ${report.deck}-slide deck stayed inside both caches: pass ${report.passMs}ms, returning to the first page ${report.diagramMs}ms, ${report.preparedThumbs}/${report.entries} listed thumbnails holding their diagram`)
