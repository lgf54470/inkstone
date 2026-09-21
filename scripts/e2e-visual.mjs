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
  slidesPrint: ['打印 / PDF', 'Print / PDF'],
  slidesDuplicate: ['再复制一个', 'Duplicate'],
  presentRail: ['显示幻灯片列表', '隐藏幻灯片列表', 'Show slides', 'Hide slides'],
  presentFreeze: ['冻结当前快照', 'Freeze this snapshot'],
  presentFollow: ['跟随笔记更新', 'Follow the note'],
  outline: ['大纲', 'Outline', 'outline'],
  insert: ['插入', 'Insert'],
  mindMap: ['思维导图', 'Mind map'],
  mindMapOutline: ['大纲思维导图', 'Outline Mind Map'],
  musicHub: ['音乐库', 'Music library'],
  musicOpenHub: ['打开音乐库', 'Open music library'],
  musicHubNavigation: ['音乐导航', 'Music navigation'],
  musicHubOpenNavigation: ['打开音乐导航', 'Open music navigation'],
  musicExpandPlayer: ['展开播放器', 'Expand the player'],
  musicAddToQueue: ['添加到队列', 'Add to queue'],
  musicGridView: ['网格视图', 'Grid view'],
  musicListView: ['列表视图', 'List view'],
  musicFavorite: ['收藏', 'Add to favorites'],
  musicMoreActions: ['更多操作', 'More actions'],
  musicQueue: ['播放队列', 'Play queue'],
  musicRemoveFromQueue: ['从队列移除', 'Remove from the queue'],
  musicMiniPlayer: ['浮动播放器', 'Floating player'],
  musicMobileNav: ['手机端导航', 'Mobile navigation'],
  musicImmersive: ['沉浸式播放', 'Full screen player'],
  musicLyrics: ['歌词', 'Lyrics'],
  shareView: ['分享', 'Share'],
  shareHub: ['分享中心', 'Share Hub'],
  shareManage: ['管理所有分享', 'Manage All Shares'],
  shareKpi: ['总访问量 (PV)', 'Total Views (PV)'],
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
  // axe measures what is painted, and two things in this overlay paint at less than full opacity for
  // a moment: the dialog's own entrance animation, and the control pill, which fades itself out while
  // the show sits idle. A counter read mid-fade composites towards the page under it and comes back
  // as a 1.08:1 violation that no token can explain. The pointer brings the pill back and both waits
  // hold until the painted opacity is 1, rather than until the elements merely exist.
  const viewport = page.viewport() ?? DESKTOP_VIEWPORT
  await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2))
  await waitForPanelSettled(page, '[role="dialog"]')
  await waitForPanelSettled(page, '[data-presentation-chrome]')
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

/** The palettes the header menu offers, by the names a fence stores. */
const MINDMAP_PALETTES = {
  auto: ['Follow the app', '跟随应用'],
  light: ['Light', '浅色'],
  dark: ['Dark', '深色'],
}

/**
 * Opens the block header's palette menu and picks a palette. The pick is waited for on the block's
 * own attribute, which the renderer emits from the fence: the preview is re-rendered from the note's
 * committed text, so seeing it there means the pick reached the note and not merely the map. The
 * menu is read before the pick, and the map after it, against the canvas the scenario started with —
 * the same element across a pick is what separates a repaint from a rebuild.
 */
