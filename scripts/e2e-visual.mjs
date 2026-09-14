// Visual end-to-end gate: renders the app in real Chrome (puppeteer-core +
// the system Chrome that GitHub runners preinstall) and asserts the prose
// pipeline that API-level e2e cannot see — code blocks with syntax
// highlighting and line numbers, mermaid diagrams, KaTeX math — plus the
// mobile .mobile-pane-layer transitions and the desktop split preview.
//
// The flow is UI-driven on purpose: demo-mode sessions live in client memory
// (a reload logs out) and notes created through raw API calls bypass the
// client store, so the probe note is created through the real new-note button
// and typed into the real editor. Registration is a one-time event on real
// instances and stays out of scope — the gate signs in with an existing
// account instead.
//
// Usage: node scripts/e2e-visual.mjs [baseUrl]   (default http://localhost:7712)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import {
  PALETTE_PANEL,
  SETTINGS_PANEL,
  chromeExecutablePath,
  clickButton,
  ensureAxe,
  ensurePaneVisible,
  isReviewedIncomplete,
  loginThroughUi,
  pressCombo,
  runAxe,
  setAppTheme,
  sleep,
  waitForPanelSettled,
} from './e2e-harness.mjs'

const BASE = process.argv[2] ?? 'http://localhost:7712'
// Credentials of an existing account to sign in as. CI runs this gate right
// after scripts/e2e.mjs, which registered Owner-1, rotated its password to
// supersecret100, and then closed registration — so the default matches that
// final account state.
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_VIEWPORT = { width: 1280, height: 900 }

const NOTE_MARKDOWN = [
  '# Visual E2E Probe',
  '',
  '```ts title="probe.ts" line-numbers {2}',
  'const name = "Inkstone"',
  'console.log(`Hello, ${name}!`)',
  '```',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Markdown] --> B[Preview]',
  '```',
  '',
  '---',
  '',
  'Inline math $E = mc^2$ and display math:',
  '',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
].join('\n')

let pass = 0
let fail = 0
function check(name, cond, extra = '') {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

// zh-CN and en-US labels, matched on both text and aria-label so the gate is
// locale-agnostic. Keep in sync with src/shared/locales/*/common.ts.
const LABELS = {
  newNote: ['新建笔记', 'New note'],
  nav: ['导航', 'Navigation'],
  list: ['笔记', 'Notes'],
  edit: ['编辑', 'Edit'],
  preview: ['预览', 'Preview'],
  present: ['演示模式', 'Presentation mode'],
  presentExit: ['退出演示', 'Exit presentation'],
  presentExport: ['导出幻灯片为 PDF', 'Export deck as PDF'],
  presentExportImages: ['导出幻灯片为图片序列', 'Export deck as images'],
  presentRail: ['显示幻灯片列表', '隐藏幻灯片列表', 'Show slides', 'Hide slides'],
  presentFreeze: ['冻结当前快照', 'Freeze this snapshot'],
  presentFollow: ['跟随笔记更新', 'Follow the note'],
  outline: ['大纲', 'Outline', 'outline'],
}

async function activeProse(page) {
  return page.evaluate(() => {
    const scope = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
      (layer) => layer.hasAttribute('data-active'),
    ) ?? document
    const root = scope.querySelector('.ink-prose')
    if (!root || root.getClientRects().length === 0) return null
    const code = root.querySelector('pre code')
    const mermaid = root.querySelector('svg')
    const mermaidBox = mermaid?.getBoundingClientRect()
    return {
      text: root.textContent,
      codeText: code?.textContent ?? '',
      highlighted: root.querySelectorAll('pre code [class]').length > 0,
      // Code enhance renders one .line per row and paints the digit through a
      // CSS ::before on [data-line-number] (styles/prose/code.css).
      lineNumber: !!root.querySelector('[data-line-number]'),
      hasMermaid: !!mermaid,
      mermaidVisible: !!mermaidBox && mermaidBox.width > 10 && mermaidBox.height > 10,
      katex: root.querySelectorAll('.katex').length,
    }
  })
}

async function typeProbeNote(page) {
  // The list layer stays mounted after login; make it the active pane so its
  // header button is genuinely clickable.
  await clickButton(page, LABELS.list)
  await sleep(400)
  await clickButton(page, LABELS.newNote)
  // Creating a note selects it; the mobile shell lands on the preview pane of
  // the empty note. Switch to the editor pane.
  await clickButton(page, LABELS.edit)
  await page.waitForSelector('.cm-content', { timeout: 30_000 })
  await page.evaluate((markdown) => {
    const content = document.querySelector('.cm-content')
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    document.execCommand('insertText', false, markdown)
  }, NOTE_MARKDOWN)
  await sleep(1_500) // autosave debounce

  await clickButton(page, LABELS.preview)
  await page.waitForFunction(() => {
    const layer = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
      (candidate) => candidate.hasAttribute('data-active'),
    )
    const prose = layer?.querySelector('.ink-prose')
    return !!prose && prose.getClientRects().length > 0
  }, { timeout: 30_000 })
  await waitForProseEnhancements(page)
}

// Mermaid/KaTeX/prism load behind lazy dynamic imports; give them a bounded
// window to finish before the assertions run.
async function waitForProseEnhancements(page, timeout = 20_000) {
  await page.waitForFunction(
    () => {
      const scope = Array.from(document.querySelectorAll('.mobile-pane-layer')).find(
        (layer) => layer.hasAttribute('data-active'),
      ) ?? document
      const root = scope.querySelector('.ink-prose')
      return !!root && !!root.querySelector('svg') && root.querySelectorAll('.katex').length >= 2
    },
    { timeout },
  )
}

async function assertProseSurface(page, surface) {
  const prose = await activeProse(page)
  check(`${surface}: prose container visible`, !!prose)
  if (!prose) return
  check(`${surface}: probe content rendered`, prose.text.includes('Visual E2E Probe'))
  check(`${surface}: code fence present`, prose.codeText.includes('Hello,'))
  check(`${surface}: syntax highlight tokens applied`, prose.highlighted)
  check(`${surface}: line-number gutter rendered`, prose.lineNumber)
  check(`${surface}: mermaid svg rendered`, prose.hasMermaid)
  check(`${surface}: mermaid svg has layout size`, prose.mermaidVisible)
  check(`${surface}: katex math rendered (inline + display)`, prose.katex >= 2, `count=${prose.katex}`)
}

async function assertPaneTransition(page) {
  await clickButton(page, LABELS.list)
  const midFlight = await page.evaluate(async () => {
    // Re-open the preview pane and sample the layer transition in flight.
    const tabs = () => Array.from(document.querySelectorAll('nav[aria-label] button'))
    const preview = tabs().at(-1)
    preview.click()
    await new Promise((resolve) => setTimeout(resolve, 60))
    const layer = document.querySelector('.mobile-pane-layer[data-active]')
    const style = layer ? getComputedStyle(layer) : null
    await new Promise((resolve) => setTimeout(resolve, 900))
    return {
      sampled: !!style,
      transition: style?.transition ?? '',
      activeNow: !!document.querySelector('.mobile-pane-layer[data-active] .ink-prose'),
    }
  })
  check(
    'mobile: pane switch carries the motion transition',
    midFlight.sampled && midFlight.transition.includes('transform') && midFlight.transition.includes('opacity'),
    midFlight.transition.slice(0, 60),
  )
  check('mobile: preview pane active after transition', midFlight.activeNow)
}

async function assertDesktopSplit(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600) // let the breakpoint listeners re-render the shell
  // Ctrl+\ cycles edit -> split -> preview; stop once the prose is visible.
  for (let attempt = 0; attempt < 3 && !(await activeProse(page)); attempt++) {
    await page.keyboard.down('Control')
    await page.keyboard.press('Backslash')
    await page.keyboard.up('Control')
    await sleep(800)
  }
  await assertProseSurface(page, 'desktop-split')
}

// Presentation mode is asserted from its own contract rather than the editor's:
// the design canvas has to fill the stage at any window size, the type has to be
// large enough to read from the back of a room, the slide list has to list the
// deck, and no block may spill past the canvas bottom.
async function assertPresentation(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await sleep(1_500)

  const deck = await page.evaluate(() => {
    const canvas = document.querySelector('[data-slide-canvas]')
    const stage = canvas.parentElement.getBoundingClientRect()
    const box = canvas.getBoundingClientRect()
    const host = canvas.querySelector('[data-slide-page]')
    const visible = [...host.children].filter((el) => el.style.visibility !== 'hidden')
    return {
      fills: box.width >= stage.width - 1 && box.height >= stage.height - 1,
      contentFills: host.getBoundingClientRect().width > box.width * 0.85,
      fontSize: Number.parseFloat(getComputedStyle(host).fontSize),
      slides: document.querySelectorAll('[data-presentation-rail] [data-slide-index]').length,
      overflow: visible.some((el) => el.getBoundingClientRect().bottom > box.bottom + 2),
    }
  })

  check('presentation: canvas fills the stage', deck.fills)
  check('presentation: prose column fills the canvas', deck.contentFills)
  check('presentation: type is enlarged for the projector', deck.fontSize >= 24, `fontSize=${deck.fontSize}px`)
  check('presentation: slide list lists the deck', deck.slides >= 2, `slides=${deck.slides}`)
  check('presentation: no block overflows the canvas', !deck.overflow)

  await clickButton(page, LABELS.presentExit)
  await sleep(600)
  check('presentation: exit returns to the note', await page.evaluate(() => !document.querySelector('[data-slide-canvas]')))
}

