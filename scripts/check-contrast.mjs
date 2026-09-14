// AGENTS.md accessibility red line: text on a tinted surface has to clear AA, and the
// tints that matter are the ones the accent produces (--accent-soft and its
// softer sibling) — the palette cannot promise a tier is safe there, because
// the tint sits *behind* whatever the component paints with it. The dimmest
// tiers clear AA on the plain surfaces and fall under it on a tint (the light
// sidebar's count badge measured 3.86:1), so the rule is a per-pair one: a
// surface that carries a tier must clear 4.5:1 for that tier.
//
// This gate measures the pairs the app actually paints rather than a list of
// pairs somebody remembered to write down: it opens the running instance in a
// browser, walks the rendered text, composites each element's background chain
// (a tint is translucent, so the surface under it counts), maps the colours
// back to the tokens they came from, and names the offender by token. Both
// themes are measured, because the tint leans on the surface underneath it and
// the two themes have different ones. The shell's axe pass runs here too, in the
// same theme on the same freshly-opened panel: axe's color-contrast rule and the
// measurements below are the same question asked twice, so they belong in one
// scenario rather than in the behaviour gate (scripts/e2e-visual.mjs), which
// keeps the presentation, export and mind map assertions.
//
// Usage: node scripts/check-contrast.mjs [base-url] [--report]
//   base-url defaults to http://localhost:7712.
//   --report prints every pair it measured, not just the failures.
// Credentials: INKSTONE_VISUAL_USERNAME / INKSTONE_VISUAL_PASSWORD, the same
// account scripts/e2e-visual.mjs signs in as.
import puppeteer from 'puppeteer-core'
import {
  PALETTE_PANEL,
  SETTINGS_PANEL,
  chromeExecutablePath,
  ensureAxe,
  isReviewedIncomplete,
  loginThroughUi,
  runAxe,
  setAppTheme,
  sleep,
  waitForPanelSettled,
} from './e2e-harness.mjs'

const args = process.argv.slice(2)
const REPORT = args.includes('--report')
const BASE = args.find((arg) => arg.startsWith('http')) ?? 'http://localhost:7712'
const USERNAME = process.env.INKSTONE_VISUAL_USERNAME ?? 'Owner-1'
const PASSWORD = process.env.INKSTONE_VISUAL_PASSWORD ?? 'supersecret100'
const THEMES = ['light', 'dark']
const AA_NORMAL = 4.5
const AA_LARGE = 3
const VIEWPORT = { width: 1280, height: 900 }
const SETTLE_MS = 500
const SETTLE_TIMEOUT = 20_000


// Panels rendered over the app, each opened the way a person opens it. Their
// surfaces differ from the shell's, so they are their own measurements — and each
// names the root the axe pass below inspects, because axe's color-contrast rule
// and the numbers measured here are the same question asked twice.
const SURFACES = [
  { name: 'shell', axeRoot: 'aside', open: async () => {}, close: async () => {} },
  {
    name: 'command palette',
    axeRoot: PALETTE_PANEL,
    open: async (page) => {
      await page.keyboard.down('Control')
      await page.keyboard.press('k')
      await page.keyboard.up('Control')
      await page.waitForSelector('[role="dialog"] input[role="combobox"]', { timeout: SETTLE_TIMEOUT })
      await waitForPanelSettled(page, PALETTE_PANEL)
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await sleep(SETTLE_MS)
    },
  },
  {
    name: 'settings',
    axeRoot: SETTINGS_PANEL,
    open: async (page) => {
      await page.keyboard.down('Control')
      await page.keyboard.press(',')
      await page.keyboard.up('Control')
      await page.waitForSelector('[role="dialog"] button[role="radio"]', { timeout: SETTLE_TIMEOUT })
      await waitForPanelSettled(page, SETTINGS_PANEL)
    },
    close: async (page) => {
      await page.keyboard.press('Escape')
      await sleep(SETTLE_MS)
    },
  },
]

/**
 * The same surface, asked the other way. axe reads the colour the browser
 * composited and flags whatever falls under AA; the pass above names the token
 * behind it. One theme, one freshly-opened panel, so the two answers are about
 * the same pixels.
 */