async function pickMindmapPalette(page, palette) {
  await page.click('.ink-prose .mindmap-block [data-mindmap-theme-pick]')
  await page.waitForSelector('[role="menu"] [role="menuitemcheckbox"]', { timeout: 15_000 })
  // The Menu appends its check glyph to the selected row's label, so the rows are read without it.
  const menu = await page.evaluate((wanted) => {
    const items = [...document.querySelectorAll('[role="menu"] [role="menuitemcheckbox"]')]
    const labelOf = (element) => (element.textContent ?? '').replace('✓', '').trim()
    const labels = items.map(labelOf)
    const target = items.find((element) => wanted.includes(labelOf(element)))
    target?.click()
    return {
      labels,
      checked: labels.filter((_, index) => items[index].getAttribute('aria-checked') === 'true'),
      clicked: Boolean(target),
    }
  }, MINDMAP_PALETTES[palette])
  if (!menu.clicked) throw new Error(`the palette menu has no ${palette} entry`)
  await page.waitForFunction(
    (wanted) => (document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null) === wanted,
    { timeout: 15_000 },
    palette === 'auto' ? null : palette,
  )
  await sleep(600)
  const choice = await page.evaluate(() => ({
    control: document.querySelector('.ink-prose .mindmap-block [data-mindmap-theme-pick]')?.textContent?.trim() ?? '',
    annotation: document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null,
  }))
  return { menu, ...choice, theme: await readMindmapTheme(page) }
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

  // The header's palette control, end to end: it states the palette the fence asks for, a pick is
  // written into that same fence and painted on the instance already on screen, and picking the app
  // palette clears the statement again. The scenario leaves the fence following the app, because the
  // theme-follow step at the end of it measures exactly that. The custom entry is absent here on
  // purpose — this fence is an outline, which has no field to carry a theme object.
  const initial = await page.evaluate(() => ({
    control: document.querySelector('.ink-prose .mindmap-block [data-mindmap-theme-pick]')?.textContent?.trim() ?? '',
    annotation: document.querySelector('.ink-prose .mindmap-block')?.getAttribute('data-mindmap-theme') ?? null,
  }))
  check(
    'mindmap: the header names the palette the map draws with',
    MINDMAP_PALETTES.auto.includes(initial.control) && initial.annotation === null,
    JSON.stringify(initial),
  )
  const pickedLight = await pickMindmapPalette(page, 'light')
  check('mindmap: the palette menu offers the app palette, light and dark', pickedLight.menu.labels.length === 3, JSON.stringify(pickedLight.menu))
  check(
    'mindmap: the palette menu marks the palette the fence states',
    pickedLight.menu.checked.length === 1 && MINDMAP_PALETTES.auto.includes(pickedLight.menu.checked[0]),
    JSON.stringify(pickedLight.menu),
  )
  check(
    'mindmap: a pick is written into the fence and named by the control',
    pickedLight.annotation === 'light' && MINDMAP_PALETTES.light.includes(pickedLight.control),
    JSON.stringify(pickedLight),
  )
  const pickedDark = await pickMindmapPalette(page, 'dark')
  check(
    'mindmap: the picked palette repaints the live map without rebuilding it',
    pickedDark.annotation === 'dark' && pickedDark.theme.sameElement
    && pickedDark.theme.root.length > 0 && pickedDark.theme.root !== pickedLight.theme.root,
    `light=${JSON.stringify(pickedLight.theme)} dark=${JSON.stringify(pickedDark.theme)}`,
  )
  const pickedAuto = await pickMindmapPalette(page, 'auto')
  check(
    'mindmap: picking the app palette clears the fence statement again',
    pickedAuto.annotation === null && pickedAuto.theme.sameElement && MINDMAP_PALETTES.auto.includes(pickedAuto.control),
    JSON.stringify(pickedAuto),
  )
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

// A block's body as the document itself holds it, decoded from the block's own attribute. The editor
// is not a stable place to read it from: CodeMirror renders only the lines in view, so its text
// depends on where the caret and the scroll happen to be. The preview always carries the body the
// note was last committed with, which is exactly what these assertions are about. Every block
// encodes its body the same way (lib/markdown/data-attr.ts), so one reader serves them all.
function readBlockBody({ scope, block, attribute }) {
  const encoded = document.querySelector(`${scope} ${block}`)?.getAttribute(attribute) ?? ''
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
  return page.evaluate(readBlockBody, { scope, block: '.mindmap-block[data-mindmap]', attribute: 'data-mindmap' })
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
//
// Every surface is also opened from a control the sweep marks, because two more things are asserted
// on the way out: Escape closes it, and the control that opened it has the focus again. Opening by
// shortcut is one of those paths — the app hands focus back to whatever held it when the panel
// opened — so the entry names the control the shortcut is pressed with, and the assertion names the
// same element either way. `opener.labels` are the accessible names the control goes by in both
// locales; `focus` marks the shortcut path.
const LIGHTBOX_MARKDOWN = ['', '![Visual probe](/inkstone-logo.svg)', ''].join('\n')

const TOOLBAR_SURFACES = [
  // The graph has no button of its own at this width: its entry point is the account menu, which
  // unmounts on the way to the panel, so a person reaches it by shortcut. The sidebar's account
  // control is what holds the keyboard while that shortcut runs, and that is the element focus has to
  // come back to.
  { name: 'graph', open: (page) => pressOpener(page, { labels: ['设置', 'Settings'], combo: ['Control', 'Shift', 'g'] }), root: '[data-surface="graph"]', toolbar: '[data-surface="graph"] > header', minToggles: 2, loaded: { selector: 'canvas', min: 1 } },
  { name: 'template library', open: (page) => pressOpener(page, { labels: ['从模板新建笔记', 'New note from template'] }), root: '[data-surface="templates"]', toolbar: '[data-surface="templates"] > header', minToggles: 1, loaded: { selector: '[data-template-id]', min: 1 } },
  { name: 'settings', open: (page) => pressOpener(page, { labels: ['设置', 'Settings'] }), root: SETTINGS_PANEL, toolbar: `${SETTINGS_PANEL} header`, minToggles: 0, loaded: { selector: 'nav button', min: 3 } },
  { name: 'command palette', open: (page) => pressOpener(page, { labels: ['搜索笔记、执行命令', 'Search notes or run a command'] }), root: PALETTE_PANEL, toolbar: `${PALETTE_PANEL} > div`, minToggles: 0, loaded: { selector: '[role="option"]', min: 1 } },
  // The show's chrome is the one toolbar that floats over its surface instead of sitting at the top
  // of it, and the slide list is one of the four places an expansion is allowed to live: pressing the
  // two toggles is what has to leave the pill the size it was.
  { name: 'presentation', open: (page) => pressOpener(page, { labels: ['演示模式', 'Presentation mode'] }), root: '[data-surface="presentation"]', toolbar: '[data-presentation-chrome]', minToggles: 2, loaded: { selector: '[data-slide-canvas]', min: 1 } },
  // The lightbox has no toggle (zoom is two plain buttons), so what the sweep can say about it is
  // that it arrives on the picture it was opened for and holds its toolbar: the picture is appended
  // to the note here, at the end of the run, because the deck counts measured above are counts of the
  // note's own markdown. What opens it is the button the preview puts around a prose image, and that
  // button is also where focus has to land again — a bare image could not hold it.
  { name: 'lightbox', open: openLightbox, root: '[data-surface="lightbox"]', toolbar: '[data-lightbox-toolbar]', minToggles: 0, loaded: { selector: 'img', min: 1, decoded: true } },
  // The outline only lives in the drawer shell at the phone breakpoint, which is where that side
  // panel is part of the shell rather than a column of the split view.
  { name: 'outline drawer', open: openOutlineDrawer, root: '[data-surface="drawer"]', toolbar: '[data-surface="drawer"] header', minToggles: 0, viewport: MOBILE_VIEWPORT, loaded: { selector: '[data-heading-level]', min: 1 } },
  // The slides editor is reached from a block in the note rather than from a control in the shell,
  // and its toolbar is the editor's own top bar. Two of its controls disclose panels that hang
  // under that bar, which is exactly what the sweep holds to its size: a panel drawn as a row of
  // the header would push the control that opened it out from under the pointer.
  { name: 'slides editor', open: openSlidesEditor, root: '.bento-slides-fullscreen', toolbar: '.bento-slides-fullscreen header', minToggles: 2, loaded: { selector: '.bento-canvas-stage [data-slide-element]', min: 3 } },
]

/**
 * Writes markdown at the end of the note and waits for it to reach the note source. The scenarios
 * that append to the probe note do it here rather than at the cursor because the cursor is wherever
 * the last scenario left it — the mind map one leaves it inside the fence it wrote — and a block
 * typed into the middle of someone else's markdown is not what the reader is being simulated doing.
 */
async function writeAtEndOfNote(page, markdown, scenario) {
  const written = await page.evaluate((text) => {
    const content = document.querySelector('.cm-content')
    if (!content) return false
    content.focus()
    const selection = window.getSelection()
    selection.selectAllChildren(content)
    selection.collapseToEnd()
    return document.execCommand('insertText', false, text)
  }, markdown)
  if (!written) throw new Error(`${scenario}: the note could not be edited`)
  await sleep(1_200) // autosave debounce
}

/**
 * The lightbox needs a picture in the note. A same-origin asset is used rather than a remote URL, so
 * the surface is exercised without the run depending on the network, and the failure state is not
 * mistaken for the surface: the click waits until the browser has decoded what it is clicking.
 */
async function openLightbox(page) {
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('lightbox: the editor pane never became visible')
  await writeAtEndOfNote(page, LIGHTBOX_MARKDOWN, 'lightbox')
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
  await pressOpener(page, { labels: ['图片预览', 'Image preview'] })
}

/**
 * The deck's own card in the note is what opens the editor, so the sweep waits for it to be drawn
 * with its elements before pressing the control: a block that failed to parse offers a full screen
 * control over nothing, and the sweep would then read an empty surface as a stable one.
 */
async function openSlidesEditor(page) {
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')
  // The sweep runs after scenarios that write the note, so the deck may no longer be in it: the
  // surface is reached by putting one there rather than by assuming an earlier scenario left one
  // behind, which is also what keeps this entry runnable on its own.
  if (!(await slidesDeckOnScreen(page))) {
    await ensurePaneVisible(page, '.cm-content')
    await writeAtEndOfNote(page, SLIDES_FENCE, 'slides editor')
    if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')
  }
  const card = await page.waitForFunction(() => {
    const box = document.querySelector('.ink-prose [data-bento-slides] [data-slide-element]')
    return Boolean(box && box.getClientRects().length > 0)
  }, { timeout: 20_000 }).then(() => true, () => false)
  if (!card) throw new Error('slides editor: the note holds no deck for the sweep to open')
  await pressOpener(page, { labels: ['全屏', 'Full screen'], scope: '.ink-prose [data-bento-slides]' })
}

/** Whether the note on screen already draws a deck, which is what its full screen control needs. */
async function slidesDeckOnScreen(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.ink-prose [data-bento-slides] [data-slide-element]')
    return Boolean(box && box.getClientRects().length > 0)
  })
}

/** The outline control of the pane on screen, pressed where it is drawn. */
async function openOutlineDrawer(page) {
  await clickButton(page, LABELS.preview)
  await sleep(700)
  await pressOpener(page, { labels: ['大纲', 'outline'], scope: '.mobile-pane-layer[data-active]' })
}

/**
 * Presses the control one surface is opened from, and marks it so the assertion after Escape can
 * say whether focus came back. A real pointer click is how a person presses a control that is drawn;
 * when the surface is reached by shortcut instead, the marked control takes the keyboard first and
 * the combo is pressed the way the app's own hotkey map reads it. Marks from earlier surfaces are
 * cleared, so the element the assertion finds is always this surface's opener.
 */