// The session contract: a show follows the note it was started from (so an edit
// reaching this tab — another tab, another device, an MCP write — lands on the
// projector), freezing pins what is on screen, and the show outlives the layout
// switch that unmounts the workspace it started from.
async function assertPresentationSession(page) {
  const started = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => /演示模式|Presentation mode/.test(item.getAttribute('aria-label') ?? ''))
    button.focus()
    button.click()
    return document.activeElement === button
  })
  check('presentation session: the start control takes focus', started)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await sleep(1_500)

  const before = await presentationSession(page)
  check('presentation session: starts following the note', LABELS.presentFreeze.includes(before.followLabel), `label=${before.followLabel}`)

  // The deck length is read from the page counter, not from the slide list: the rail
  // mounts thumbnails lazily, so a deck that grows past the fold lists fewer items
  // than it has pages.
  await appendToNote(page, LIVE_EDIT_ONE)
  await sleep(2_000)
  const followed = await presentationSession(page)
  check('presentation session: an edit lands on the projector while following', followed.total === before.total + 1, `before=${before.position} after=${followed.position}`)

  await clickPresentationControl(page, LABELS.presentFreeze)
  await sleep(800)
  const frozen = await presentationSession(page)
  check('presentation session: freezing switches the control back to following', LABELS.presentFollow.includes(frozen.followLabel), `label=${frozen.followLabel}`)

  await appendToNote(page, LIVE_EDIT_TWO)
  await sleep(2_000)
  const pinned = await presentationSession(page)
  check('presentation session: a frozen deck ignores further edits', pinned.total === followed.total, `position=${pinned.position}`)

  await clickPresentationControl(page, LABELS.presentFollow)
  await sleep(2_000)
  const resumed = await presentationSession(page)
  check('presentation session: unfreezing catches up with the note', resumed.total === before.total + 2, `position=${resumed.position}`)

  // Crossing the mobile breakpoint rebuilds the whole shell subtree, which used to
  // take the workspace (and the show with it) down mid-talk.
  await page.setViewport(MOBILE_VIEWPORT)
  await sleep(1_500)
  const mobile = await presentationSession(page)
  check('presentation session: the show survives the mobile breakpoint', mobile.open && mobile.position === resumed.position, `position=${mobile.position}`)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(1_500)
  const desktop = await presentationSession(page)
  check('presentation session: the show survives switching back', desktop.open && desktop.position === resumed.position, `position=${desktop.position}`)
  check('presentation session: the canvas refills the stage', desktop.filled)

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(800)
  const closed = await presentationSession(page)
  check('presentation session: exit still works after the round trip', !closed.open)
  check('presentation session: focus is never left inside the closed overlay', !closed.inDialog)
  check('presentation session: the note is still open behind the show', await page.evaluate(() => Boolean(document.querySelector('.cm-content'))))
}

// The slide list is a page list: a note that never uses `---` is one slide but many
// pages, and listing only the `---` slides left a 14-page deck with a one-entry
// sidebar. The deck is measured off-screen while the show is idle, so this opens a
// show on a two-slide deck, navigates nowhere, and then checks that the list already
// knows every slide's pages — and that each slide's entry count equals the page count
// the canvas reports when the show actually displays that slide.
// The chart node in the stage: the block that holds it, its container, and the canvas the projector
// drew on. `scrolls` is the property the slide surface must never have — the chart block is the one
// box in a slide that can grow a scrollbar.
async function readChartBox(page) {
  return page.evaluate(() => {
    const block = document.querySelector('[data-slide-canvas] [data-chart]')
    if (!block) return null
    const container = block.querySelector('.chartjs-container')
    const canvas = block.querySelector('canvas')
    return {
      block: `${block.clientWidth}x${block.clientHeight}`,
      scroll: `${block.scrollWidth}x${block.scrollHeight}`,
      scrolls: block.scrollWidth > block.clientWidth + 1 || block.scrollHeight > block.clientHeight + 1,
      container: `${container?.clientWidth}x${container?.clientHeight}`,
      canvas: `${canvas?.clientWidth}x${canvas?.clientHeight}`,
      drawn: canvas ? canvas.width > 0 && canvas.height > 0 : false,
    }
  })
}

async function assertPresentationPages(page) {
  // The flip this scenario is about can only be observed from the "system" setting, and the account
  // arrives on whatever ran before this gate (scripts/e2e.mjs leaves it dark), so the setting is
  // made explicit before the show opens — the settings dialog is not reachable from inside a show.
  await setAppTheme(page, 'system')
  await openDeckNote(page)
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  // Read the deck the show opens on, before the idle pass fills the list: a show that
  // starts on the content the closed overlay was holding reports a one-slide deck here.
  const opening = await readDeckSize(page)
  await waitForRailFilled(page)

  const deck = await page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const entries = [...panel.querySelectorAll('[data-presentation-rail] [data-entry-index]')]
    const counts = {}
    for (const entry of entries) counts[entry.dataset.slideIndex] = (counts[entry.dataset.slideIndex] ?? 0) + 1
    const current = entries.find((entry) => entry.getAttribute('aria-current') === 'true')
    const openedOn = Number(current?.dataset.slideIndex ?? 0)
    const widest = Object.keys(counts).reduce((best, slide) => (counts[slide] > counts[best] ? slide : best), Object.keys(counts)[0])
    return {
      entries: entries.length,
      slides: Number.parseInt((panel.querySelector('[aria-live="polite"]')?.textContent ?? '').split('/')[1] ?? '', 10) || 0,
      counts,
      openedOn,
      aheadEntries: counts[String(openedOn + 1)] ?? 0,
      widestSlide: Number(widest),
    }
  })
  check('presentation pages: a show opens on the deck the note has now', opening.slides === deck.slides, `opening=${opening.position} settled=${deck.slides} slides`)
  check('presentation pages: the list lists pages, not only slides', deck.entries > deck.slides, `entries=${deck.entries} slides=${deck.slides}`)
  check('presentation pages: the idle pass measured a slide the show has not reached', deck.aheadEntries > 1, `slide ${deck.openedOn + 1} has ${deck.aheadEntries} entries`)

  const counts = await readPageCountsPerSlide(page, deck.counts)
  const mismatch = counts.find((item) => item.entries !== item.pages)
  check('presentation pages: every slide lists exactly the pages the canvas measures', !mismatch, mismatch ? `slide=${mismatch.slide} entries=${mismatch.entries} pages=${mismatch.pages}` : `${counts.length} slides agree`)

  const second = await clickPageEntry(page, deck.widestSlide, 1)
  check('presentation pages: clicking a page entry lands on that page', second.numerator === 2, `chip=${second.numerator}/${second.denominator}`)

  // The list renders the same prepared markup the projector shows — diagrams and math included —
  // and keeps doing so when the theme changes mid-talk, which is what happens to anyone on the
  // "system" setting when the OS flips. The deck is re-prepared for the new theme, so this polls
  // for the list to catch up instead of asserting on the frame right after the flip.
  await jumpToFirstPage(page)
  const prepared = await waitForRenderedMarkup(page)
  check('presentation pages: a thumbnail renders the markup the projector prepared', sameArtifacts(prepared), `stage=${describeArtifacts(prepared.stage)} thumb=${describeArtifacts(prepared.thumb)}`)
  check('presentation pages: the projector draws the chart on its own canvas', prepared.stage.live && prepared.stage.painted > 0, describeArtifacts(prepared.stage))
  check('presentation pages: the slide list shows the chart as a picture', prepared.thumb.still > 0, describeArtifacts(prepared.thumb))

  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }])
  await sleep(400)
  check('presentation pages: the system theme flip reaches the show', (await readRenderedMarkup(page)).theme === 'dark')
  const flipped = await waitForRenderedMarkup(page)
  check('presentation pages: a theme flip re-prepares the list instead of leaving placeholders', sameArtifacts(flipped), `stage=${describeArtifacts(flipped.stage)} thumb=${describeArtifacts(flipped.thumb)}`)
  await page.emulateMediaFeatures([])

  // The slide canvas is scaled with a CSS transform, so a chart must not measure through it: the
  // canvas has to be exactly the size of its box, or it is drawn stage-scale times too big — the
  // chart block then grows a scrollbar in both directions, and one size larger on the next change.
  // The check happens while the show is on this slide, not at the end: a later redraw can happen to
  // be measured while the stage is unscaled, which hides the mis-sized canvas the show was showing.
  const chartBox = await readChartBox(page)
  check('presentation pages: the chart canvas is the size of its box', chartBox?.canvas === chartBox?.container && chartBox?.drawn, JSON.stringify(chartBox))
  check('presentation pages: the chart block carries no scrollbar', chartBox?.scrolls === false, JSON.stringify(chartBox))

  // And it has to stay that way through a geometry change. The stage has to *grow* for a scrollbar to
  // be possible at all (a stage smaller than the design canvas scales it down, and a canvas measured
  // too small leaves a gap), and the chart has to be redrawn to be measured again: re-slicing the
  // page is what remounts it, and hiding and showing the slide list is what re-slices it.
  await page.setViewport({ width: 1600, height: 1000 })
  await sleep(700)
  await clickPresentationControl(page, LABELS.presentRail)
  await sleep(1_200)
  await clickPresentationControl(page, LABELS.presentRail)
  await sleep(1_200)
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(700)
  const resized = await readChartBox(page)
  check('presentation pages: the chart is still the size of its box after the stage resizes', resized?.canvas === resized?.container && resized?.scrolls === false, JSON.stringify(resized))

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
  // Hand the run back on the light palette the later scenarios measure on.
  await setAppTheme(page, 'light')
}