async function judgeSurfaceAxe(surface, theme, page) {
  const result = await runAxe(page, surface.axeRoot)
  if (result.passes === 0) throw new Error(`axe inspected nothing in the ${surface.name}`)
  const review = result.incomplete.filter((item) => !isReviewedIncomplete(item))
  // The reviewed items are named in the count so "nothing to report" stays distinguishable from
  // "the pass measured nothing"; they are allowed by id and reason, never by silence.
  const allowed = result.incomplete.length - review.length
  console.log(`  ${result.violations.length + review.length === 0 ? '✓' : '✗'} axe: the ${surface.name} has no violations and no unreviewed items (${theme}), ${result.passes} checks passed, ${allowed} reviewed items allowed`)
  for (const item of result.violations) {
    console.log(`      ${item.id} ×${item.count} — ${item.note}`)
    console.log(`        ${item.target}`)
    console.log(`        ${item.html}`)
  }
  for (const item of review) {
    console.log(`      review: ${item.id} ×${item.count} — ${item.note}`)
    console.log(`        ${item.target}`)
  }
  return result.violations.length + review.length
}

// Every text node the browser actually painted, with the background chain that
// sits behind it. The page returns raw computed strings; the colour math below
// runs in node so the gate never depends on how canvas happens to parse a
// colour function.
const COLLECT = () => {
  const readColor = (value) => (value && value !== 'transparent' ? value : '')
  const chainOf = (element) => {
    const layers = []
    for (let node = element; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.backgroundImage !== 'none') return null
      const background = readColor(style.backgroundColor)
      if (background) layers.push({ color: background, token: node.dataset.probeToken ?? '' })
      if (style.opacity !== '1') return null
      if (style.visibility === 'hidden' || style.display === 'none') return null
    }
    const root = getComputedStyle(document.documentElement)
    layers.push({ color: readColor(root.backgroundColor) || readColor(getComputedStyle(document.body).backgroundColor), token: '' })
    return layers.reverse()
  }
  // The colour each token resolves to, so a measured layer can be named again.
  // Values go through a probe element instead of the stylesheet text: a tint is
  // a color-mix(), and only the browser can resolve that against the theme.
  const names = new Set()
  for (const sheet of document.styleSheets) {
    let rules = []
    try {
      rules = [...sheet.cssRules]
    }
    catch {
      continue
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue
      for (const name of rule.style) {
        if (!/^--(text|accent|bg)-?/.test(name)) continue
        // Lengths and the like share the prefixes but are not colours.
        if (!/^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color|color-mix)/i.test(rule.style.getPropertyValue(name).trim())) continue
        names.add(name)
      }
    }
  }
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.pointerEvents = 'none'
  probe.style.width = '1px'
  probe.style.height = '1px'
  document.body.append(probe)
  const tokens = {}
  for (const name of names) {
    probe.style.backgroundColor = 'transparent'
    probe.style.backgroundColor = `var(${name})`
    tokens[name] = getComputedStyle(probe).backgroundColor
  }
  probe.remove()
  const rows = []
  for (const element of document.querySelectorAll('body *')) {
    const text = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
    if (!text) continue
    if (element.closest('img, svg, canvas, video, iframe, [aria-hidden="true"]')) continue
    if (element.getClientRects().length === 0) continue
    const style = getComputedStyle(element)
    const chain = chainOf(element)
    if (!chain || chain.length === 0) continue
    rows.push({
      text: text.slice(0, 40),
      color: style.color,
      fontSize: Number.parseFloat(style.fontSize) || 0,
      bold: Number.parseInt(style.fontWeight, 10) >= 700,
      tag: element.tagName.toLowerCase(),
      className: (element.className || '').toString().slice(0, 90),
      chain,
    })
  }
  return { rows, tokens }
}