async function pressOpener(page, { labels, combo = null, scope = '' }) {
  const point = await page.evaluate(({ labels, scope }) => {
    for (const marked of document.querySelectorAll('[data-gate-opener]')) delete marked.dataset.gateOpener
    const root = scope ? document.querySelector(scope) : document
    const control = [...(root?.querySelectorAll('button') ?? [])]
      .find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
    if (!control) return null
    // A control further down a long note is off screen, and a press is a real pointer click at a
    // measured point: it has to be brought into view first, or it lands on whatever is at those
    // coordinates — which is how a card at the end of the probe note read as a dead control.
    control.scrollIntoView({ block: 'center' })
    const box = control.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return null
    control.dataset.gateOpener = '1'
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { labels, scope })
  if (!point) throw new Error(`the sweep found no control named ${labels.join(' / ')} to open a surface from`)
  if (combo) {
    await page.evaluate(() => document.querySelector('[data-gate-opener]')?.focus())
    await pressCombo(page, combo)
    return
  }
  await page.mouse.click(point.x, point.y)
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

/**
 * A deck whose three cards share one row: 100 wide, 40 between the first pair and 44 between the
 * second, so the even spacing the drag below lands on is 42. Written as a JSON body, which is the
 * one form the fence takes where every coordinate is stated rather than parsed out of an outline.
 */
const SLIDES_FENCE = [
  '',
  '```bento-slides',
  JSON.stringify(
    {
      title: 'Gate deck',
      slides: [
        {
          id: 'gate-slide',
          elements: [100, 240, 384].map((x, index) => ({
            id: ['gate-a', 'gate-b', 'gate-c'][index],
            type: 'text',
            html: `Card ${index + 1}`,
            fontSize: 24,
            x,
            y: 100,
            w: 100,
            h: 100,
          })),
        },
      ],
    },
    null,
    2,
  ),
  '```',
  '',
].join('\n')

/**
 * What the page looked like when the card's control did not open the editor: whether the control the
 * sweep marked is still on screen, how many preview roots are mounted, and whether any of them is
 * the mounted copy — the block hands a session back only from the pane that mounted it, and the
 * split draws its markup twice.
 */
async function slidesOpenProbe(page) {
  return page.evaluate(() => {
    const opener = document.querySelector('[data-gate-opener]')
    const rect = opener?.getBoundingClientRect()
    const block = opener?.closest('[data-bento-slides],[data-mindmap],[data-excalidraw],[data-kanban]')
    return {
      opener: opener ? { label: opener.getAttribute('aria-label'), onScreen: Boolean(rect && rect.width > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight), top: rect ? Math.round(rect.top) : null } : null,
      // Which block the marked control belonged to, since every rich block names its own.
      openerBlock: block ? [...block.attributes].map((attribute) => attribute.name).filter((name) => name.startsWith('data-')).join(',') : null,
      viewport: window.innerHeight,
      previewRoots: [...document.querySelectorAll('.ink-prose')].map((root) => ({
        rects: root.getClientRects().length,
        blocks: root.querySelectorAll('[data-bento-slides]').length,
        ready: root.querySelectorAll('[data-bento-slides].is-ready').length,
      })),
      editors: document.querySelectorAll('.cm-content').length,
      activeLayers: [...document.querySelectorAll('.mobile-pane-layer')].filter((layer) => layer.hasAttribute('data-active')).length,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((dialog) => dialog.getAttribute('aria-label') ?? dialog.className.toString().slice(0, 40)),
      // What the press actually met: a control can be on screen and still be under something.
      hit: rect
        ? (() => {
          const met = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return met ? `${met.tagName.toLowerCase()}[${met.getAttribute('class')?.slice(0, 30) ?? ''}]` : 'nothing'
        })()
        : null,
    }
  })
}

/** The percentage the slides stage is drawn at, read off the corner cluster's own label. */
async function readSlidesZoom(page) {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll('.bento-slides-fullscreen button')]
      .map((button) => button.textContent.trim())
      .find((text) => /^\d+%$/.test(text))
    return label ? Number.parseInt(label, 10) : null
  })
}

/** The deck the note was last committed with, read off the block rather than out of the editor. */
async function readSlidesSource(page) {
  return page.evaluate(readBlockBody, { scope: '.ink-prose', block: '[data-bento-slides]', attribute: 'data-bento-slides' })
}

/** The write back into the fence is debounced and the preview re-renders after it, so this waits. */
async function waitForSlidesSource(page, settled, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let body = await readSlidesSource(page)
  while (!settled(body) && Date.now() < deadline) {
    await sleep(200)
    body = await readSlidesSource(page)
  }
  return body
}

/** Where the second card of the deck stands in the committed deck, as its own x. */
const SLIDES_LANDED = /"x"\s*:\s*242/

/** How many boxes the page holds, which is what an edit through the menu shows up as. */
async function slidesElementCount(page) {
  return page.evaluate(() => document.querySelectorAll('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element]').length)
}

