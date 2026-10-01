// Manual measurement for the slide fit rule (N-02): what a single block taller than one page costs
// the projector.
//
// Three single-block slides — a table, a code fence, a list — each far taller than one page, walked
// through the show at a projector-sized viewport. For every page the script reads what the measuring
// canvas decided about its own markup: the block's height, the scale it wrote on it, the body size
// that actually arrives on the screen, and the height of the smallest unit a page could break on
// (a table row, a code line, a list item).
//
// It reports rather than judges. The number these readings feed — `MIN_FIT_SCALE` in
// `slide-pagination.ts` — is decided by a person reading this output, which is why nothing here
// asserts a threshold (the same convention as the sweep totals in `measure-kanban.mjs`).
//
// Usage: node scripts/measure-slide-fit.mjs [baseUrl] [width] [height]
//   INKSTONE_VISUAL_USERNAME/PASSWORD  an account on that instance (defaults suit CI's :7712)
import puppeteer from 'puppeteer-core'
import { chromeExecutablePath, clickButton, dismissUpdatePrompt, loginThroughUi, sleep } from './e2e-harness.mjs'

const BASE = process.argv[2] ?? 'http://localhost:7712'
const WIDTH = Number(process.argv[3] ?? 1920)
const HEIGHT = Number(process.argv[4] ?? 1080)
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
const DESIGN_WIDTH = 1280
const START_LABELS = ['演示模式', 'Presentation mode']
const NEXT_LABELS = ['下一页', 'Next slide']

// One block per slide, and every block far past one page: 200 rows of table, 260 lines of code,
// 220 items. The heights are what a reader's own long fence reaches, not a synthetic number.
function fixture() {
  const rows = Array.from({ length: 200 }, (_, index) => `| ${index + 1} | row ${index} | note ${index} |`).join('\n')
  const table = `| # | name | note |\n| --- | --- | --- |\n${rows}`
  const code = ['```js', ...Array.from({ length: 260 }, (_, index) => `const value${index} = ${index} * 2 // line ${index}`), '```'].join('\n')
  const list = Array.from({ length: 220 }, (_, index) => `- list item ${index} with a few words of prose`).join('\n')
  return [table, code, list].join('\n\n---\n\n')
}

async function writeNote(page, markdown) {
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
  await page.waitForSelector('.ink-prose table', { timeout: 30_000 })
  await sleep(1_200)
}

/** The show's own DOM, per page: what the canvas measured, what it wrote, what reaches the eye. */
async function readPage(page) {
  return page.evaluate((designWidth) => {
    const canvas = document.querySelector('[data-slide-canvas]')
    const host = canvas?.querySelector('[data-slide-page]')
    const current = document.querySelector('[data-presentation-rail] [aria-current="true"]')
    if (!canvas || !host || !current) return null
    const slide = Number(current.dataset.slideIndex)
    const own = [...document.querySelectorAll(`[data-presentation-rail] [data-slide-index="${slide}"]`)].length
    const base = Number.parseFloat(getComputedStyle(host).fontSize)
    const stage = canvas.getBoundingClientRect().width / designWidth
    // A row read inside a block the canvas has scaled comes back in device pixels; the block's own
    // rect-over-offsetHeight ratio turns it back into the design pixels the page walk packs with.
    const blocks = [...host.children]
      .filter((element) => element.style.visibility !== 'hidden')
      .map((element) => {
        const transform = element.style.transform
        const applied = Number.parseFloat(/scale\(([\d.]+)\)/.exec(transform)?.[1] ?? '1')
        const rows = [...element.querySelectorAll('tr')]
        const lines = [...element.querySelectorAll('pre code > .line')]
        const items = [...element.querySelectorAll(':scope > li')]
        const units = rows.length > 1 ? rows : lines.length > 1 ? lines : items
        // A rect is in device pixels and a block the canvas has shrunk is scaled twice over (by its
        // own fit factor and by the stage), so this is what turns a rect delta back into the design
        // pixels the page walk packs with.
        const toDesign = element.offsetHeight / element.getBoundingClientRect().height
        const rect = (node) => node.getBoundingClientRect()
        const unitHeight = units.length > 1 ? (rect(units[1]).top - rect(units[0]).top) * toDesign : 0
        return {
          tag: `${element.tagName.toLowerCase()}.${(element.className ?? '').split(' ')[0]}`,
          top: element.offsetTop,
          height: element.offsetHeight,
          scrollHeight: element.scrollHeight,
          transform: transform || 'none',
          applied,
          clip: element.style.clipPath || '',
          // The size of the body copy inside this block, in the canvas's own design pixels.
          font: Number.parseFloat(getComputedStyle(element.querySelector('td, li, .line, p') ?? element).fontSize),
          unitCount: units.length,
          unitHeight,
        }
      })
    return {
      slide,
      sub: Number(current.dataset.slidePage),
      pages: own,
      base,
      stage,
      blocks,
      // Diagnosis for a walk that does not advance: what the note itself divided into, and how many
      // pages the rail lists.
      deck: {
        rules: document.querySelectorAll('.ink-prose hr').length,
        entries: document.querySelectorAll('[data-presentation-rail] [data-slide-index]').length,
        stepper: document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? '',
        nextDisabled: [...document.querySelectorAll('button')].filter((element) => (element.getAttribute('aria-label') ?? '').includes('下一页')).map((element) => element.disabled),
      },
    }
  }, DESIGN_WIDTH)
}