// The presentation surface is a modal dialog around a scaled canvas: exactly the shape where a
// missing role, an unnamed control or a low-contrast token goes unnoticed by eye. axe-core is
// injected into the live page (its own browser build, evaluated rather than added as a script
// tag so the app's CSP stays untouched) and run over the whole overlay with the slide list open.
async function assertPresentationAccessibility(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await waitForRailFilled(page)
  await ensureAxe(page)
  const report = await runAxe(page, '[role="dialog"]')
  check('a11y: the presentation overlay has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  const unexpected = report.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('a11y: no unexpected axe review items', unexpected.length === 0, JSON.stringify(unexpected))
  check('a11y: axe actually inspected the slide surface', report.passes >= 10, `passes=${report.passes}`)

  // Keyboard path next to the automated rules: the slide list walks its own pages with the
  // arrows, and the counter follows it there.
  const walked = await page.evaluate(async () => {
    const rail = document.querySelector('[data-presentation-rail]')
    const active = () => rail.querySelector('[data-entry-index][aria-current="true"]')
    active()?.focus()
    const before = active()?.dataset.entryIndex ?? ''
    rail.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 400))
    const after = active()
    return { before, after: after?.dataset.entryIndex ?? '', chip: document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent?.trim() ?? '' }
  })
  check('a11y: the slide list walks its pages from the keyboard', walked.after !== '' && walked.after !== walked.before, JSON.stringify(walked))
  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// Exporting the deck runs through the browser's print pipeline, so this asserts what the promise
// rests on: the sheet it prints holds one page box per deck page (built from the same measured
// plans the show walks), the pages are the slide at the stage's own scale rather than the reader's
// prose scale (a page sliced against the slide layout reflows against any other), the charts are
// drawn live onto the sheet's canvases instead of printing the picture the cache carries, and the
// PDF Chrome actually renders from it has that many pages. The PDF is counted by its page objects,
// which is what "the pages match the show" means.
async function assertDeckExport(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  const entries = await waitForRailFilled(page)
  const stageFont = await page.evaluate(() => getComputedStyle(document.querySelector('[data-slide-canvas] [data-slide-page]')).fontSize)
  await clickPresentationControl(page, LABELS.presentExport)
  // The sheet prints once it has drawn what the show draws, so its own readiness marker is what
  // makes the reads below land on a finished sheet rather than a half-drawn one.
  await page.waitForSelector('[data-deck-print][data-deck-print-ready="true"]', { timeout: 20_000 })
  const sheet = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('[data-deck-print] .deck-print-page')]
    const painted = () => {
      const canvas = document.querySelector('[data-deck-print] [data-chart] canvas')
      if (!canvas) return 0
      try {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = 0
        for (let index = 3; index < data.length; index += 400) if (data[index] > 0) drawn++
        return drawn
      } catch {
        return -1
      }
    }
    const blocks = [...document.querySelectorAll('[data-deck-print] [data-chart]')]
    return {
      pages: pages.length,
      withContent: pages.filter((box) => box.querySelector('.ink-prose')?.children.length ?? 0 > 0).length,
      pageRule: [...document.styleSheets]
        .flatMap((sheet) => { try { return [...sheet.cssRules] } catch { return [] } })
        .filter((rule) => rule.constructor.name === 'CSSPageRule')
        .map((rule) => rule.cssText)
        .find((text) => /size:/.test(text)) ?? '',
      live: blocks.filter((block) => block.__chartInstance && block.querySelector('canvas')?.width > 0).length,
      stills: document.querySelectorAll('[data-deck-print] [data-chart] img.chartjs-still').length,
      painted: painted(),
      font: getComputedStyle(document.querySelector('[data-deck-print] .deck-print-body [data-slide-page]')).fontSize,
    }
  })
  check('export: the print sheet holds one page per deck page', sheet.pages > 1 && sheet.pages === entries, `sheet=${sheet.pages} rail=${entries}`)
  check('export: every printed page carries its own content', sheet.withContent === sheet.pages, `content=${sheet.withContent}/${sheet.pages}`)
  check('export: the print page size follows the design canvas', /size: \d+px \d+px/.test(sheet.pageRule), sheet.pageRule.slice(0, 60))
  check('export: the printed deck draws its charts live', sheet.live > 0 && sheet.painted > 0, `live=${sheet.live} painted=${sheet.painted}`)
  check('export: the printed deck prints no chart stills left over', sheet.stills === 0, `stills=${sheet.stills}`)
  check('export: a printed page uses the slide type scale', sheet.font === stageFont, `sheet=${sheet.font} stage=${stageFont}`)

  const pdf = Buffer.from(await page.pdf({ printBackground: true, preferCSSPageSize: true }))
  const printed = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  check('export: the printed PDF has the deck page count', printed === sheet.pages, `pdf=${printed} sheet=${sheet.pages}`)

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// The image export is the same deck through a different renderer, so what it has to prove is that a
// file came out of it: every page rasterized (the sheet reports that itself, and it only reports it
// after the archive was handed to the browser) and the browser then wrote the archive somewhere.
// Its pages are the page boxes the PDF export uses, built from the same measured plans.
async function assertDeckImageExport(page) {
  const downloadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkstone-deck-images-'))
  const client = await page.createCDPSession()
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })

  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  const entries = await waitForRailFilled(page)
  await clickPresentationControl(page, LABELS.presentExportImages)
  await page.waitForSelector('[data-deck-print][data-deck-image-ready="true"]', { timeout: 60_000 })
  const images = await page.evaluate(() => {
    const sheet = document.querySelector('[data-deck-print][data-deck-image-ready]')
    return {
      pages: sheet?.querySelectorAll('.deck-print-page').length ?? 0,
      charts: sheet?.querySelectorAll('[data-chart] canvas').length ?? 0,
    }
  })
  check('export: the image export carries one page per deck page', images.pages > 1 && images.pages === entries, `images=${images.pages} rail=${entries}`)
  check('export: the image export draws its charts on the sheet', images.charts > 0, `charts=${images.charts}`)

  await sleep(2000)
  const saved = fs.readdirSync(downloadDir)
  check('export: the deck images are saved as one archive', saved.some((name) => name.endsWith('.zip')), JSON.stringify(saved))
  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// The mind map block is the surface with the most moving parts: the library loads on demand, the
// live instance is re-parented into every new render (that adoption is what two-way editing rests
// on), and full screen moves the very same element rather than drawing a second copy of the map.
// The scenario appends a fence to the probe note, then reads the preview, the overlay and the
// hand-back of the focus.
const MINDMAP_MARKDOWN = ['', '', '```mindmap', '- Visual Probe', '  - Live block', '  - Two way editing', '```'].join('\n')

// The layout cycling the mind map scenarios need (the editor to type a fence, the prose to read it
// back) is shared plumbing now: e2e-harness.mjs cycles it for this gate and the contrast gate alike.

/**
 * What the map paints from its own theme: the colour variables the library writes as inline styles on
 * the element it draws in, and the branch colour it bakes into the nodes that carry one. Both are
 * read off that element rather than off the stylesheet, because a theme that never reached the
 * instance is exactly the state under test. The branch colour comes from the first node that has one
 * — only the topics a connector is drawn for are painted, the rest inherit — and it is read beside
 * the canvas an earlier step stashed, so a rebuild cannot pass as a repaint.
 */
async function readMindmapTheme(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-canvas')
    const stage = canvas?.querySelector('.map-container')
    const branch = [...(canvas?.querySelectorAll('me-tpc') ?? [])]
      .map((node) => node.style.borderColor)
      .find((color) => color.length > 0) ?? ''
    return {
      sameElement: canvas === window.__mindmapCanvas,
      root: stage?.style.getPropertyValue('--root-bgcolor').trim() ?? '',
      branch,
    }
  })
}