/** The centre of one row of the editor's own menu, addressed by the text it carries. */
async function menuRowCentre(page, labels) {
  return page.evaluate((wanted) => {
    const row = [...document.querySelectorAll('[role="menu"] button')]
      .find((candidate) => wanted.includes(candidate.textContent.trim()))
    if (!row) return null
    const box = row.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, labels)
}

/** Where an element box is on screen, in page pixels of the editor's own stage. */
async function slidesElementCentre(page, id) {
  return page.evaluate((elementId) => {
    const box = document.querySelector(`.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="${elementId}"]`)
    const rect = box?.getBoundingClientRect()
    if (!rect || rect.width < 1) return null
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }, id)
}

/**
 * The slides editor is where a deck is edited, and it is the one surface in this gate that edits a
 * *document* rather than a setting: its rail, stage and inspector are drawn from the deck's own
 * tokens, its stage scrolls under the page, and an edit is committed back into the fence it came
 * from. So the scenario opens it the way a person does — the block card's own full screen control —
 * and then drives the three gestures that have no API-level equivalent: dragging an element onto the
 * even spacing its row already shares, fitting the page to the stage, and panning the stage with
 * Space held while the page stays exactly where it was.
 *
 * The a11y pass belongs to this surface for the same reason the mind map's does: it is a full
 * screen overlay nobody reaches by keyboard alone, and a missing role or an unnamed control in it
 * goes unnoticed by eye.
 */
async function assertSlidesEditor(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('slides editor: the editor pane never became visible')
  await writeAtEndOfNote(page, SLIDES_FENCE, 'slides editor')
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('slides editor: the preview pane never became visible')

  // The card has to arrive before its control is pressed: the block renders one slide with the real
  // element boxes, so a card that failed to parse would offer a full screen control over nothing.
  const card = await page.waitForFunction(() => {
    const box = document.querySelector('.ink-prose [data-slide-element="gate-b"]')
    return Boolean(box && box.getClientRects().length > 0)
  }, { timeout: 20_000 }).then(() => true, () => false)
  check('slides editor: the deck card renders the page it was given', card)

  // The control is pressed inside the deck's own block, not across the preview pane: every rich
  // block in the note carries a full screen control under the same name, and the mind map's sits
  // ahead of this one in the document — a scene-wide search opens the map instead of the deck.
  // Only the preview's copy is mounted, which is where a reader's pointer would be anyway.
  await pressOpener(page, { labels: ['全屏', 'Full screen'], scope: '.ink-prose [data-bento-slides]' })
  const surfaced = await page
    .waitForFunction(() => Boolean(document.querySelector('.bento-slides-fullscreen')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('slides editor: the block card opens the editor', surfaced, JSON.stringify(await slidesOpenProbe(page)))
  if (!surfaced) return
  await waitForPanelSettled(page, '.bento-slides-fullscreen')
  await sleep(400)
  const ready = await page.evaluate(() => ({
    elements: document.querySelectorAll('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element]').length,
    zoom: [...document.querySelectorAll('.bento-slides-fullscreen button')]
      .map((button) => button.textContent.trim())
      .find((text) => /^\d+%$/.test(text)) ?? '',
  }))
  check('slides editor: it opens on the deck with every element drawn', ready.elements >= 3, JSON.stringify(ready))
  // The zoom is what turns a distance on screen into a distance on the page, and every gesture
  // below is driven with the mouse: a drag is measured in the deck's own pixels.
  const scale = (Number.parseInt(ready.zoom, 10) || 100) / 100

  // The row's even spacing, dragged live: three pixels to the right is 43 and 41 apart, inside the
  // threshold, so the drag lands on 42 either side and the two widths are written on the page while
  // the pointer is still down.
  const middle = await slidesElementCentre(page, 'gate-b')
  if (!middle) throw new Error('slides editor: the middle card of the row is not on screen')
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 3 * scale, middle.y, { steps: 4 })
  await sleep(200)
  const gaps = await page.evaluate(() => [...document.querySelectorAll('.bento-slides-fullscreen [data-slide-gap-size]')]
    .map((badge) => badge.textContent.trim()))
  await page.mouse.up()
  check('slides editor: an even gap is written on the page while the drag runs', gaps.length === 2 && gaps.every((gap) => gap === '42'), JSON.stringify(gaps))
  // The write back into the fence is debounced, and the preview carries the body the note was last
  // committed with — so this waits for the edit to arrive there rather than for the clock.
  const committed = await waitForSlidesSource(page, (body) => SLIDES_LANDED.test(body))
  const landed = await page.evaluate(() => ({
    left: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="gate-b"]')?.style.left ?? '',
  }))
  check('slides editor: the drag lands the card on the equal gaps and reaches the note source', landed.left === '242px' && SLIDES_LANDED.test(committed), `${JSON.stringify(landed)} committed=${SLIDES_LANDED.test(committed)}`)

  // The other half of a guide: an edge that reaches another box rather than the page's own lines.
  // The first card is dragged down onto the row's bottom edge — 44 page pixels, so its top edge
  // reaches 150 — and the line it stops on is drawn while the pointer is down and goes the moment
  // the pointer is let go.
  const first = await slidesElementCentre(page, 'gate-a')
  if (!first) throw new Error('slides editor: the first card of the row is not on screen')
  await page.mouse.move(first.x, first.y)
  await page.mouse.down()
  await page.mouse.move(first.x, first.y + 44 * scale, { steps: 6 })
  await sleep(200)
  const lines = await page.evaluate(() => [...document.querySelectorAll('.bento-slides-fullscreen [data-slide-guide]')]
    .filter((guide) => !guide.hasAttribute('data-slide-gap'))
    .map((guide) => guide.getAttribute('data-slide-guide')))
  await page.mouse.up()
  await sleep(300)
  const dropped = await page.evaluate(() => ({
    top: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage [data-slide-element="gate-a"]')?.style.top ?? '',
    guides: document.querySelectorAll('.bento-slides-fullscreen [data-slide-guide]').length,
  }))
  check('slides editor: an edge that reaches another box draws its line while the drag runs', lines.includes('y'), JSON.stringify(lines))
  check('slides editor: the drag lands on that line and the line goes with the pointer', dropped.top === '150px' && dropped.guides === 0, JSON.stringify(dropped))

  // The a11y pass runs on the panel as a reader leaves it: with nothing selected, because the
  // selection frame and its handles sit over the box they belong to, and axe can then neither read
  // the text under them nor the background behind it — which it reports as a review item rather
  // than a violation, so a selected box would quietly take its own text out of the pass. A press on
  // the page where nothing is drawn is what clears the selection, and the point is taken from the
  // part of the page that is on screen rather than from the page's far corner.
  const empty = await page.evaluate(() => {
    const canvas = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage .bento-slide-shadow')?.getBoundingClientRect()
    const stage = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage')?.getBoundingClientRect()
    if (!canvas || !stage) return null
    const left = Math.max(canvas.left, stage.left)
    const top = Math.max(canvas.top, stage.top)
    const right = Math.min(canvas.right, stage.right)
    const bottom = Math.min(canvas.bottom, stage.bottom)
    // Every box of this deck sits in the top left of the page, so its bottom left corner is empty.
    return right - 40 > left && bottom - 40 > top ? { x: Math.round(left + 40), y: Math.round(bottom - 40) } : null
  })
  if (empty) await page.mouse.click(empty.x, empty.y)
  await sleep(300)

  await ensureAxe(page)
  const report = await runAxe(page, '.bento-slides-fullscreen')
  check('a11y: the slides editor has no axe violations', report.violations.length === 0, JSON.stringify(report.violations.slice(0, 3)))
  // The deck paints its own colours — the page and the boxes in it are the author's theme, not the
  // app's tokens — so axe cannot judge the text on them and hands the call to a reviewer. What was
  // measured rather than assumed: the stack of elements at that text is the text itself, and hiding
  // the editor's two side columns makes the item disappear, so nothing of the editor's is over it.
  // The allowance is counted and located, not waved through: every item has to name a box on the page,
  // and there can be at most one per box — so a review item on anything that is not a box, or on the
  // editor's own chrome, still fails. How many of the boxes axe declines to judge is not pinned: it
  // depends on which text it can resolve a background for, and the drags above move the boxes over
  // each other, so the count is bounded by the deck rather than fixed at it.
  const deckCanvas = report.incomplete.filter((item) => item.id === 'color-contrast' && /overlapped by another element/.test(item.note))
  const unexpected = report.incomplete.filter((item) => !isReviewedIncomplete(item) && !deckCanvas.includes(item))
  const onBoxes = deckCanvas.every((item) => Boolean(item.box))
  check('a11y: no unexpected axe review items in the slides editor', unexpected.length === 0, JSON.stringify(unexpected))
  check(
    'a11y: every axe review item in the slides editor is text on one of the deck\'s own boxes',
    deckCanvas.length >= 1 && deckCanvas.length <= ready.elements && onBoxes,
    `canvas=${deckCanvas.length} boxes=${ready.elements} onBoxes=${onBoxes} found=${JSON.stringify(deckCanvas.map((item) => item.box))}`,
  )
  check('a11y: axe inspected the slides editor', report.passes >= 10, `passes=${report.passes}`)

  // The menu belongs to this editor and to nothing else, and a row that cannot reach the document
  // would read as a live menu that edits nothing: the last card is duplicated from it — one more
  // box on the page — and then taken back with the editor's own undo.
  const last = await slidesElementCentre(page, 'gate-c')
  if (!last) throw new Error('slides editor: the last card of the row is not on screen')
  await page.mouse.click(last.x, last.y, { button: 'right' })
  const opened = await page.waitForSelector('[role="menu"]', { timeout: 10_000 }).then(() => true, () => false)
  const rows = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] button')].map((row) => row.textContent.trim()))
  check('slides editor: right-clicking an element opens the editor\'s own menu', opened, JSON.stringify(rows))
  check('slides editor: the menu carries the rows this editor can do', rows.length >= 5, JSON.stringify(rows))
  const duplicate = await menuRowCentre(page, LABELS.slidesDuplicate)
  check('slides editor: the menu offers a duplicate row', Boolean(duplicate))
  if (duplicate) {
    await page.mouse.click(duplicate.x, duplicate.y)
    await sleep(400)
    const grown = await slidesElementCount(page)
    check('slides editor: duplicating a card puts a second box on the page', grown === 4, `elements=${grown}`)
    await pressCombo(page, ['Control', 'z'])
    await sleep(400)
    const undone = await slidesElementCount(page)
    check('slides editor: the editor takes its own edit back from the keyboard', undone === 3, `elements=${undone}`)
  }

  // Fitting the page is the one view control whose answer is measured rather than stepped: the
  // stage is narrower than the deck at this size, so the whole page cannot be on screen at 100%.
  const beforeFit = await readSlidesZoom(page)
  await clickButton(page, ['页面适应窗口', 'Fit the page to the window'])
  await sleep(400)
  const fitted = await readSlidesZoom(page)
  check('slides editor: fitting the page shows all of it at once', fitted !== null && beforeFit !== null && fitted < beforeFit, `before=${beforeFit} after=${fitted}`)

  // Panning needs something to pan to, so the view is zoomed past the page again and the stage is
  // asked to scroll. What has to hold is both halves: the stage moves, and the document does not.
  await clickButton(page, ['放大', 'Zoom in'])
  await clickButton(page, ['放大', 'Zoom in'])
  await sleep(400)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
  const stage = await page.evaluate(() => {
    const element = document.querySelector('.bento-slides-fullscreen .bento-canvas-stage')
    const rect = element.getBoundingClientRect()
    return {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      scrollLeft: element.scrollLeft,
      overflow: element.scrollWidth - element.clientWidth,
    }
  })
  await page.keyboard.down(' ')
  await page.mouse.move(stage.x, stage.y)
  await page.mouse.down()
  await page.mouse.move(stage.x - 80, stage.y, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up(' ')
  await sleep(300)
  const panned = await page.evaluate(() => ({
    scrollLeft: document.querySelector('.bento-slides-fullscreen .bento-canvas-stage').scrollLeft,
  }))
  check('slides editor: space and a drag pan the view', stage.overflow > 0 && panned.scrollLeft > stage.scrollLeft, JSON.stringify({ stage, panned }))
  check('slides editor: panning leaves the page where it was', SLIDES_LANDED.test(await readSlidesSource(page)))


  await assertSlidesPrint(page)

  await page.keyboard.press('Escape')
  const closed = await page.waitForFunction(
    () => !document.querySelector('.bento-slides-fullscreen'),
    { timeout: 10_000 },
  ).then(() => true, () => false)
  check('slides editor: escape closes it', closed)
  // The focus is asserted against the deck's own full screen control rather than against the marked
  // node the scenario pressed: the drags above are edits, the write they schedule re-renders the
  // card, and the button that was pressed does not exist any more. What has to hold is that the
  // keyboard came back to the control that opens this editor — found by its own attribute — and not
  // that it fell to the body or stayed in the surface that just closed.
  const focus = await page.evaluate(() => {
    const control = document.querySelector('.ink-prose [data-bento-slides] [data-bento-slides-fullscreen]')
    return {
      returned: Boolean(control) && document.activeElement === control,
      active: document.activeElement instanceof HTMLElement
        ? document.activeElement.getAttribute('aria-label') ?? document.activeElement.tagName.toLowerCase()
        : 'nothing',
    }
  })
  check('slides editor: it hands focus back to the control it was opened from', focus.returned, JSON.stringify(focus))
}

/**
 * The editor's other exit: the print control hands the browser a sheet built from the deck rather
 * than from the screen. The dialog blocks the thread and cannot be read from a gate, so what is
 * asserted is the paper the dialog is called on — one page box per page of the deck, each at the
 * deck's own page size, laid out off screen and out of the tab order. The sheet lives only as long
 * as the dialog, so the page watches it from inside instead of sampling it after the press.
 */
async function assertSlidesPrint(page) {
  const rail = await page.evaluate(() => document.querySelectorAll('.bento-slides-fullscreen [data-slide-thumbnail]').length)
  await page.evaluate(() => {
    window.__gatePrintSheet = null
    window.__gatePrintWatch = window.setInterval(() => {
      const sheet = document.querySelector('[data-bento-print]')
      if (!sheet || window.__gatePrintSheet) return
      const box = sheet.querySelector('.bento-print-page')?.getBoundingClientRect()
      const rule = [...document.styleSheets]
        .flatMap((style) => { try { return [...style.cssRules] } catch { return [] } })
        .find((entry) => entry.constructor.name === 'CSSPageRule')
      window.__gatePrintSheet = {
        pages: sheet.querySelectorAll('.bento-print-page').length,
        hidden: sheet.getAttribute('aria-hidden') === 'true',
        inert: sheet.hasAttribute('inert'),
        size: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '',
        rule: rule?.cssText ?? '',
        // Off screen rather than hidden: a hidden subtree has no box, and a canvas with no box
        // draws nothing onto the paper.
        offScreen: sheet.getBoundingClientRect().left < 0,
      }
    }, 50)
  })
  await clickButton(page, LABELS.slidesPrint)
  await sleep(2_500)
  const sheet = await page.evaluate(() => {
    window.clearInterval(window.__gatePrintWatch)
    return window.__gatePrintSheet
  })
  check('slides editor: the print control hands the browser a sheet', Boolean(sheet) && sheet.pages === rail && rail > 0, `sheet=${JSON.stringify(sheet)} rail=${rail}`)
  check('slides editor: the sheet is the deck\'s own page at 1:1', sheet?.size === '1280x720' && /size:\s*1280px 720px/.test(sheet?.rule ?? ''), JSON.stringify(sheet))
  check('slides editor: the sheet is off screen and out of the tab order', Boolean(sheet) && sheet.offScreen && sheet.hidden && sheet.inert, JSON.stringify(sheet))
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
    // Escape is only half of it: the keyboard has to come back to where it was, or the person who
    // opened this surface is left with no place on the page. The control is the one marked before it
    // was pressed, so a surface that hands focus to the body, or deep inside a panel that is gone,
    // fails here and says which element ended up holding it.
    const focus = await page.evaluate(() => {
      const describe = (element) => (element
        ? `${element.tagName.toLowerCase()}${element.getAttribute('aria-label') ? `[${element.getAttribute('aria-label')}]` : ''}`
        : 'nothing')
      const opener = document.querySelector('[data-gate-opener]')
      const active = document.activeElement
      return {
        opener: describe(opener),
        active: describe(active instanceof HTMLElement ? active : null),
        returned: Boolean(opener) && active === opener,
      }
    })
    check(`surface keyboard: the ${surface.name} hands focus back to the control it was opened from`, focus.returned, JSON.stringify(focus))
  }
  // The drawer's entry is the one that changed the window: the run leaves the app as it found it.
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(300)
}