/**
 * Press the show's own next control, by its accessible name exactly.
 *
 * The harness's `clickButton` matches on text content as well, and the last control it finds that
 * way is not the stepper's — a press that lands elsewhere moves nothing, which a walk would read as
 * "the deck ended here". Reporting why a press was refused is what tells a stopped walk and a stuck
 * one apart.
 */
async function advance(page) {
  return page.evaluate((labels) => {
    const button = [...document.querySelectorAll('button')].find((element) =>
      labels.some((label) => (element.getAttribute('aria-label') ?? '') === label))
    if (!button) return { pressed: false, reason: 'no control with that name' }
    if (button.disabled) return { pressed: false, reason: 'disabled' }
    button.click()
    return { pressed: true, reason: '' }
  }, NEXT_LABELS)
}

const browser = await puppeteer.launch({
  executablePath: chromeExecutablePath(),
  headless: 'shell',
  protocolTimeout: 180_000,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
let failure = ''
const walked = []
try {
  await page.setViewport({ width: WIDTH, height: HEIGHT })
  await page.goto(BASE, { waitUntil: 'networkidle2' })
  await loginThroughUi(page, { username: USERNAME, password: PASSWORD })
  await dismissUpdatePrompt(page)
  await sleep(1_500)
  await writeNote(page, fixture())
  // A real pointer click, as the visual gate does: a scripted `element.click()` leaves focus in the
  // editor, and the show's own key handling ignores an arrow that the editor was typing into.
  await clickButton(page, START_LABELS)
  await page.waitForSelector('[data-slide-canvas] [data-slide-page]', { timeout: 20_000 })
  // The rail lists a slide's pages only once its plan is measured, and the idle pass measures the
  // deck ahead of the show, so a walk that starts too early reads one page for a three-page slide.
  await sleep(3_000)
  // Long enough for a deck whose every slide continues over a dozen pages.
  let move = { pressed: false, reason: 'the walk never pressed' }
  for (let step = 0; step < 80; step++) {
    const read = await readPage(page)
    if (!read) {
      failure = 'the show drew no canvas to measure'
      break
    }
    const last = walked.at(-1)
    if (last && last.slide === read.slide && last.sub === read.sub) {
      // A disabled next control is the end of the deck, which is a finished walk, not a broken one.
      if (move.reason !== 'disabled') failure = `the show did not advance: ${move.reason}`
      break
    }
    walked.push(read)
    move = await advance(page)
    await sleep(500)
  }
} catch (error) {
  failure = String(error?.message ?? error)
} finally {
  await browser.close()
}

if (failure) {
  console.error(`✗ ${failure}`)
  process.exit(1)
}

console.log(JSON.stringify({ viewport: `${WIDTH}x${HEIGHT}`, walked }, null, 2))
for (const read of walked) {
  for (const block of read.blocks) {
    const onScreen = block.font * block.applied * read.stage
    console.log(
      `slide ${read.slide + 1} page ${read.sub + 1}/${read.pages}  ${block.tag} h=${block.height} ` +
        `scale=${block.applied.toFixed(3)} transform=${block.transform} clip=${block.clip || 'none'} ` +
        `body=${block.font.toFixed(2)}px -> ${onScreen.toFixed(2)}px css on ${WIDTH}x${HEIGHT} ` +
        `(unit ${block.unitCount}x${block.unitHeight.toFixed(1)}px, base ${read.base}px, stage ${read.stage.toFixed(3)})`,
    )
  }
}