async function assertMindmapBlock(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(600)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('mindmap scenario: the editor pane never became visible')
  await page.evaluate((markdown) => {
    const content = document.querySelector('.cm-content')
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    document.execCommand('insertText', false, markdown)
  }, MINDMAP_MARKDOWN)
  await sleep(1_500)
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('mindmap scenario: the preview pane never became visible')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-block .mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return !!box && box.width > 100 && box.height > 100
  }, { timeout: 30_000 })

  const block = await page.evaluate(() => {
    const node = document.querySelector('.ink-prose .mindmap-block')
    const canvas = node?.querySelector('.mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return {
      ready: Boolean(node?.classList.contains('is-ready')),
      height: Math.round(box?.height ?? 0),
      role: canvas?.getAttribute('role') ?? '',
      label: canvas?.getAttribute('aria-label') ?? '',
      controls: node?.querySelectorAll('[data-mindmap-fit], [data-mindmap-fullscreen]').length ?? 0,
    }
  })
  check('mindmap: the block renders a live canvas', block.ready, JSON.stringify(block))
  check('mindmap: the canvas is announced as an application widget', block.role === 'application' && block.label.length > 0, JSON.stringify(block))
  check('mindmap: the block header offers fit and full screen', block.controls === 2, `controls=${block.controls}`)

  await page.evaluate(() => {
    window.__mindmapCanvas = document.querySelector('.ink-prose .mindmap-canvas')
  })
  await page.click('.ink-prose .mindmap-block [data-mindmap-fullscreen]')
  await page.waitForSelector('.mindmap-fullscreen-canvas .mindmap-canvas', { timeout: 15_000 })
  await waitForPanelSettled(page, '.mindmap-fullscreen')
  await sleep(600)

  const full = await page.evaluate(() => {
    const dialog = document.querySelector('.mindmap-fullscreen')
    const canvas = dialog?.querySelector('.mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return {
      hosted: Boolean(canvas) && canvas === window.__mindmapCanvas,
      height: Math.round(box?.height ?? 0),
      label: dialog?.getAttribute('aria-label') ?? '',
      controls: dialog?.querySelectorAll('button[aria-label]').length ?? 0,
      focused: Boolean(document.activeElement?.closest?.('.mindmap-canvas')),
      nodes: dialog?.querySelectorAll('me-tpc').length ?? 0,
    }
  })
  check('mindmap: full screen hosts the same live element', full.hosted, JSON.stringify(full))
  check('mindmap: full screen gives the map the viewport', full.height > block.height, `inline=${block.height} full=${full.height}`)
  check('mindmap: full screen exposes the view, shortcut and export controls', full.controls >= 6, `controls=${full.controls}`)
  check('mindmap: the overlay is announced by the map title', full.label === 'Visual Probe', `label=${full.label}`)
  check('mindmap: the map takes the focus in full screen', full.focused)

  // The keyboard reference is a layer of the drawing area, not a row of the toolbar: opening it there
  // must leave the head the size it was, or it pushes the button that was just pressed out from
  // under the pointer.
  const reference = await page.evaluate(async () => {
    const head = document.querySelector('.mindmap-fullscreen-head')
    const canvas = document.querySelector('.mindmap-fullscreen-canvas')
    const before = head?.getBoundingClientRect().height ?? 0
    const toggle = [...(head?.querySelectorAll('button') ?? [])]
      .find((element) => /shortcut|快捷键/.test(element.getAttribute('aria-label') ?? ''))
    toggle?.click()
    await new Promise((resolve) => setTimeout(resolve, 300))
    const card = document.querySelector('.mindmap-shortcuts')
    const cardBox = card?.getBoundingClientRect()
    const canvasBox = canvas?.getBoundingClientRect()
    return {
      opened: Boolean(card),
      inHead: Boolean(card && head?.contains(card)),
      inDrawingArea: Boolean(cardBox && canvasBox
        && cardBox.top >= canvasBox.top && cardBox.bottom <= canvasBox.bottom
        && cardBox.left >= canvasBox.left && cardBox.right <= canvasBox.right),
      headGrowth: Math.round((head?.getBoundingClientRect().height ?? 0) - before),
    }
  })
  check('mindmap: the keyboard reference opens', reference.opened, JSON.stringify(reference))
  check('mindmap: the keyboard reference sits in the drawing area, not the toolbar', reference.inDrawingArea && !reference.inHead, JSON.stringify(reference))
  check('mindmap: opening the keyboard reference leaves the toolbar its size', reference.headGrowth === 0, JSON.stringify(reference))

  // The card is measured while it is open: axe only reads what is on screen, and closing it first
  // would leave the one surface this gate added unread. The contrast gate opens the same overlay with
  // the same card in both themes; here the run is the light one the later scenarios measure on.
  await ensureAxe(page)
  const report = await runAxe(page, '.mindmap-fullscreen')
  check('a11y: the mind map full screen has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  check('a11y: axe inspected the mind map surface', report.passes >= 10, `passes=${report.passes}`)
  const referenceAudited = await page.evaluate(() => {
    const card = document.querySelector('.mindmap-shortcuts')
    return { open: Boolean(card), lines: card?.querySelectorAll('li').length ?? 0 }
  })
  check('a11y: the keyboard reference was on screen for the axe pass', referenceAudited.open && referenceAudited.lines >= 9, JSON.stringify(referenceAudited))

  await page.keyboard.press('Escape')
  const referenceClosed = await page.waitForFunction(
    () => !document.querySelector('.mindmap-shortcuts') && !!document.querySelector('.mindmap-fullscreen'),
    { timeout: 15_000 },
  ).then(() => true, () => false)
  check('mindmap: escape puts the keyboard reference away without leaving full screen', referenceClosed)

  // Keyboard path: Tab on the focused map is the library's add-child shortcut, and Tab or Enter in the
  // node editor commits it. The new node has to reach the note source, because the map and the fence
  // it came from are one document.
  await page.click('.mindmap-fullscreen-canvas me-tpc')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  const written = await page.waitForFunction(
    (names) => names.some((name) => (document.querySelector('.cm-content')?.textContent ?? '').includes(name)),
    { timeout: 15_000 },
    ['New node', '新节点'],
  ).then(() => true, () => false)
  check('mindmap: a node added from the keyboard reaches the note source', written)
  const nodes = await page.evaluate(() => document.querySelectorAll('.mindmap-fullscreen-canvas me-tpc').length)
  check('mindmap: the added node is on the map too', nodes === full.nodes + 1, `before=${full.nodes} after=${nodes}`)

  // Enter is the map's add-sibling shortcut and it opens the new node for editing. The overlay has to
  // survive both the operation and the write it schedules: whoever is building the map loses their
  // place, and the camera with it, if full screen drops out from under them mid-edit.
  await sleep(600)
  await page.keyboard.press('Enter')
  await sleep(400)
  const sibling = await page.evaluate(() => ({
    full: Boolean(document.querySelector('.mindmap-fullscreen')),
    hosted: Boolean(document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas')),
    inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
    nodes: document.querySelectorAll('.mindmap-fullscreen-canvas me-tpc').length,
    editing: Boolean(document.querySelector('.mindmap-canvas #input-box')),
  }))
  check('mindmap: enter opens a sibling without leaving full screen', sibling.full && sibling.hosted && !sibling.inline && sibling.nodes === nodes + 1, JSON.stringify(sibling))
  check('mindmap: the new sibling is open for editing', sibling.editing, JSON.stringify(sibling))
  await page.keyboard.type('Keyboard sibling')
  await sleep(250)
  await page.keyboard.press('Enter')
  await sleep(1_200)
  const afterSibling = await page.evaluate(() => ({
    full: Boolean(document.querySelector('.mindmap-fullscreen')),
    hosted: Boolean(document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas')),
    written: (document.querySelector('.cm-content')?.textContent ?? '').includes('Keyboard sibling'),
  }))
  check('mindmap: the sibling reaches the note with full screen still open', afterSibling.full && afterSibling.hosted && afterSibling.written, JSON.stringify(afterSibling))

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.mindmap-fullscreen'), { timeout: 15_000 })
  const closed = await page.evaluate(() => ({
    focusBack: document.activeElement?.hasAttribute('data-mindmap-fullscreen') ?? false,
    canvases: document.querySelectorAll('.mindmap-canvas').length,
    inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
  }))
  check('mindmap: escape leaves full screen and the map moves back', closed.inline && closed.canvases === 1, JSON.stringify(closed))
  check('mindmap: focus returns to the control that opened full screen', closed.focusBack, JSON.stringify(closed))

  // The library's toolbar ships a full screen button of its own. Left alone it asks the browser for
  // native full screen on the canvas, which cannot survive the re-render any edit brings: the
  // registry re-parents the canvas into the fresh placeholder, the browser sees the full screen
  // element leave the document and drops out of full screen — press Enter to add a sibling and the
  // map falls back to the pane. The button is routed to the overlay instead, so both affordances
  // open the same view and neither can be pulled out from under an edit. It is clicked through the
  // page so the check reads the app's own handler rather than a hit-test at a pixel, and the map is
  // left exactly as found: the scenario below counts nodes and edits through the same instance.
  const nativeHandler = await page.evaluate(() => typeof document.querySelector('.ink-prose .mindmap-canvas #fullscreen')?.onclick === 'function')
  check('mindmap: the library full screen button no longer requests native full screen', !nativeHandler)
  const libraryClick = await page.evaluate(() => {
    const span = document.querySelector('.ink-prose .mindmap-canvas #fullscreen')
    if (!span) return false
    span.click()
    return true
  })
  check('mindmap: the library toolbar offers its full screen button', libraryClick)
  if (libraryClick) {
    await page.waitForSelector('.mindmap-fullscreen-canvas .mindmap-canvas', { timeout: 15_000 })
    await waitForPanelSettled(page, '.mindmap-fullscreen')
    const routed = await page.evaluate(() => ({
      hosted: document.querySelector('.mindmap-fullscreen-canvas .mindmap-canvas') === window.__mindmapCanvas,
      native: document.fullscreenElement === null,
      label: document.querySelector('.mindmap-fullscreen')?.getAttribute('aria-label') ?? '',
      control: getComputedStyle(document.querySelector('.mindmap-fullscreen-canvas #fullscreen')).display,
      inline: Boolean(document.querySelector('.ink-prose .mindmap-canvas')),
    }))
    check('mindmap: the library full screen button opens the overlay on the live map', routed.hosted && routed.native && routed.label.length > 0 && !routed.inline, JSON.stringify(routed))
    check('mindmap: the library button leaves no dead control in the overlay', routed.control === 'none', JSON.stringify(routed))
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.mindmap-fullscreen'), { timeout: 15_000 })
  }

  // The map carries its own palette: the library writes a theme's colours as inline styles on the
  // element it draws in and bakes the branch colours into the nodes when it draws the connectors, so
  // a live instance has to be told about a switch. The state refuted here is the map that keeps the
  // colours it was born with until the page is reloaded. Two things are read rather than one: the
  // colour variable, which the instance always carries, and the branch colour, which only a connector
  // pass bakes in — a switch that moved the variables alone would leave every branch the colour of
  // the theme before it. The branch colour is compared between the two switched states instead of
  // against the baseline, because a layout-only pass (opening the overlay re-lays the map out) leaves
  // the nodes without one until something draws them again, which is exactly what the fix does. The
  // canvas element is compared on every read: the same element across the switch is what proves the
  // colours came from the instance on screen rather than from a rebuilt one. The account theme goes
  // back to light afterwards, because the rest of this run measures the light one.
  const lightTheme = await readMindmapTheme(page)
  check('mindmap: the live map is the element the earlier steps drove', lightTheme.sameElement && lightTheme.root.length > 0, JSON.stringify(lightTheme))
  await setAppTheme(page, 'dark')
  await page.waitForFunction(
    (previous) => document.querySelector('.ink-prose .mindmap-canvas .map-container')?.style.getPropertyValue('--root-bgcolor').trim() !== previous,
    { timeout: 5_000 },
    lightTheme.root,
  ).then(() => true, () => false)
  const darkTheme = await readMindmapTheme(page)
  await setAppTheme(page, 'light')
  await page.waitForFunction(
    (expected) => document.querySelector('.ink-prose .mindmap-canvas .map-container')?.style.getPropertyValue('--root-bgcolor').trim() === expected,
    { timeout: 5_000 },
    lightTheme.root,
  ).then(() => true, () => false)
  const backToLight = await readMindmapTheme(page)
  check(
    'mindmap: the theme switch reaches the live map without a reload',
    darkTheme.sameElement && backToLight.sameElement
    && darkTheme.root !== lightTheme.root && backToLight.root === lightTheme.root,
    `light=${JSON.stringify(lightTheme)} dark=${JSON.stringify(darkTheme)} back=${JSON.stringify(backToLight)}`,
  )
  check(
    'mindmap: the map paints the palette of the theme it is showing',
    darkTheme.branch.length > 0 && backToLight.branch.length > 0 && darkTheme.branch !== backToLight.branch,
    `dark=${JSON.stringify(darkTheme)} back=${JSON.stringify(backToLight)}`,
  )
}

// The library takes its selection from a pointer event on the node's own box, and a click that only
// lands on the block's padding leaves the previous selection in place: the key presses after it then
// act on the wrong node (Tab adds a child to the wrong parent, Delete removes the wrong node). This
// clicks the node's centre and waits for the library's own `selected` class, so every keyboard step
// below starts from a known selection instead of from an assumption about the click.
async function selectMindmapNode(page, scope, label) {
  const target = await page.evaluate(([root, text]) => {
    const atom = [...document.querySelectorAll(`${root} .mindmap-canvas me-tpc`)]
      .find((node) => node.textContent.includes(text))
    if (!atom) return null
    const box = atom.getBoundingClientRect()
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }, [scope, label])
  if (!target) return false
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.mouse.click(target.x, target.y)
    const selected = await page.waitForFunction(([root, text]) =>
      [...document.querySelectorAll(`${root} .mindmap-canvas me-tpc`)]
        .some((node) => node.classList.contains('selected') && node.textContent.includes(text)),
    { timeout: 1_500 }, [scope, label]).then(() => true, () => false)
    if (selected) return true
  }
  return false
}

// The map lags the note: an operation is written through a debounce and the map re-renders on its
// own frame, so a node count read in the same tick as the source text is the state before the write.
async function waitForMindmapNodes(page, scope, expected, timeout = 15_000) {
  return page.waitForFunction(([root, count]) =>
    document.querySelectorAll(`${root} .mindmap-canvas me-tpc`).length === count,
  { timeout }, [scope, expected]).then(() => true, () => false)
}

// The fence body as the document itself holds it, decoded from the block's own attribute. The editor
// is not a stable place to read it from: CodeMirror renders only the lines in view, so its text
// depends on where the caret and the scroll happen to be. The preview always carries the body the
// note was last committed with, which is exactly what these assertions are about.
function readFenceBody(root) {
  const encoded = document.querySelector(`${root} .mindmap-block[data-mindmap]`)?.getAttribute('data-mindmap') ?? ''
  if (!encoded.startsWith('b64.')) return encoded
  try {
    const tail = encoded.slice(4).replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(tail.padEnd(Math.ceil(tail.length / 4) * 4, '='))
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))
  }
  catch {
    return ''
  }
}