/**
 * A row of a submenu that opens a panel of its own. The editor's context menu nests three
 * deep — insert, then the mind map row, then a template — and the third level is a `fixed`
 * box living inside the submenu its pop-in animation owns, which makes that animation's
 * settled transform the block the panel is placed in instead of the viewport: read as
 * viewport coordinates it was drawn a whole submenu down and to the right, off screen, and
 * the row looked dead. The panel is asserted where it has to be — on screen, and beside the
 * row that opened it — and then used, because a panel that is merely visible proves nothing
 * about the row it serves.
 */
async function assertContextMenuNesting(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('context menu scenario: the editor pane never became visible')

  // The blank-canvas menu is the one that carries the insert row, and an empty line at the
  // end of the note is what gives it: the caret is moved there and the right click lands on it.
  await page.evaluate(() => document.querySelector('.cm-content')?.focus())
  await pressCombo(page, ['Control', 'End'])
  await page.keyboard.press('Enter')
  await sleep(300)
  const caret = await page.evaluate(() => {
    const cursor = document.querySelector('.cm-cursor-primary') ?? document.querySelector('.cm-line:last-child')
    const box = cursor?.getBoundingClientRect()
    return box ? { x: Math.round(box.x + 4), y: Math.round(box.y + box.height / 2) } : null
  })
  if (!caret) throw new Error('context menu scenario: the editor has no caret to right-click')
  await page.mouse.click(caret.x, caret.y, { button: 'right' })

  const rowBox = async (labels) => page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('[role="menu"] button, body > div button')]
      .find((candidate) => wanted.includes(candidate.textContent.trim()))
    if (!button) return null
    const box = button.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  }, labels)
  const hoverRow = async (labels, what) => {
    const box = await rowBox(labels)
    if (!box) throw new Error(`context menu scenario: the ${what} row never appeared`)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(450)
    return box
  }

  await page.waitForSelector('[role="menu"]', { timeout: 15_000 })
  check('context menu: right-clicking the editor opens the menu', true)
  await hoverRow(LABELS.insert, 'insert')
  const row = await hoverRow(LABELS.mindMap, 'mind map')

  const panel = await page.evaluate((wanted) => {
    const menu = [...document.querySelectorAll('[role="menu"]')]
      .find((candidate) => wanted.includes(candidate.getAttribute('aria-label') ?? ''))
    if (!menu) return null
    const box = menu.getBoundingClientRect()
    return {
      x: Math.round(box.x), y: Math.round(box.y),
      width: Math.round(box.width), height: Math.round(box.height),
      rows: [...menu.querySelectorAll('button')].map((button) => button.textContent.trim()),
    }
  }, LABELS.mindMap)
  check('context menu: the mind map row opens a panel of templates', Boolean(panel) && panel.rows.length > 0, JSON.stringify(panel))
  if (!panel) return
  const onScreen = panel.x >= 0 && panel.y >= 0
    && panel.x + panel.width <= 1280 && panel.y + panel.height <= 900
  check('context menu: the nested panel is drawn inside the window', onScreen, JSON.stringify(panel))
  const besideRow = Math.abs(panel.x - (row.x + row.width)) <= 8
    && Math.abs(panel.y - row.y) <= row.height
  check('context menu: the nested panel sits beside the row that opened it', besideRow, `panel=${JSON.stringify(panel)} row=${JSON.stringify(row)}`)

  const template = await rowBox(LABELS.mindMapOutline)
  check('context menu: the template row is reachable', Boolean(template))
  if (!template) return
  // The note already carries a mind map fence from its own scenario above, so the mark of this
  // insertion is the template's own topic rather than the fence it arrives in.
  await page.mouse.click(template.x + template.width / 2, template.y + template.height / 2)
  const inserted = await page
    .waitForFunction(() => (document.querySelector('.cm-content')?.textContent ?? '').includes('- Core Topic'), { timeout: 15_000 })
    .then(() => true, () => false)
  check('context menu: picking a template writes the mind map fence', inserted)
  // The note is shared with the scenarios above and this one owns no content of its own.
  await pressCombo(page, ['Control', 'z'])
  await sleep(1_200)
  const undone = await page
    .waitForFunction(() => !(document.querySelector('.cm-content')?.textContent ?? '').includes('- Core Topic'), { timeout: 15_000 })
    .then(() => true, () => false)
  check('context menu: the insertion is undone again', undone)
  await page.keyboard.press('Escape')
  await sleep(300)
}

