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
import puppeteer from 'puppeteer-core'

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

function chromeExecutablePath() {
  const candidates = [
    process.env.INKSTONE_CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error('no system Chrome found; set INKSTONE_CHROME_PATH to the browser binary')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  presentFreeze: ['冻结当前快照', 'Freeze this snapshot'],
  presentFollow: ['跟随笔记更新', 'Follow the note'],
}

function labelSelector(labels) {
  const text = labels.map((l) => `contains(., "${l}")`).join(' or ')
  const aria = labels.map((l) => `@aria-label="${l}"`).join(' or ')
  return `xpath/.//button[${aria} or ${text}]`
}

async function clickButton(page, labels, timeout = 15_000) {
  await page.waitForSelector(labelSelector(labels), { timeout })
  const handle = (await page.$$(labelSelector(labels))).at(-1)
  await handle.click()
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

async function loginThroughUi(page) {
  const hasLoginForm = await page.evaluate(() => !!document.querySelector('input[type="password"]'))
  if (!hasLoginForm) return 'session'

  const prefilled = await page.evaluate(() => {
    const user = document.querySelector('input[autocomplete="username"], input[name="username"]')
    const pass = document.querySelector('input[type="password"]')
    return !!user?.value && !!pass?.value
  })
  if (prefilled) {
    // Demo mode: the form ships prefilled admin credentials.
    await page.click('button[type="submit"]')
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 })
    return 'demo-login'
  }

  // Existing account: fill the real login form with trusted keyboard events
  // (synthetic value setters do not reach React 19's state).
  const userField = await page.$('input[autocomplete="username"], input[name="username"]')
  const passField = await page.$('input[type="password"]')
  if (!userField || !passField) throw new Error('login form present but fields not found')
  await userField.type(USERNAME)
  await passField.type(PASSWORD)
  await page.click('button[type="submit"]')
  try {
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 20_000 })
    return 'login'
  } catch {
    throw new Error(
      `login failed for ${USERNAME}: check INKSTONE_VISUAL_USERNAME / INKSTONE_VISUAL_PASSWORD`,
    )
  }
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
async function assertPresentationPages(page) {
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

  await clickPresentationControl(page, LABELS.presentExit)
  await sleep(600)
}

// The presentation surface is a modal dialog around a scaled canvas: exactly the shape where a
// missing role, an unnamed control or a low-contrast token goes unnoticed by eye. axe-core is
// injected into the live page (its own browser build, evaluated rather than added as a script
// tag so the app's CSP stays untouched) and run over the whole overlay with the slide list open.
//
// Three results come back as "incomplete" rather than violations. Two of them are because the
// list renders the same slide markup once per page — aria-hidden-focus (those copies are inert,
// so nothing inside them is focusable) and duplicate-id-aria (the copies are inert and
// aria-hidden, so their ids are not reachable) — and one is axe's own caveat on a one-character
// label: it cannot decide whether a single digit is text, which is exactly the visible page
// number in the list (the entry's accessible name already carries the position). These are
// allowed by id and reason, so any new kind of review item still fails the gate; the violation
// list has to stay empty.
//
// The one violation this run found is why the light theme mixes a callout title's accent toward
// the body text (styles/prose/blocks.css): the accent alone read at about 2.2:1 on the callout
// tint, below AA for text. The override has no comment of its own because CSS comments are not
// allowed in this repository, and this gate is what keeps it honest.
function isReviewedIncomplete(item) {
  if (item.id === 'aria-hidden-focus' || item.id === 'duplicate-id-aria') return true
  // axe cannot compute a background it only partly sees, which is a review item rather than a
  // failure: a one-character label ("it cannot decide whether a single digit is text") and text the
  // scaled slide canvas overlaps (a chart's rendered image) both land here. Real contrast failures
  // still arrive as violations — the light-theme callout title above was one.
  return item.id === 'color-contrast' && /too short to determine|partially overlaps/.test(item.note)
}

async function assertPresentationAccessibility(page) {
  await clickButton(page, LABELS.present)
  await page.waitForSelector('[data-slide-canvas]', { timeout: 15_000 })
  await waitForRailFilled(page)
  await page.evaluate(fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8'))
  const report = await page.evaluate(async () => {
    const results = await window.axe.run(document.querySelector('[role="dialog"]'), { resultTypes: ['violations', 'incomplete'] })
    return {
      violations: results.violations.map((item) => `${item.id} (${item.nodes.length}): ${(item.nodes[0]?.target ?? []).join(' ')}`),
      incomplete: results.incomplete.map((item) => ({ id: item.id, target: (item.nodes[0]?.target ?? []).join(' ').slice(0, 80), note: (item.nodes[0]?.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 120) })),
      passes: results.passes.length,
    }
  })
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

    const auth = await loginThroughUi(page)
    check(`bootstrap: authenticated via ${auth}`, true)

    await typeProbeNote(page)
    await assertProseSurface(page, 'mobile-preview')
    await assertPaneTransition(page)
    await assertDesktopSplit(page)
    await assertPresentation(page)
    await assertPresentationSession(page)
    await assertPresentationPages(page)
    await assertPresentationAccessibility(page)
    await assertDeckExport(page)

    // Demo backend intentionally logs a 401 for the logged-out ping; only
    // render-breaking errors matter here.
    const fatal = consoleErrors.filter((text) => !/Failed to load resource.*(401|403|404)/.test(text))
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