async function readNoteBody(page, scope) {
  return page.evaluate(readFenceBody, scope)
}

// The write is debounced and the preview re-renders after it, so an assertion on the frame right
// after a keypress would race both — this polls the committed body from here, where the predicate
// stays readable, until it says what it should or the deadline passes.
async function waitForNoteBody(page, scope, settled, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let body = await readNoteBody(page, scope)
  while (!settled(body) && Date.now() < deadline) {
    await sleep(200)
    body = await readNoteBody(page, scope)
  }
  return body
}

async function fenceHas(page, scope, text, present = true, timeout = 15_000) {
  const body = await waitForNoteBody(page, scope, (next) => next.includes(text) === present, timeout)
  return body.includes(text) === present
}

// Full screen is the loud surface; the preview column is the one people actually edit in. The
// library's own bindings are the input method there too — Tab adds a child, Enter commits it and
// opens a sibling, Delete removes the selected node, Ctrl+Z undoes, Alt+arrow reorders — and every
// one of them has to land in the note while the same instance stays alive through the re-render
// that follows.
async function assertMindmapSplitEditing(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('mindmap split scenario: the preview pane never became visible')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return !!box && box.width > 100 && box.height > 100
  }, { timeout: 30_000 })
  await sleep(600)
  const start = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: the map returns to the preview column on the same instance', start.same && start.nodes > 0, JSON.stringify(start))

  check('mindmap: a node is selected in the preview column', await selectMindmapNode(page, '.ink-prose', 'Live block'))
  await page.keyboard.press('Tab')
  await sleep(250)
  await page.keyboard.type('Split child')
  await page.keyboard.press('Enter')
  check('mindmap: a child added in the preview column reaches the note', await fenceHas(page, '.ink-prose', 'Split child'), await readNoteBody(page, '.ink-prose'))
  const added = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: the child is on the map and the instance survived the write', added.same && added.nodes === start.nodes + 1, JSON.stringify(added))

  // The node the library just committed stays selected, so Delete removes it and Ctrl+Z puts it
  // back. Both write through the same debounce as an edit does.
  check('mindmap: the node is selected before it is deleted', await selectMindmapNode(page, '.ink-prose', 'Split child'))
  await page.keyboard.press('Delete')
  check('mindmap: deleting the selected node leaves the note', await fenceHas(page, '.ink-prose', 'Split child', false), await readNoteBody(page, '.ink-prose'))
  await page.keyboard.down('Control')
  await page.keyboard.press('z')
  await page.keyboard.up('Control')
  // Ctrl+Z is the library's own undo, and the snapshot it lands on is the library's business: an
  // undone edit can come back carrying the topic that snapshot held rather than the text that was
  // typed (measured: the node returns as the default "new node"). What the app owes the user is that
  // the map and the note still agree, so this asserts the node is back in the note and that every
  // topic the map shows is in the fence — not which topic the library's history restored.
  const back = await waitForMindmapNodes(page, '.ink-prose', added.nodes)
  const undone = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
    topics: [...document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc')].map((node) => node.textContent.trim()),
  }))
  const undoneBody = await readNoteBody(page, '.ink-prose')
  const missing = undone.topics.filter((topic) => !undoneBody.includes(topic))
  check('mindmap: undo brings the node back and the note follows the map', back && missing.length === 0, `${JSON.stringify(undone)} missing=${JSON.stringify(missing)}`)
  check('mindmap: undo kept the same instance', undone.same && undone.nodes === added.nodes, JSON.stringify(undone))

  // Alt + an arrow reorders the selected node, and the new order has to reach the note rather than
  // only repaint the map. The selection is put on the node this scenario added, because an undo can
  // leave the selection somewhere else.
  const orderOf = async () => {
    const body = (await readNoteBody(page, '.ink-prose')).replace(/\s+/g, ' ')
    return ['Live block', 'Two way editing', 'Keyboard sibling', 'Split child']
      .map((name) => ({ name, at: body.indexOf(name) }))
      .filter((entry) => entry.at >= 0)
      .sort((a, b) => a.at - b.at)
      .map((entry) => entry.name)
  }
  const beforeMove = await orderOf()
  const target = await selectMindmapNode(page, '.ink-prose', 'Split child')
  await page.keyboard.down('Alt')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.up('Alt')
  await sleep(1_200)
  const afterMove = await orderOf()
  const reordered = await page.evaluate(() => ({
    nodes: document.querySelectorAll('.ink-prose .mindmap-canvas me-tpc').length,
    same: document.querySelector('.ink-prose .mindmap-canvas') === window.__mindmapCanvas,
  }))
  check('mindmap: alt+arrow reorders the node in the note', target && afterMove.join(' > ') !== beforeMove.join(' > ') && afterMove.includes('Split child'), `selected=${target} ${beforeMove.join(' > ')} → ${afterMove.join(' > ')}`)
  check('mindmap: reordering kept the same instance', reordered.same && reordered.nodes === undone.nodes, JSON.stringify(reordered))
}