// --- music surfaces -------------------------------------------------------------
//
// The library hub, the floating player and their queue ride on rules the rest of the gate never
// touches: controls that reveal on hover from md up but must stay tappable below it (the M-18
// rule), entrance animations that a reduced-motion preference has to silence, and a floating
// card that may not sit on top of the surfaces it shares the window edge with. The tracks are
// seeded through the real upload endpoint because the scenario reads what the library draws;
// nothing here ever starts audio, so the probe bytes are never decoded.

const MUSIC_TRACK_TITLES = ['E2E Probe Audio One', 'E2E Probe Audio Two']

const ariaAttr = (labels) => labels.map((label) => `@aria-label="${label}"`).join(' or ')
const cssByLabels = (base, labels) => labels.map((label) => `${base}[aria-label="${label}"]`).join(', ')
const overlaps = (a, b) => a && b
  && a.x < b.x + b.width && b.x < a.x + a.width
  && a.y < b.y + b.height && b.y < a.y + a.height

const HUB_DIALOG_XPATH = `xpath/.//div[@role="dialog" and ${ariaAttr(LABELS.musicHub)}]`

async function seedMusicLibrary(page) {
  return page.evaluate(async (titles) => {
    const statuses = []
    for (const title of titles) {
      const body = new FormData()
      body.set('file', new File(
        [new TextEncoder().encode('e2e-visual probe, not real audio')],
        `${title}.mp3`,
        { type: 'audio/mpeg' },
      ))
      body.set('title', title)
      body.set('artist', 'E2E Probe Artist')
      body.set('album', 'E2E Probe Album')
      body.set('durationMs', '61000')
      // requireClientHeader answers 403 to any non-GET API call without the client marker the
      // app transport always sends; seeding goes through the same gate as the app would.
      const response = await fetch('/api/music/tracks', {
        method: 'POST',
        body,
        headers: { 'X-Inkstone-Client': '1' },
      })
      statuses.push(response.status)
    }
    return statuses
  }, MUSIC_TRACK_TITLES)
}

async function openMusicHub(page) {
  // A playback session restored from the server (music-session-sync) leaves a current track, and
  // the footer then carries the transport row instead of the hub icon — its expand button opens
  // the very same hub, so both footer states are a person's path to it.
  const opener = `xpath/.//footer//button[${ariaAttr(LABELS.musicOpenHub)} or ${ariaAttr(LABELS.musicExpandPlayer)}]`
  try {
    await page.waitForSelector(opener, { timeout: 15_000 })
  } catch {
    return false
  }
  await (await page.$$(opener)).at(-1).click()
  try {
    await page.waitForSelector(HUB_DIALOG_XPATH, { timeout: 15_000 })
  } catch {
    return false
  }
  await sleep(400)
  return true
}

async function hubMotionDurations(page) {
  return page.evaluate((hubLabels) => {
    const dialog = [...document.querySelectorAll('[role="dialog"]')]
      .find((candidate) => hubLabels.includes(candidate.getAttribute('aria-label') ?? ''))
    if (!dialog) return null
    const scrim = (dialog.parentElement ?? dialog).querySelector('.anim-fade')
    const milliseconds = (element) =>
      element ? Number.parseFloat(getComputedStyle(element).animationDuration) * 1000 : null
    return { scrim: milliseconds(scrim), panel: milliseconds(dialog) }
  }, LABELS.musicHub)
}

async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const box = document.querySelector(sel)?.getBoundingClientRect()
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null
  }, selector)
}

// The reveal rules live on the control itself for rows and on a wrapper for cards, and a hidden
// ancestor's opacity never shows up on the child's own computed style — so the readable element
// is picked per surface rather than assumed to be the button.
async function controlState(page, selector, { fromWrapper = false } = {}) {
  return page.evaluate(({ sel, wrapper }) => {
    const button = document.querySelector(sel)
    if (!button) return null
    const element = wrapper ? button.parentElement : button
    if (!element) return null
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return {
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      width: box.width,
      height: box.height,
    }
  }, { sel: selector, wrapper: fromWrapper })
}