// The other half of the tint rule. Every accent the appearance setting offers
// gets used as text on its own soft tint (badges, selected rows, counters), so
// the pairing has to clear AA for all of them — the account this run signs in as
// only paints one. The values come out of the stylesheet through the same
// var()/color-mix chain the components paint with, so a new accent is covered
// the day it is declared.
const ACCENT_MATRIX = () => {
  const root = document.documentElement
  const initial = { theme: root.dataset.theme ?? '', accent: root.dataset.accent ?? '' }
  const accents = new Set()
  const surfaces = new Set()
  for (const sheet of document.styleSheets) {
    let rules = []
    try {
      rules = [...sheet.cssRules]
    }
    catch {
      continue
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSStyleRule)) continue
      // Chrome normalizes the attribute quotes in selectorText, so both spellings count.
      const named = rule.selectorText.match(/data-accent=['"]([^'"]+)['"]/)
      if (named) accents.add(named[1])
      for (const name of rule.style) {
        if (/^--bg-(sunken|base|editor|surface|inset|overlay|hover)$/.test(name)) surfaces.add(name)
      }
    }
  }
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.pointerEvents = 'none'
  probe.style.width = '1px'
  probe.style.height = '1px'
  document.body.append(probe)
  const resolve = (name) => {
    probe.style.backgroundColor = 'transparent'
    probe.style.backgroundColor = `var(${name})`
    return getComputedStyle(probe).backgroundColor
  }
  const matrix = []
  // Both themes, in the page: this function is serialized to the browser, so it
  // carries its own copy of the list. The accent-less fallback in the base :root
  // block is left out on purpose: the store pins data-accent on the root
  // (store/ui/theme.ts), so nothing paints without one.
  for (const theme of ['light', 'dark']) {
    root.dataset.theme = theme
    for (const accent of [...accents].sort()) {
      root.dataset.accent = accent
      matrix.push({
        theme,
        accent,
        text: resolve('--accent'),
        tint: resolve('--accent-soft'),
        surfaces: [...surfaces].sort().map((name) => ({ name, color: resolve(name) })),
      })
    }
  }
  probe.remove()
  if (initial.theme) root.dataset.theme = initial.theme
  else root.removeAttribute('data-theme')
  if (initial.accent) root.dataset.accent = initial.accent
  else root.removeAttribute('data-accent')
  return matrix
}

/**
 * An accent painted as text sits on its own tint over some surface, so the tint
 * is composited first: the ratio depends on which surface is underneath, which
 * is why every one of them is measured instead of the editor's alone.
 */
function judgeAccentMatrix(matrix) {
  const failures = []
  let measured = 0
  for (const entry of matrix) {
    const text = parseColor(entry.text)
    const tint = parseColor(entry.tint)
    if (!text || !tint) continue
    for (const surface of entry.surfaces) {
      const base = parseColor(surface.color)
      // A translucent surface (--bg-hover is a 4% wash) has no colour of its own:
      // what shows through it is whatever it is painted on, which is not a token
      // question. The painted pairs cover those, so they are skipped here.
      if (!base || base.alpha !== 1) continue
      const ratio = contrastRatio(text.rgb, over(tint, base.rgb))
      measured++
      if (ratio < AA_NORMAL) failures.push({ theme: entry.theme, accent: entry.accent, surface: surface.name, ratio, background: over(tint, base.rgb), foreground: text.rgb })
    }
  }
  const byTheme = new Map()
  for (const entry of matrix) byTheme.set(entry.theme, (byTheme.get(entry.theme) ?? 0) + 1)
  for (const [theme, count] of byTheme) {
    console.log(`  ${failures.some((item) => item.theme === theme) ? '✗' : '✓'} ${theme}: ${count} accent/tint pairs measured, ${failures.filter((item) => item.theme === theme).length} below AA`)
  }
  for (const item of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.log(`      ${item.ratio.toFixed(2)}:1 (needs ${AA_NORMAL}) [${item.theme}] accent '${item.accent}' as text on its tint over ${item.surface} — ${toHex(item.foreground)} on ${toHex(item.background)}`)
  }
  return failures.length
}