// Jumps back to the deck's first page, so the thumbnail under test is the one holding the
// diagram and the math.
async function jumpToFirstPage(page) {
  await page.evaluate(() => {
    document.querySelector('[data-presentation-rail] [data-entry-index][data-slide-index="0"][data-slide-page="0"]')?.click()
  })
  await sleep(900)
}

// The rendered artifacts (a diagram, rendered math) a slide surface shows, taken from the active
// page's thumbnail next to the projector itself.
// `painted` samples the chart's canvas for non-transparent pixels: a chart block whose canvas was
// never drawn (the cached-markup path used to trust a serialized "already rendered" marker) has
// the right box and no drawing, which is exactly the failure this reads out.
async function readRenderedMarkup(page) {
  return page.evaluate(() => {
    const count = (root, selector) => root?.querySelectorAll(selector).length ?? 0
    const painted = (root) => {
      const canvas = root?.querySelector('[data-chart] canvas')
      if (!canvas) return 0
      try {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let drawn = 0
        for (let index = 3; index < data.length; index += 400) if (data[index] > 0) drawn++
        return drawn
      } catch {
        return -1
      }
    }
    const artifacts = (root) => ({
      svg: count(root, 'svg'),
      katex: count(root, '.katex'),
      // The projector draws a chart live; the list and the printed page show the still the cache
      // holds, so a chart counts as present either way and `painted` tells the two apart.
      charts: count(root, '[data-chart] canvas') + count(root, '[data-chart] img.chartjs-still'),
      still: count(root, '[data-chart] img.chartjs-still'),
      live: Boolean(root?.querySelector('[data-chart]')?.__chartInstance),
      painted: painted(root),
    })
    const panel = document.querySelector('[role="dialog"]')
    const stage = panel?.querySelector('[data-slide-canvas] [data-slide-page]')
    const active = panel?.querySelector('[data-presentation-rail] [data-entry-index][aria-current="true"] .ink-slide-rail-thumb .ink-prose')
    return {
      theme: document.documentElement.dataset.theme ?? '',
      stage: artifacts(stage),
      thumb: artifacts(active),
    }
  })
}

function sameArtifacts(markup) {
  return markup.stage.svg > 0 && markup.thumb.svg === markup.stage.svg && markup.thumb.katex === markup.stage.katex && markup.thumb.charts === markup.stage.charts
}

function describeArtifacts(artifacts) {
  return `svg=${artifacts.svg},katex=${artifacts.katex},charts=${artifacts.charts},live=${artifacts.live},painted=${artifacts.painted}`
}

// The deck is re-prepared one slide per idle slice, so the list catches up asynchronously.
async function waitForRenderedMarkup(page) {
  let markup = await readRenderedMarkup(page)
  for (let attempt = 0; attempt < 30 && !sameArtifacts(markup); attempt++) {
    await sleep(500)
    markup = await readRenderedMarkup(page)
  }
  return markup
}

// A fresh note pasted with a fixed deck, so the assertions do not depend on where the
// caret happened to be in the note the earlier steps were editing.
async function openDeckNote(page) {
  await page.keyboard.down('Control')
  await page.keyboard.press('n')
  await page.keyboard.up('Control')
  await sleep(1_500)
  await page.waitForSelector('.cm-content', { timeout: 20_000 })
  await appendToNote(page, `${PAGINATED_DECK}\n`)
  await sleep(1_500)
}

// The deck the show is on, as the controls report it.
async function readDeckSize(page) {
  return page.evaluate(() => {
    const position = document.querySelector('[role="dialog"] [aria-live="polite"]')?.textContent?.trim() ?? ''
    const [current, total] = position.split('/').map((part) => Number.parseInt(part.trim(), 10))
    return { position, current, slides: total || 0 }
  })
}

// The list fills one slide per idle slice, so this waits for it to stop growing.
// The pass reports its completeness on the dialog, so this waits for the state itself instead of
// reading "the count has not changed lately" — a slice that is still measuring looks like that,
// and the page assertions then ran against a list that had barely started.
async function waitForRailFilled(page) {
  await page.waitForFunction(
    () => document.querySelector('[data-slide-list-complete="true"]') !== null,
    { timeout: 60_000 },
  )
  return page.evaluate(() => document.querySelectorAll('[data-presentation-rail] [data-entry-index]').length)
}

// Clicks the first page of each slide and reads the counter, which is the canvas's own
// measurement of that slide, then hands it back next to the list's entry count.
async function readPageCountsPerSlide(page, expected) {
  const results = []
  for (const slide of Object.keys(expected).map(Number)) {
    const clicked = await page.evaluate((target) => {
      const entry = document.querySelector(`[data-presentation-rail] [data-entry-index][data-slide-index="${target}"]`)
      entry?.click()
      return Boolean(entry)
    }, slide)
    if (!clicked) continue
    await sleep(800)
    const pages = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]')
      const chip = [...panel.querySelectorAll('span')].find((item) => /^\d+\/\d+$/.test(item.textContent ?? ''))
      return chip ? Number(chip.textContent.split('/')[1]) : 1
    })
    results.push({ slide, entries: expected[slide], pages })
  }
  return results
}

// Clicks one page entry of a slide and reports the counter it landed on, which is
// what the presenter reads back from the controls.
async function clickPageEntry(browser, slide, pageOffset) {
  const clicked = await browser.evaluate((options) => {
    const entries = [...document.querySelectorAll('[data-presentation-rail] [data-entry-index]')]
      .filter((item) => Number(item.dataset.slideIndex) === options.slide)
    const entry = entries[options.pageOffset]
    entry?.click()
    return Boolean(entry)
  }, { slide, pageOffset })
  if (!clicked) throw new Error(`slide list has no page ${pageOffset + 1} on slide ${slide}`)
  await sleep(900)
  return browser.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const chip = [...panel.querySelectorAll('span')].find((item) => /^\d+\/\d+$/.test(item.textContent ?? ''))
    const [numerator, denominator] = (chip?.textContent ?? '').split('/')
    return { numerator: Number(numerator), denominator: Number(denominator) }
  })
}

async function presentationSession(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('[role="dialog"]')
    const canvas = document.querySelector('[data-slide-canvas]')
    const stage = canvas?.parentElement?.getBoundingClientRect()
    const box = canvas?.getBoundingClientRect()
    const follow = [...(panel?.querySelectorAll('[data-presentation-chrome] button') ?? [])]
      .find((item) => /跟随|冻结|Follow|Freeze/.test(item.getAttribute('aria-label') ?? ''))
    const position = panel?.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
    return {
      open: Boolean(canvas),
      position,
      total: Number.parseInt(position.split('/')[1] ?? '', 10) || 0,
      slides: panel?.querySelectorAll('[data-presentation-rail] [data-slide-index]').length ?? 0,
      followLabel: follow?.getAttribute('aria-label') ?? '',
      inDialog: Boolean(document.activeElement?.closest?.('[role="dialog"]')),
      filled: Boolean(box && stage) && box.height >= stage.height - 1 && box.width >= stage.width - 1,
    }
  })
}