// At md and up the row actions reveal on pointer-events-gated hover, but the headless shell
// reports `hover: none`, so the hover branch of the rule can never fire inside this gate. The
// focus-within sibling of that rule is what a keyboard user walks, and it is what gets pressed
// here: focus the control, activate it with Enter, no pointer involved.
async function focusRevealedActivate(page, selector) {
  const handle = (await page.$$(selector)).at(0)
  if (!handle) return false
  await page.evaluate((element) => element.focus(), handle)
  await sleep(200)
  await handle.press('Enter')
  return true
}

async function assertMusicSurface(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)

  const statuses = await seedMusicLibrary(page)
  const seeded = statuses.every((status) => status === 201)
  check('music: the probe library seeded two tracks', seeded, JSON.stringify(statuses))
  if (!seeded) return
  if (!(await openMusicHub(page))) {
    check('music: the status bar opens the library hub', false)
    return
  }
  check('music: the status bar opens the library hub', true)

  const rowsReady = await page
    .waitForFunction(() => [...document.querySelectorAll('[role="row"]')]
      .some((row) => row.textContent.includes('E2E Probe Audio One')), { timeout: 15_000 })
    .then(() => true, () => false)
  check('music: the hub lists the seeded tracks', rowsReady)
  if (!rowsReady) return

  const motion = await hubMotionDurations(page)
  check('music: the hub opens with an entrance animation',
    Boolean(motion) && motion.scrim > 1 && motion.panel > 1, JSON.stringify(motion))

  const playerBox = await rectOf(page, cssByLabels('aside', LABELS.musicMiniPlayer))
  const statusBarBox = await rectOf(page, cssByLabels('footer button', [...LABELS.musicOpenHub, ...LABELS.musicExpandPlayer]))
  check('music: the floating player does not cover the music status bar',
    Boolean(playerBox) && Boolean(statusBarBox) && !overlaps(playerBox, statusBarBox),
    `player=${JSON.stringify(playerBox)} status=${JSON.stringify(statusBarBox)}`)

  // The reduced-motion check reopens the hub from the status bar footer, so it has to run before
  // anything is queued: once a track is current, the footer swaps the hub opener for the transport
  // row, and the 'Added to the queue' toast covers the floating player's own opener for seconds.
  await page.keyboard.press('Escape')
  await sleep(300)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await openMusicHub(page)
  const reduced = await hubMotionDurations(page)
  check('music: reduced motion silences the hub entrance',
    Boolean(reduced) && reduced.scrim <= 1 && reduced.panel <= 1, JSON.stringify(reduced))
  await page.emulateMediaFeatures([])
  await page.keyboard.press('Escape')
  await sleep(300)
  await openMusicHub(page)

  const menuQueued = await focusRevealedActivate(page, cssByLabels('div[role="row"] button', LABELS.musicMoreActions))
    && await page.waitForSelector('xpath/.//div[@role="menu"]', { timeout: 15_000 })
      .then(() => clickButton(page, LABELS.musicAddToQueue).then(() => true, () => false), () => false)
  check('music: the row menu queues a track without playing it', menuQueued)
  await sleep(300)

  await clickButton(page, LABELS.musicGridView)
  await page.waitForSelector(cssByLabels('div.grid-cols-2 button', LABELS.musicFavorite), { timeout: 15_000 })

  await page.setViewport({ width: 700, height: 900 })
  await sleep(500)
  const cardActions = await controlState(page, cssByLabels('div.grid-cols-2 button', LABELS.musicFavorite), { fromWrapper: true })
  check('music: card actions stay visible and clickable below md',
    Boolean(cardActions) && cardActions.opacity === 1 && cardActions.pointerEvents !== 'none' && cardActions.width > 0,
    JSON.stringify(cardActions))

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
  await clickButton(page, LABELS.musicListView)
  await page.setViewport({ width: 700, height: 900 })
  await sleep(500)
  const rowFavorite = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicFavorite))
  const rowMenu = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicMoreActions))
  check('music: row actions stay visible and clickable below md',
    [rowFavorite, rowMenu].every((control) => control
      && control.opacity === 1 && control.pointerEvents !== 'none' && control.width > 0),
    `favorite=${JSON.stringify(rowFavorite)} menu=${JSON.stringify(rowMenu)}`)

  await page.setViewport({ width: 375, height: 667 })
  await sleep(500)
  // Below the hub's 900px breakpoint the fixed-width side columns fold into drawers opened
  // from the header (UI-14), so the centre list — and the touch reveal rule on its rows —
  // now keeps the whole width instead of being squeezed away.
  const narrowFavorite = await controlState(page, cssByLabels('div[role="row"] button', LABELS.musicFavorite))
  check('music: row actions keep the touch reveal rule at 375px',
    Boolean(narrowFavorite) && narrowFavorite.opacity === 1 && narrowFavorite.pointerEvents !== 'none',
    JSON.stringify(narrowFavorite))

  const folded = await page.evaluate((navSelector) => {
    const row = document.querySelector('[role="rowgroup"] [role="row"]')
    return {
      navInline: Boolean(document.querySelector(navSelector)),
      rowWidth: row ? Math.round(row.getBoundingClientRect().width) : 0,
    }
  }, cssByLabels('aside', LABELS.musicHubNavigation))
  check('music: the hub folds its side columns and keeps the list width at 375px',
    !folded.navInline && folded.rowWidth >= 300, JSON.stringify(folded))

  await page.click(cssByLabels('header button', LABELS.musicHubOpenNavigation))
  const drawerOpened = await page
    .waitForSelector(cssByLabels('[data-surface="drawer"] aside', LABELS.musicHubNavigation), { timeout: 15_000 })
    .then(() => true, () => false)
  check('music: the folded navigation opens as a drawer', drawerOpened)
  await page.keyboard.press('Escape')
  await sleep(300)

  await page.keyboard.press('Escape')
  await sleep(400)
  const narrowPlayer = await rectOf(page, cssByLabels('aside', LABELS.musicMiniPlayer))
  const navBar = await rectOf(page, cssByLabels('nav', LABELS.musicMobileNav))
  check('music: the floating player clears the mobile navigation bar',
    Boolean(narrowPlayer) && Boolean(navBar) && !overlaps(narrowPlayer, navBar)
    && narrowPlayer.x >= 0 && narrowPlayer.x + narrowPlayer.width <= 375.5,
    `player=${JSON.stringify(narrowPlayer)} nav=${JSON.stringify(navBar)}`)

  const queueButton = cssByLabels('aside button', LABELS.musicQueue)
  await (await page.$$(queueButton)).at(-1).click()
  const removeSelector = cssByLabels('aside button', LABELS.musicRemoveFromQueue)
  const queueShown = await page.waitForFunction((sel) => Boolean(document.querySelector(sel)),
    undefined, removeSelector).then(() => true, () => false)
  const queueRowText = await page.evaluate((sel) => {
    const button = document.querySelector(sel)
    return button?.parentElement?.textContent ?? null
  }, removeSelector)
  check('music: the floating player shows the track queued from the row menu',
    queueShown && Boolean(queueRowText?.includes('E2E Probe Audio')), String(queueRowText))
  const queueRemove = await controlState(page, removeSelector)
  check('music: queue actions stay visible and clickable on touch',
    Boolean(queueRemove) && queueRemove.opacity === 1 && queueRemove.pointerEvents !== 'none',
    JSON.stringify(queueRemove))

  // The immersive player shares UI-14's fold: below the breakpoint its fixed-width artwork
  // column stacks into a full-width row, so the lyrics pane keeps the viewport width instead
  // of being squeezed by the 384px column.
  await (await page.$$(cssByLabels('aside button', LABELS.musicImmersive))).at(-1).click()
  const immersiveDialog = cssByLabels('[role="dialog"]', LABELS.musicImmersive)
  const immersiveShown = await page.waitForSelector(immersiveDialog, { timeout: 15_000 }).then(() => true, () => false)
  check('music: the floating player opens the immersive view at 375px', immersiveShown)
  if (immersiveShown) {
    // Scope the lookup inside the dialog itself: cssByLabels' comma union would let an
    // unscoped second branch match a background surface.
    const lyricsWidth = await page.evaluate((dialogLabels, lyricsLabels) => {
      const dialog = dialogLabels
        .map((label) => document.querySelector(`[role="dialog"][aria-label="${label}"]`))
        .find(Boolean)
      const lyrics = dialog && dialog.querySelector(lyricsLabels
        .map((label) => `[role="group"][aria-label="${label}"]`)
        .join(', '))
      return lyrics ? Math.round(lyrics.getBoundingClientRect().width) : 0
    }, LABELS.musicImmersive, LABELS.musicLyrics)
    check('music: the immersive lyrics pane keeps its width at 375px',
      lyricsWidth >= 300, String(lyricsWidth))
    await page.keyboard.press('Escape')
    await sleep(300)
  }

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
}