/**
 * Every accent is one click away in the appearance panel, but the shell only
 * ever paints the one the account picked — so a pair whose tint *is* the accent
 * is re-measured here for all of them: the tint is the same mix of another
 * accent over the same surface, and the text is the same tier (or the accent
 * itself, for pairs that paint accent-coloured text on the tint).
 */
function judgeAccentSweep(label, result, accents) {
  const sweepable = result.tinted.filter((pair) => pair.judged && pair.accent && (pair.accent.tier === '--accent' || !pair.accent.tier.includes('accent')))
  const failures = []
  let measurements = 0
  for (const pair of sweepable) {
    const tierIsAccent = pair.accent.tier === '--accent'
    for (const entry of accents) {
      const color = parseColor(entry.text)
      if (!color) continue
      measurements++
      const background = over({ rgb: color.rgb, alpha: pair.accent.tintAlpha }, pair.accent.surfaceRgb)
      const foreground = tierIsAccent ? color.rgb : pair.foreground
      const ratio = contrastRatio(foreground, background)
      if (ratio < pair.required) failures.push({ accent: entry.accent, key: pair.key, ratio, required: pair.required, background, foreground, samples: pair.samples })
    }
  }
  console.log(`  ${failures.length === 0 ? '✓' : '✗'} ${label}: ${sweepable.length} accent-tinted pairs re-measured for all ${accents.length} accents (${measurements} measurements), ${failures.length} below AA`)
  for (const item of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.log(`      ${item.ratio.toFixed(2)}:1 (needs ${item.required}) accent '${item.accent}': ${item.key} — ${toHex(item.foreground)} on ${toHex(item.background)} (e.g. ${item.samples[0]})`)
  }
  return failures.length
}

// --- colour math -----------------------------------------------------------

const parseColor = (value) => {
  const text = (value ?? '').trim().toLowerCase()
  const hex = text.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const raw = hex[1].length <= 4 ? hex[1].split('').map((c) => c + c).join('') : hex[1]
    const channel = (index) => Number.parseInt(raw.slice(index * 2, index * 2 + 2), 16)
    return { rgb: [channel(0), channel(1), channel(2)], alpha: raw.length === 8 ? channel(3) / 255 : 1 }
  }
  const functional = text.match(/^(rgba?|oklch|oklab|color)\((.*)\)$/)
  if (!functional) return null
  const body = functional[2]
  const [head, alphaPart] = body.split('/')
  const numbers = head.trim().split(/\s+/)
  const alpha = alphaPart === undefined ? 1 : alphaPart.trim().endsWith('%') ? Number.parseFloat(alphaPart) / 100 : Number.parseFloat(alphaPart)
  if (functional[1] === 'rgb' || functional[1] === 'rgba') {
    // Legacy rgba() carries its alpha as a fourth channel, not after a slash.
    const legacy = numbers.length > 3 ? Number.parseFloat(numbers[3]) : null
    return { rgb: numbers.slice(0, 3).map((part) => Number.parseFloat(part)), alpha: legacy === null ? alpha : legacy }
  }
  if (functional[1] === 'oklch') {
    const lightness = Number.parseFloat(numbers[0]) > 1 ? Number.parseFloat(numbers[0]) / 100 : Number.parseFloat(numbers[0])
    return { rgb: oklabToRgb(lightness, Number.parseFloat(numbers[1]) * Math.cos(radians(numbers[2] ?? '0')), Number.parseFloat(numbers[1]) * Math.sin(radians(numbers[2] ?? '0'))), alpha }
  }
  if (functional[1] === 'oklab') {
    return { rgb: oklabToRgb(Number.parseFloat(numbers[0]), Number.parseFloat(numbers[1]), Number.parseFloat(numbers[2])), alpha }
  }
  // color(srgb r g b) — what Chrome computes a color-mix() into.
  const channels = numbers.filter((part) => part !== 'srgb').slice(0, 3).map((part) => Number.parseFloat(part) * 255)
  return { rgb: channels, alpha }
}

const radians = (degrees) => (Number.parseFloat(degrees) * Math.PI) / 180

