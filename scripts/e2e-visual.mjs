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