// Presentation controls carry a locale-dependent aria-label; match either locale the
// way the other label helpers in this gate do.
async function clickPresentationControl(page, labels) {
  const clicked = await page.evaluate((options) => {
    const panel = document.querySelector('[role="dialog"]')
    const button = [...(panel?.querySelectorAll('[data-presentation-chrome] button') ?? [])]
      .find((item) => options.includes(item.getAttribute('aria-label')))
    if (!button) return false
    button.click()
    return true
  }, labels)
  if (!clicked) throw new Error(`presentation control missing: ${labels[0]}`)
}

// Each remote edit opens its own slide and ends on a blank line, so it adds exactly
// one page wherever the editor's caret happens to sit when the text arrives — a
// break is honoured both by the note that follows it and the deck that ends there.
const LIVE_EDIT_ONE = '\n\n---\n\n## Editorial addition\n\nAdded from another writer.\n\n'
const LIVE_EDIT_TWO = '\n\n---\n\n## Ignored\n\nWritten after the freeze.\n\n'
// A two-slide deck whose second slide cannot fit one canvas: the show opens on slide 1,
// so slide 2 is the slide the presenter has not reached yet.
const PAGINATED_DECK = [
  '# Short opening',
  '',
  'One page of talk, with a diagram, a chart and math so the slide list has rendered markup to show.',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Source] --> B[Preview]',
  '```',
  '',
  '```chart',
  '{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"Series","data":[3,7,4]}]}}',
  '```',
  '',
  'Inline $E = mc^2$ and a block:',
  '',
  '$$',
  'a^2 + b^2 = c^2',
  '$$',
  '',
  '---',
  '',
  '## Slide that paginates',
  '',
  // One block per paragraph: a soft-wrapped run is a single block, and an oversized
  // block is scaled to fit its page instead of paginating.
  ...Array.from({ length: 28 }, (_, index) => `Paragraph ${index + 1} of a slide that has to paginate.`).flatMap((line) => [line, '']),
].join('\n')

// Writes into the editor while the show is on screen: a presenter never types there
// directly (the overlay covers it), but a live edit arrives from another tab, another
// device, or an MCP write through the same store. CodeMirror is fed a paste event
// rather than execCommand('insertText'): the overlay's focus trap keeps DOM focus in
// the dialog, and a paste inserts at the editor's own cursor instead of relying on it.
async function appendToNote(page, markdown) {
  const appended = await page.evaluate((text) => {
    const content = document.querySelector('.cm-content')
    if (!content) return false
    const data = new DataTransfer()
    data.setData('text/plain', text)
    content.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    return true
  }, markdown)
  if (!appended) throw new Error('appendToNote: the editor is not mounted')
  await sleep(1_200) // autosave debounce, then the show's own follow debounce
}

// A toolbar is one row: expanding a panel inside it must not change its height, or the control that
// was just pressed moves out from under the pointer — the mind map's keyboard reference card used to
// wrap to a second row and grow the full screen toolbar that way. The audit that found that is this
// loop, run rather than written down: every full screen surface is opened the way a person opens it,
// each toggle in its toolbar is pressed once, the toolbar's height and the toggle's own box are
// compared before and after, and the surface is closed again. The mind map overlay is not listed —
// its scenario above asserts the same two things for its one toggle, plus where the card lands — and
// that scenario is also what covers the modal shell, whose only consumer in the full screen variant
// is that overlay. The drawer shell is audited where it exists, at the phone breakpoint.
//
// Each surface also has to arrive with its content: a panel that opened on a failed request keeps a
// header of exactly the same height, so stability alone would read as a pass for a surface nobody can
// use. `loaded` is the smallest thing that only exists once the data is there — and for a surface
// whose content is a picture, the count is of pictures the browser actually decoded.
const LIGHTBOX_MARKDOWN = ['', '![Visual probe](/inkstone-logo.svg)', ''].join('\n')

const TOOLBAR_SURFACES = [
  { name: 'graph', open: (page) => pressCombo(page, ['Control', 'Shift', 'g']), root: '[data-surface="graph"]', toolbar: '[data-surface="graph"] > header', minToggles: 2, loaded: { selector: 'canvas', min: 1 } },
  { name: 'template library', open: (page) => pressCombo(page, ['Control', 'Shift', 'n']), root: '[data-surface="templates"]', toolbar: '[data-surface="templates"] > header', minToggles: 1, loaded: { selector: '[data-template-id]', min: 1 } },
  { name: 'settings', open: (page) => pressCombo(page, ['Control', ',']), root: SETTINGS_PANEL, toolbar: `${SETTINGS_PANEL} header`, minToggles: 0, loaded: { selector: 'nav button', min: 3 } },
  { name: 'command palette', open: (page) => pressCombo(page, ['Control', 'k']), root: PALETTE_PANEL, toolbar: `${PALETTE_PANEL} > div`, minToggles: 0, loaded: { selector: '[role="option"]', min: 1 } },
  // The show's chrome is the one toolbar that floats over its surface instead of sitting at the top
  // of it, and the slide list is one of the four places an expansion is allowed to live: pressing the
  // two toggles is what has to leave the pill the size it was.
  { name: 'presentation', open: openPresentation, root: '[data-surface="presentation"]', toolbar: '[data-presentation-chrome]', minToggles: 2, loaded: { selector: '[data-slide-canvas]', min: 1 } },
  // The lightbox has no toggle (zoom is two plain buttons), so what the sweep can say about it is
  // that it arrives on the picture it was opened for and holds its toolbar: the picture is appended
  // to the note here, at the end of the run, because the deck counts measured above are counts of the
  // note's own markdown.
  { name: 'lightbox', open: openLightbox, root: '[data-surface="lightbox"]', toolbar: '[data-lightbox-toolbar]', minToggles: 0, loaded: { selector: 'img', min: 1, decoded: true } },
  // The outline only lives in the drawer shell at the phone breakpoint, which is where that side
  // panel is part of the shell rather than a column of the split view.
  { name: 'outline drawer', open: openOutlineDrawer, root: '[data-surface="drawer"]', toolbar: '[data-surface="drawer"] header', minToggles: 0, viewport: MOBILE_VIEWPORT, loaded: { selector: '[data-heading-level]', min: 1 } },
]

/** The control a show is started from, pressed where it is drawn: the header is not always on screen. */
async function openPresentation(page) {
  const pressed = await pressVisibleControl(page, /演示模式|Presentation mode/)
  if (!pressed) throw new Error('the presentation surface has no start control on screen')
}

/**
 * The lightbox needs a picture in the note. A same-origin asset is used rather than a remote URL, so
 * the surface is exercised without the run depending on the network, and the failure state is not
 * mistaken for the surface: the click waits until the browser has decoded what it is clicking.
 */
async function openLightbox(page) {
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('lightbox: the editor pane never became visible')
  // The scenarios above leave the cursor wherever they last put it — the mind map one leaves it inside
  // the fence it wrote — so the picture is written at the end of the note instead of at the cursor.
  const written = await page.evaluate((markdown) => {
    const content = document.querySelector('.cm-content')
    if (!content) return false
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    return document.execCommand('insertText', false, markdown)
  }, LIGHTBOX_MARKDOWN)
  if (!written) throw new Error('lightbox: the note could not be edited')
  await sleep(1_200) // autosave debounce
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('lightbox: the preview pane never became visible')
  const picture = await page.waitForSelector('.ink-prose img', { timeout: 30_000 }).then((handle) => handle, () => null)
  if (!picture) throw new Error('lightbox: the note holds no picture for the lightbox to open')
  // The renderer marks images lazy, so one appended past the fold is never fetched until it is looked
  // at; a reader scrolls to it, and so does this.
  await picture.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const rendered = await page.waitForFunction(() => {
    const image = document.querySelector('.ink-prose img')
    return Boolean(image && image.complete && image.naturalWidth > 0)
  }, { timeout: 30_000 }).then(() => true, () => false)
  if (!rendered) throw new Error('lightbox: the picture put into the note never decoded')
  await page.click('.ink-prose img')
}

/** The outline control of the pane on screen, pressed where it is drawn. */
async function openOutlineDrawer(page) {
  await clickButton(page, LABELS.preview)
  await sleep(700)
  const pressed = await pressVisibleControl(page, /大纲|Outline/i, '.mobile-pane-layer[data-active]')
  if (!pressed) throw new Error('the outline drawer has no control on screen')
}

/**
 * Presses the first control matching `label` that is drawn inside `scope` (the whole document by
 * default), with a real pointer click on its centre. Half the shell is mounted but off screen at any
 * breakpoint, and a click on an element nobody can see is not a click a person could have made.
 */