function oklabToRgb(l, a, b) {
  const lms = [
    (l + 0.3963377774 * a + 0.2158037573 * b) ** 3,
    (l - 0.1055613458 * a - 0.0638541728 * b) ** 3,
    (l - 0.0894841775 * a - 1.291485548 * b) ** 3,
  ]
  const linear = [
    4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2],
    -1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2],
    -0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2],
  ]
  return linear.map((channel) => Math.min(255, Math.max(0, linearToSrgb(channel) * 255)))
}

const linearToSrgb = (value) => (value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055)

const relativeLuminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrastRatio = (foreground, background) => {
  const [high, low] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a)
  return (high + 0.05) / (low + 0.05)
}

const over = (top, bottom) => top.rgb.map((channel, index) => channel * top.alpha + bottom[index] * (1 - top.alpha))

const near = (rgb, other) => rgb.every((channel, index) => Math.abs(channel - other[index]) <= 3)

const toHex = (rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`

/**
 * Turns the painted text into (tier, surface) pairs. A tint is translucent, so
 * the surface underneath it is composited first and the pair is named after
 * both. Pairs without a tint are counted but not judged: they are the palette's
 * plain ladder, which the token calibration and axe already cover.
 */
function inspect({ rows, tokens }, theme) {
  const resolved = Object.entries(tokens)
    .map(([name, value]) => ({ name, color: parseColor(value) }))
    .filter((entry) => entry.color)
  // The accent is the one colour a run can swap under the app (the appearance
  // setting paints any of seven), so a pair whose tint is the accent is recorded
  // in a form the sweep below can re-measure for all of them.
  const accentToken = resolved.find((entry) => entry.name === '--accent')?.color ?? null
  const nameFor = (value) => {
    const color = parseColor(value)
    if (!color) return ''
    return resolved
      .filter((entry) => Math.abs(entry.color.alpha - color.alpha) < 0.06 && near(entry.color.rgb, color.rgb))
      .map((entry) => entry.name)
      .join('|')
  }
  const pairs = new Map()
  for (const row of rows) {
    const text = parseColor(row.color)
    if (!text) continue
    let background = [255, 255, 255]
    let surface = ''
    let surfaceRgb = null
    let tintAlpha = null
    let translucent = 0
    const tints = []
    for (const layer of row.chain) {
      const color = parseColor(layer.color)
      if (!color || color.alpha === 0) continue
      background = over(color, background)
      const name = nameFor(layer.color) || `(${toHex(color.rgb)}${color.alpha < 0.999 ? ` @${Math.round(color.alpha * 100)}%` : ''})`
      if (color.alpha < 0.999) {
        translucent++
        tints.push(name)
        if (accentToken && near(color.rgb, accentToken.rgb)) tintAlpha = color.alpha
      }
      else {
        surface = name
        surfaceRgb = color.rgb
      }
    }
    // Only a single accent tint over an opaque surface can be re-measured for
    // another accent exactly: a second translucent layer would have to be
    // re-derived too.
    const accent = translucent === 1 && tintAlpha !== null && surfaceRgb ? { tintAlpha, surfaceRgb } : null

    const foreground = text.alpha < 1 ? over({ rgb: text.rgb, alpha: text.alpha }, background) : text.rgb
    const fontPx = Math.round(row.fontSize * 10) / 10
    const required = row.fontSize >= 24 || (row.fontSize >= 18.66 && row.bold) ? AA_LARGE : AA_NORMAL
    const matched = nameFor(row.color)
    const tier = matched || toHex(text.rgb)
    const key = `${tier} on ${[...tints, surface].filter(Boolean).join(' over ')}`
    // Only a design token can be judged here: a tag colour comes from data (the
    // user's own palette) and carries its own readability contract, so those
    // pairs are counted and reported without a verdict.
    const entry = pairs.get(key) ?? { key, theme, judged: Boolean(matched), ratio: Infinity, required, tinted: tints.length > 0, samples: [], fontPx, background, foreground, tag: row.tag, className: row.className, accent: accent ? { ...accent, tier: matched } : null }
    if (!entry.accent || !accent || entry.accent.tintAlpha !== accent.tintAlpha) entry.accent = null
    entry.ratio = Math.min(entry.ratio, contrastRatio(foreground, background))
    entry.required = Math.max(entry.required, required)
    if (entry.samples.length < 3) entry.samples.push(`${row.text} (${fontPx}px ${row.tag})`)
    pairs.set(key, entry)
  }
  const all = [...pairs.values()]
  return { all, tinted: all.filter((pair) => pair.tinted) }
}

function report(label, result) {
  const judged = result.tinted.filter((pair) => pair.judged)
  const failing = judged.filter((pair) => pair.ratio < pair.required).sort((a, b) => a.ratio - b.ratio)
  if (REPORT) {
    for (const pair of [...result.tinted].sort((a, b) => a.ratio - b.ratio)) {
      const mark = pair.judged ? (pair.ratio < pair.required ? '✗' : '✓') : '·'
      console.log(`  ${mark} [${label}] ${pair.ratio.toFixed(2)}:1 (needs ${pair.required}) ${pair.key} — e.g. ${pair.samples[0]}`)
    }
  }
  console.log(`  ${failing.length === 0 ? '✓' : '✗'} ${label}: ${judged.length} token tiers on a tint measured, ${failing.length} below AA (${result.tinted.length - judged.length} data-coloured pairs reported, ${result.all.length - result.tinted.length} plain pairs left to the palette gates)`)
  for (const pair of result.tinted.filter((pair) => !pair.judged)) {
    console.log(`      · ${pair.ratio.toFixed(2)}:1 ${pair.key} — not a token, not judged (${pair.samples[0]})`)
  }      for (const pair of failing) {
    console.log(`      ${pair.ratio.toFixed(2)}:1 (needs ${pair.required}) [${label}] ${pair.key}`)
    for (const sample of pair.samples) console.log(`        ${sample}`)
    console.log(`        ${toHex(pair.foreground)} on ${toHex(pair.background)} — ${pair.tag} ${pair.className}`)
  }
  return failing.length
}

async function main() {
  console.log(`contrast gate against ${BASE}`)
  const browser = await puppeteer.launch({
    executablePath: chromeExecutablePath(),
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  let failures = 0
  try {
    const page = await browser.newPage()
    await page.setViewport(VIEWPORT)
    await page.goto(BASE, { waitUntil: 'networkidle2' })
    await loginThroughUi(page, { username: USERNAME, password: PASSWORD })
    await ensureAxe(page)
    const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme)
    // The accent inventory is read once and used two ways: the stylesheet-level
    // matrix below, and the sweep that re-measures the painted accent tints.
    const matrix = await page.evaluate(ACCENT_MATRIX)
    if (matrix.length === 0) throw new Error('the stylesheet declares no accents to measure')
    for (const theme of THEMES) {
      await setAppTheme(page, theme)
      const accents = matrix.filter((entry) => entry.theme === theme)
      // The shell first, then the two dialog surfaces: they sit on --bg-overlay,
      // the lightest surface in either theme, and that is where a dim tier runs
      // out of contrast first.
      for (const surface of SURFACES) {
        await surface.open(page)
        const collected = await page.evaluate(COLLECT)
        if (collected.rows.length === 0) throw new Error(`the ${theme}/${surface.name} pass measured no text at all`)
        const result = inspect(collected, theme)
        failures += report(`${theme} · ${surface.name}`, result)
        failures += judgeAccentSweep(`${theme} · ${surface.name}`, result, accents)
        failures += await judgeSurfaceAxe(surface, theme, page)
        await surface.close(page)
      }
    }
    failures += judgeAccentMatrix(matrix)
    // Leave the instance in the theme it arrived in.
    await setAppTheme(page, initialTheme === 'dark' ? 'dark' : 'light')
  }
  finally {
    await browser.close()
  }
  console.log(failures === 0
    ? 'contrast gate passed: every text tier and accent painted on a tint clears AA in both themes'
    : `contrast gate failed: ${failures} tier/surface pairs below AA`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`contrast gate crashed: ${error.message}`)
  process.exit(1)
})