/**
 * The share center is the one large surface the shell renders through the shared Modal: a dialog at
 * desktop width and that modal's full screen variant at the phone breakpoint. It is opened the way a
 * person opens it — the sidebar's Share entry switches the list to the shared view, whose header
 * carries the manage-shares control — so Escape has an opener to hand focus back to.
 *
 * The data behind it is real: the KPI strip only paints once the analytics request through the
 * worker and D1 resolved, so a dashboard stuck on its loading skeleton fails here instead of
 * passing on an empty shell.
 */
const SHARE_DIALOG = cssByLabels('[role="dialog"]', LABELS.shareHub)
const MOBILE_PANE = '.mobile-pane-layer[data-active]'
// The Share entry is drawn either as the rail's icon (collapsed sidebar, an accessible name only) or
// as one of the quick-nav buttons (expanded, where a count badge rides in front of the label). Both
// live in the shell's own sidebar, and that is what tells them from the workspace header's Share
// action, which carries the same name but asks for one note's share settings instead.
const SHARE_ENTRY_TEXT = /^(\d+|99\+)?(分享|Share)$/

/**
 * Opens the share center down the path a person takes. The list's own toolbar is the entry, and it
 * only draws in the shared view, so the Share nav entry comes first — through the shell's bottom bar
 * at phone width, where the sidebar lives in the navigation pane. The toolbar is waited for rather
 * than slept on: switching the view is a route change, and pressing before the control exists would
 * report an unopened surface as a broken one.
 */
async function openShareHub(page, { mobile = false } = {}) {
  if (mobile) {
    await page.evaluate((labels) => {
      const tab = [...document.querySelectorAll('nav button')].find((item) => labels.some((label) => item.textContent.includes(label)))
      tab?.click()
    }, LABELS.nav)
    await sleep(600)
  }
  const scope = mobile ? MOBILE_PANE : 'aside'
  const point = await page.evaluate(({ scope, labels, pattern }) => {
    const buttons = [...(document.querySelector(scope)?.querySelectorAll('button') ?? [])]
      .filter((item) => item.getBoundingClientRect().width > 0)
    const control = buttons.find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
      ?? buttons.find((item) => new RegExp(pattern).test(item.textContent.replace(/\s+/g, '')))
    if (!control) return null
    control.scrollIntoView({ block: 'center' })
    const box = control.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { scope, labels: LABELS.shareView, pattern: SHARE_ENTRY_TEXT.source })
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  const entry = await page.waitForFunction(({ labels, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    return [...(root?.querySelectorAll('button') ?? [])]
      .some((item) => labels.includes(item.getAttribute('aria-label') ?? '') && item.getBoundingClientRect().width > 0)
  }, { timeout: 15_000 }, { labels: LABELS.shareManage, scope: mobile ? MOBILE_PANE : '' }).then(() => true, () => false)
  if (!entry) return false
  await pressOpener(page, { labels: LABELS.shareManage, scope: mobile ? MOBILE_PANE : '' })
  return page.waitForSelector(SHARE_DIALOG, { timeout: 15_000 }).then(() => true, () => false)
}

async function assertShareCenter(page) {
  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(500)
  const opened = await openShareHub(page)
  check('share: the shared view opens the share center', opened)
  if (!opened) return
  await waitForPanelSettled(page, SHARE_DIALOG)
  await ensureAxe(page)

  const kpi = await page.waitForFunction(({ dialog, labels }) => {
    const hub = document.querySelector(dialog)
    return Boolean(hub) && labels.some((label) => hub.textContent.includes(label))
  }, { timeout: 20_000 }, { dialog: SHARE_DIALOG, labels: LABELS.shareKpi }).then(() => true, () => false)
  check('share: the center draws its KPIs from the analytics request', kpi)

  const desktop = await runAxe(page, SHARE_DIALOG)
  check('share: the center has no accessibility violations at desktop width',
    desktop.violations.length === 0, JSON.stringify(desktop.violations.slice(0, 3)))
  const unreviewed = desktop.incomplete.filter((item) => !isReviewedIncomplete(item))
  check('share: no unreviewed axe items in the center',
    unreviewed.length === 0, JSON.stringify(unreviewed.slice(0, 3)))

  await page.keyboard.press('Escape')
  await sleep(700)
  const closed = await page.evaluate((selector) => ({
    hub: Boolean(document.querySelector(selector)),
    returned: document.activeElement === document.querySelector('[data-gate-opener]'),
  }), SHARE_DIALOG)
  check('share: the center closes with escape and hands focus back to its control',
    !closed.hub && closed.returned, JSON.stringify(closed))

  await page.setViewport(MOBILE_VIEWPORT)
  await sleep(700)
  const reopened = await openShareHub(page, { mobile: true })
  check('share: the phone breakpoint opens the center from the bottom bar', reopened)
  if (!reopened) return
  await waitForPanelSettled(page, SHARE_DIALOG)

  const covered = await page.evaluate((selector) => {
    const hub = document.querySelector(selector)
    if (!hub) return null
    const box = hub.getBoundingClientRect()
    return {
      width: Math.round(box.width),
      height: Math.round(box.height),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    }
  }, SHARE_DIALOG)
  check('share: the center takes the phone breakpoint as a full screen surface',
    Boolean(covered) && covered.width >= covered.viewportWidth - 1 && covered.height >= covered.viewportHeight - 1,
    JSON.stringify(covered))

  const narrow = await runAxe(page, SHARE_DIALOG)
  check('share: the full screen variant has no accessibility violations',
    narrow.violations.length === 0, JSON.stringify(narrow.violations.slice(0, 3)))

  await page.keyboard.press('Escape')
  await sleep(700)
  // The shell holds its own inactive panes inert at this width, so "released" is asked of the opener
  // rather than of the page: the control the surface was opened from is back under the keyboard and
  // no longer inside an inert subtree, which is what a person finds when they press Escape.
  const released = await page.evaluate((selector) => {
    const opener = document.querySelector('[data-gate-opener]')
    return {
      hub: Boolean(document.querySelector(selector)),
      focus: document.activeElement === opener,
      inert: Boolean(opener?.closest('[inert]')),
      active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName ?? 'nothing',
    }
  }, SHARE_DIALOG)
  check('share: the full screen variant closes with escape and releases the app',
    !released.hub && released.focus && !released.inert, JSON.stringify(released))

  await page.setViewport(DESKTOP_VIEWPORT)
  await sleep(400)
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
    await assertSlidesEditor(page)
    await assertFullscreenToolbars(page)
    await assertContextMenuNesting(page)
    await assertMusicSurface(page)
    await assertShareCenter(page)

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