async function pressVisibleControl(page, label, scope = '') {
  const point = await page.evaluate(({ label, flags, scope }) => {
    const pattern = new RegExp(label, flags)
    const root = scope ? document.querySelector(scope) : document
    const control = [...(root?.querySelectorAll('button') ?? [])]
      .find((item) => pattern.test(item.getAttribute('aria-label') ?? ''))
    if (!control) return null
    const box = control.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return null
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { label: label.source, flags: label.flags, scope })
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  return true
}

/** One toggle's row, read from the toolbar it sits in: where it is, and whether it is still inside. */
async function readToggle(page, toolbar, index) {
  return page.evaluate(({ toolbar, index }) => {
    const bar = document.querySelector(toolbar)
    const toggle = bar?.querySelectorAll('button[aria-pressed], button[aria-expanded]')[index]
    if (!bar || !toggle) return null
    const barBox = bar.getBoundingClientRect()
    const box = toggle.getBoundingClientRect()
    return {
      height: Math.round(barBox.height),
      top: Math.round(box.top),
      left: Math.round(box.left),
      inside: box.top >= barBox.top - 1 && box.bottom <= barBox.bottom + 1,
      label: (toggle.getAttribute('aria-label') || toggle.textContent.trim()).slice(0, 24),
    }
  }, { toolbar, index })
}

/** Presses one toolbar toggle the way a person does: a real pointer click on the control's centre. */
async function clickToggle(page, toolbar, index) {
  const point = await page.evaluate(({ toolbar, index }) => {
    const toggle = document.querySelector(toolbar)?.querySelectorAll('button[aria-pressed], button[aria-expanded]')[index]
    if (!toggle) return null
    const box = toggle.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { toolbar, index })
  if (!point) return
  await page.mouse.click(point.x, point.y)
}

/**
 * A toolbar control can open a portaled popover or menu rather than anything inside the toolbar, and
 * those close on their own terms: the palette's tag filter only ever opens, so a second press leaves
 * it up. Escape is what a person reaches for, and it closes those layers one at a time, so the sweep
 * dismisses them before the next toggle instead of assuming a control toggles.
 */
async function dismissTransientLayers(page, root) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const layers = await page.evaluate((selector) => [...document.querySelectorAll('[role="dialog"], [role="menu"]')]
      .filter((element) => !element.matches(selector) && !element.closest(selector)).length, root)
    if (layers === 0) return
    await page.keyboard.press('Escape')
    await sleep(240)
  }
}

/**
 * Presses every toggle in one toolbar and reports what the toolbar and the toggle itself did.
 *
 * The height is the assertion the mind map's reference card failed; "inside" is its sibling, for a
 * control that stays in the toolbar but wraps to a row of its own. A sideways move is recorded and
 * not failed: the graph's scope buttons sit after a count that changes width with the data, so a
 * legitimate repaint moves them without the toolbar growing.
 */
async function sweepToolbar(page, surface) {
  const bar = await page.evaluate((selector) => {
    const element = document.querySelector(selector)
    if (!element) return null
    return {
      height: Math.round(element.getBoundingClientRect().height),
      toggles: element.querySelectorAll('button[aria-pressed], button[aria-expanded]').length,
    }
  }, surface.toolbar)
  if (!bar) throw new Error(`toolbar sweep: the ${surface.name} has no toolbar matching ${surface.toolbar}`)
  let growth = 0
  let rowShift = 0
  let sideways = 0
  let outside = 0
  const labels = []
  for (let index = 0; index < bar.toggles; index += 1) {
    const before = await readToggle(page, surface.toolbar, index)
    await clickToggle(page, surface.toolbar, index)
    await sleep(320)
    const after = await readToggle(page, surface.toolbar, index)
    if (!before || !after) {
      outside += 1
      labels.push(`${before?.label ?? index}:gone`)
      continue
    }
    growth = Math.max(growth, after.height - before.height)
    rowShift = Math.max(rowShift, Math.abs(after.top - before.top))
    sideways = Math.max(sideways, Math.abs(after.left - before.left))
    if (!after.inside) outside += 1
    labels.push(`${after.label}:${after.height - before.height}/${after.top - before.top}/${after.left - before.left}`)
    await dismissTransientLayers(page, surface.root)
  }
  return { height: bar.height, toggles: bar.toggles, growth, rowShift, sideways, outside, labels: labels.join(', ') }
}

async function assertFullscreenToolbars(page) {
  // The hotkeys below are the app's own, and half of them are refused while a text field has the
  // keyboard: each surface starts from no focus at all rather than from wherever the last scenario
  // left it. The window is part of the surface — the outline is a drawer at phone width — so the
  // entry says which one it is audited in, and the desktop width comes back between them.
  for (const surface of TOOLBAR_SURFACES) {
    await page.setViewport(surface.viewport ?? DESKTOP_VIEWPORT)
    await sleep(500)
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await sleep(300)
    await surface.open(page)
    await page.waitForSelector(surface.root, { timeout: 15_000 })
    await waitForPanelSettled(page, surface.root)
    await sleep(400)
    const loaded = await page.evaluate(({ root, selector, decoded }) => {
      const scope = document.querySelector(root)
      const found = scope ? [...scope.querySelectorAll(selector)] : []
      const settled = decoded ? found.filter((element) => element.complete && element.naturalWidth > 0) : found
      return { count: found.length, settled: settled.length, selector }
    }, { root: surface.root, selector: surface.loaded.selector, decoded: Boolean(surface.loaded.decoded) })
    check(`toolbar stability: the ${surface.name} opened with its content, not an error state`, loaded.count >= surface.loaded.min && loaded.settled >= surface.loaded.min, JSON.stringify(loaded))
    const result = await sweepToolbar(page, surface)
    check(`toolbar stability: the ${surface.name} toolbar holds its height`, result.growth === 0, JSON.stringify(result))
    check(`toolbar stability: the ${surface.name} toggles stay on the toolbar row`, result.rowShift === 0 && result.outside === 0, JSON.stringify(result))
    // A surface with no toggle is still counted: the sweep says it found none rather than passing
    // silently over a control it did not recognize.
    check(`toolbar stability: the ${surface.name} toolbar exercised its toggles`, result.toggles >= surface.minToggles, JSON.stringify(result))
    // The sweep's own presses can leave the surface in a mode of its own — the template library is
    // still selecting — so the count is reported rather than pinned to one press; what has to hold is
    // that Escape gets out.
    let escapes = 0
    let closed = false
    while (!closed && escapes < 3) {
      escapes += 1
      await page.keyboard.press('Escape')
      closed = await page.waitForFunction((root) => !document.querySelector(root), { timeout: 5_000 }, surface.root).then(() => true, () => false)
      if (!closed) await sleep(240)
    }
    check(`toolbar stability: the ${surface.name} closes with escape`, closed, `escapes=${escapes}`)
  }
  // The drawer's entry is the one that changed the window: the run leaves the app as it found it.
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(300)
}

async function main() {
  console.log(`visual e2e against ${BASE}`)
  const browser = await puppeteer.launch({
    executablePath: chromeExecutablePath(),
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const consoleErrors = []
  try {
    const page = await browser.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', (error) => consoleErrors.push(String(error)))

    await page.setViewport(MOBILE_VIEWPORT)
    await page.goto(BASE, { waitUntil: 'networkidle2' })

    // The sign-in helper also clears the owner's update prompt; every scenario below starts clicking
    // straight away, and the prompt's scrim would swallow the first of those clicks.
    await loginThroughUi(page, { username: USERNAME, password: PASSWORD })
    check('bootstrap: authenticated', true)
    const blocking = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? null)
    check('bootstrap: no dialog is holding the app', blocking === null, `dialog: ${blocking}`)

    await typeProbeNote(page)
    await assertProseSurface(page, 'mobile-preview')
    await assertPaneTransition(page)
    await assertDesktopSplit(page)
    await assertPresentation(page)
    await assertPresentationSession(page)
    await assertPresentationPages(page)
    await assertPresentationAccessibility(page)
    await assertDeckExport(page)
    await assertDeckImageExport(page)
    await assertMindmapBlock(page)
    await assertMindmapSplitEditing(page)
    await assertFullscreenToolbars(page)

    // Demo backend intentionally logs a 401 for the logged-out ping; only
    // render-breaking errors matter here.
    //
    // One library artifact is allowed by message: a mind map mounts into whatever pane the layout
    // gives it, and the edit-only layout keeps the preview hidden, so the library's first paint
    // measures a zero-sized box and draws link paths with NaN coordinates — which Chrome reports as
    // an error on the path element. Nothing is visibly wrong (the block is re-fitted by its
    // container watcher the moment the pane has a box — lib/markdown/mindmap/resize.ts), the map is
    // drawn again from real numbers, and this run asserts that drawing below. Every other page
    // error, including any other malformed path, still fails the gate.
    const ALLOWED_PAGE_ERRORS = [
      /Failed to load resource.*(401|403|404)/,
      /attribute d: Expected number, "M NaN/,
    ]
    const fatal = consoleErrors.filter((text) => !ALLOWED_PAGE_ERRORS.some((allowed) => allowed.test(text)))
    check('console: no page errors', fatal.length === 0, JSON.stringify(fatal.slice(0, 3)))
  } finally {
    await browser.close()
  }

  console.log(`visual e2e: ${pass} passed, ${fail} failed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(`visual e2e crashed: ${error.message}`)
  process.exit(1)
})
