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
// scenario rather than in the behaviour gate (scripts/e2e-visual.mjs), which keeps
// the presentation and export assertions and the mind map's behaviour ones.
//
// Usage: node scripts/check-contrast.mjs [base-url] [--report]
//   base-url defaults to http://localhost:7712.
//   --report prints every pair it measured, not just the failures.
// Credentials: INKSTONE_VISUAL_USERNAME / INKSTONE_VISUAL_PASSWORD, the same
// account scripts/e2e-visual.mjs signs in as.
import puppeteer from 'puppeteer-core'
import {
  MUSIC_PROBE,
  PALETTE_PANEL,
  SETTINGS_PANEL,
  SHARE_HUB_DIALOG,
  SHARE_LABELS,
  chromeExecutablePath,
  clickButton,
  ensureAxe,
  ensurePaneVisible,
  isReviewedIncomplete,
  loginThroughUi,
  openShareCenter,
  pressCombo,
  runAxe,
  seedMusicProbeTracks,
  setAppTheme,
  sleep,
  waitForHittable,
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


const MINDMAP_FULLSCREEN = '.mindmap-fullscreen'
const MINDMAP_FENCE = ['', '```mindmap', '- Contrast Probe', '  - Keyboard reference', '```'].join('\n')
// axe's wording for text it will not judge because something is painted over it: the pass run under
// a transient layer has to recognize its own items by it, and the pass without the layer must not
// see one at all.
const OCCLUSION_NOTE = 'overlapped by another element'

/**
 * The mind map's full screen view, opened with its keyboard reference card up.
 *
 * The card is the point of this surface: the behaviour gate runs its axe pass on
 * the same overlay, but the card was closed again before it did, so the one
 * surface that panel added was never read by either gate. Opening it here — in
 * both themes, on the same freshly-opened overlay the measurements below read —
 * leaves nothing skipped. The view needs a live map, so a note holding a fence is
 * made through the app's own new-note shortcut when the vault has none; the fence
 * is the same one the behaviour gate types.
 */
async function openMindmapFullscreen(page) {
  const existing = await page.evaluate(() => Boolean(document.querySelector('.ink-prose [data-mindmap]')))
  if (!existing) {
    if (!(await ensurePaneVisible(page, '.cm-content'))) throw new Error('mind map surface: the editor pane never became visible')
    await pressCombo(page, ['Control', 'n'])
    await sleep(1_200)
    const typed = await page.evaluate((markdown) => {
      const content = document.querySelector('.cm-content')
      if (!content) return false
      content.focus()
      const selection = window.getSelection()
      selection.selectAllChildren(content)
      selection.collapseToEnd()
      return document.execCommand('insertText', false, markdown)
    }, MINDMAP_FENCE)
    if (!typed) throw new Error('mind map surface: the editor is not mounted to type the fence into')
    await sleep(1_200)
  }
  if (!(await ensurePaneVisible(page, '.ink-prose'))) throw new Error('mind map surface: the preview pane never became visible')
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.ink-prose .mindmap-canvas')
    const box = canvas?.getBoundingClientRect()
    return Boolean(box && box.width > 100 && box.height > 100)
  }, { timeout: 30_000 })
  await page.click('.ink-prose .mindmap-block [data-mindmap-fullscreen]')
  await page.waitForSelector(MINDMAP_FULLSCREEN, { timeout: SETTLE_TIMEOUT })
  await waitForPanelSettled(page, MINDMAP_FULLSCREEN)
  await sleep(SETTLE_MS)
  const toggled = await page.evaluate(() => {
    const head = document.querySelector('.mindmap-fullscreen-head')
    const toggle = [...(head?.querySelectorAll('button') ?? [])]
      .find((element) => /shortcut|快捷键/.test(element.getAttribute('aria-label') ?? ''))
    toggle?.click()
    return Boolean(toggle)
  })
  if (!toggled) throw new Error('mind map surface: the overlay has no keyboard reference toggle')
  await page.waitForSelector('.mindmap-shortcuts', { timeout: SETTLE_TIMEOUT })
  await sleep(SETTLE_MS)
}

/**
 * The card is the transient layer: this puts it away without leaving full screen, so the map's own
 * topic text can be read on its own. The card is drawn over the middle of the drawing area, and the
 * topic labels it covers are exactly the ones axe refuses to judge while it is up — a review item
 * that is true about the pixels and useless as a failure, because the layer is the thing being
 * measured. Measuring the surface twice keeps both answers and neither is taken on trust: the card
 * is judged with it open, the map's text with it away on the same instance, and the first pass is
 * only allowed to report the occlusion because the second has to come back without it — except for
 * the targets named by `alwaysOverlaid` below, which no re-read can ever clear.
 * The removal here is asserted, not assumed: the wait fails the gate if the card is still mounted.
 */
async function dismissMindmapCard(page) {
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.mindmap-shortcuts'), { timeout: SETTLE_TIMEOUT })
  await sleep(SETTLE_MS)
}

/** The second Escape is the one that leaves full screen. */
async function closeMindmapFullscreen(page) {
  await page.keyboard.press('Escape')
  await sleep(SETTLE_MS)
  await page.keyboard.press('Escape')
  await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: SETTLE_TIMEOUT }, MINDMAP_FULLSCREEN)
  await sleep(SETTLE_MS)
}

// The two music panels are measured in the library's grid view on purpose: the duration badge
// (UI-23) — --text-inverse on --scrim — is only painted there, and it is the one tinted chip in
// the app whose backing is card artwork rather than a token surface.
const MUSIC_HUB_DIALOG = 'div[role="dialog"][aria-label="音乐库"],div[role="dialog"][aria-label="Music library"]'
const MUSIC_IMMERSIVE_DIALOG = 'div[role="dialog"][aria-label="沉浸式播放"],div[role="dialog"][aria-label="Full screen player"]'
// Both selectors go by the fixture's own title, so the tracks the surfaces are measured on and the
// tracks the fixture seeds cannot drift apart.
const MUSIC_GRID_PLAY = `div.grid-cols-2 button[aria-label*="${MUSIC_PROBE.titles[0]}"]`
const MUSIC_PROBE_ROW = `xpath=.//div[@role="row"]//button[contains(., "${MUSIC_PROBE.titles[0]}")]`
// Both footer states open the hub: the plain icon before anything plays, and — once a track is
// current, which the grid click below itself causes on the second theme pass — the transport
// row's expand button.
const MUSIC_HUB_LABELS = ['打开音乐库', 'Open music library', '展开播放器', 'Expand the player']
const IMMERSIVE_LABELS = ['沉浸式播放', 'Full screen player']
const MUSIC_HUB_OPENER = `xpath/.//footer//button[${MUSIC_HUB_LABELS.map((label) => `@aria-label="${label}"`).join(' or ')}]`

async function openMusicHub(page) {
  // The probe tracks are this surface's fixture, and it arranges for them itself: an empty library
  // paints no view toggle and no rows to select, and the gate used to stop on the missing control
  // instead of saying why — a prerequisite that lived on one machine as an undocumented leftover
  // (SH-100). A fixture that does not take is reported here rather than measured as a quieter hub.
  const fixture = await seedMusicProbeTracks({ page })
  if (fixture.found.length < MUSIC_PROBE.titles.length) {
    throw new Error(`music surface: ${fixture.found.length} of ${MUSIC_PROBE.titles.length} probe tracks open in the browser after seeding (${JSON.stringify(fixture)})`)
  }
  // The footer's own entry sits behind the transport row, so a notice from an earlier pass can be
  // what a press lands on.
  await waitForHittable(page, [...MUSIC_HUB_LABELS])
  const openers = await page.$$(MUSIC_HUB_OPENER)
  const opener = openers.at(-1) ?? await page.waitForSelector(MUSIC_HUB_OPENER, { timeout: SETTLE_TIMEOUT })
  await opener.click()
  await page.waitForSelector(MUSIC_HUB_DIALOG, { timeout: SETTLE_TIMEOUT })
  await waitForPanelSettled(page, MUSIC_HUB_DIALOG)
}

async function closeDialog(page, selector) {
  await page.keyboard.press('Escape')
  await sleep(SETTLE_MS)
  await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: SETTLE_TIMEOUT }, selector)
}

// The list view's tinted rows — the current track's accent soft background and the selected
// row's softer one — only paint here, and clicking a probe track's title both selects it and
// makes it current, so one click sets up the states the measurement below reads.
async function openMusicHubList(page) {
  await openMusicHub(page)
  await clickButton(page, ['列表视图', 'List view'])
  const titles = await page.$$(MUSIC_PROBE_ROW)
  const title = titles.at(0)
  if (title) await title.click()
  await sleep(SETTLE_MS)
}

async function openMusicHubGrid(page) {
  await openMusicHub(page)
  await clickButton(page, ['网格视图', 'Grid view'])
  await page.waitForSelector(MUSIC_GRID_PLAY, { timeout: SETTLE_TIMEOUT })
  // The card is the play control, so the same click that proves the grid painted also gives the
  // immersive surface below a current track. On the second theme pass this click pauses what the
  // first started; a current track is what immersive needs, playing or not.
  await (await page.$$(MUSIC_GRID_PLAY)).at(0).click()
  await sleep(SETTLE_MS)
}

async function openImmersivePlayer(page) {
  // The opener is in the transport row, which a playback-failure notice covers for seconds after a
  // track is picked — waiting for it to be hittable keeps that notice from reading as a surface that
  // did not open.
  await waitForHittable(page, IMMERSIVE_LABELS)
  await clickButton(page, IMMERSIVE_LABELS, SETTLE_TIMEOUT)
  await page.waitForSelector(MUSIC_IMMERSIVE_DIALOG, { timeout: SETTLE_TIMEOUT })
  await waitForPanelSettled(page, MUSIC_IMMERSIVE_DIALOG)
}

// Panels rendered over the app, each opened the way a person opens it. Their
// surfaces differ from the shell's, so they are their own measurements — and each
// names the root the axe pass below inspects, because axe's color-contrast rule
// and the numbers measured here are the same question asked twice.
/**
 * The share center, opened through the shared opener in `e2e-harness.mjs` — the same function
 * `scripts/e2e-visual.mjs` opens it with, from one label set (SH-99). The two things this caller
 * asks for are its own: the fixture the pairs need, and the All Shares row, which is the row whose
 * count badge sits on the accent tint, i.e. the exact pair the badge rule is about.
 */
async function openShareSurface(page) {
  // Two of the pairs this surface is here for are only painted by an account that has something to
  // draw: the KPI delta badge needs traffic and the sidebar's tag row needs a tag, and CI's fixture
  // account has neither until this puts them there. Without it the pass measures a quieter center
  // and says nothing about either pair (SH-103) — so the fixture is a prerequisite here rather than
  // a silent possibility, the same way the music surfaces above require their seeded tracks.
  const opened = await openShareCenter(page, { base: BASE, fixture: true, category: SHARE_LABELS.categoryAll })
  if (!opened) throw new Error('the shell sidebar offers no share entry to open')
  await sleep(SETTLE_MS)
}

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
  {
    name: 'mind map full screen',
    axeRoot: MINDMAP_FULLSCREEN,
    open: openMindmapFullscreen,
    close: closeMindmapFullscreen,
    // The card is this surface's own transient layer: the measurements and the first axe pass run
    // with it up, because the card is the surface that was skipped, and the same instance is then
    // read a second time with the card away. Only a surface that declares the second read has the
    // items its layer occludes set aside, and only because that read has to pass without them.
    // `alwaysOverlaid` names the one kind of occlusion the re-read can never clear: the library
    // paints its connector layers (.lines/.subLines, full-canvas and pointer-events:none) after
    // the topic nodes, so axe sees a non-ancestor element over every topic text in any map, card
    // or not. Those targets are still named in the log rather than filtered in silence, and the
    // text is not left unread: the measurement pass above walks each topic text through its
    // ancestor background chain — the transparent overlays do not sit in that chain — and judges
    // or reports it by the same token rule as everywhere else.
    occluder: { layer: 'keyboard reference card', dismiss: dismissMindmapCard, alwaysOverlaid: 'me-tpc[' },
  },
  {
    name: 'music library list view',
    axeRoot: MUSIC_HUB_DIALOG,
    open: openMusicHubList,
    close: (page) => closeDialog(page, MUSIC_HUB_DIALOG),
  },
  {
    name: 'music library grid view',
    axeRoot: MUSIC_HUB_DIALOG,
    open: openMusicHubGrid,
    close: (page) => closeDialog(page, MUSIC_HUB_DIALOG),
  },
  {
    name: 'immersive player',
    axeRoot: MUSIC_IMMERSIVE_DIALOG,
    open: openImmersivePlayer,
    close: (page) => closeDialog(page, MUSIC_IMMERSIVE_DIALOG),
  },
  {
    // Last on purpose: opening the center switches the shell's own panel to the share list, and the
    // music surfaces above read seeded state through their own view. Nothing runs after this one,
    // so it may leave the panel where it found it only by pressing Escape (which closes the center).
    name: 'share center',
    axeRoot: SHARE_HUB_DIALOG,
    open: openShareSurface,
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
async function judgeSurfaceAxe(surface, theme, page, occluder = null, alwaysOverlaid = null) {
  const result = await runAxe(page, surface.axeRoot)
  if (result.passes === 0) throw new Error(`axe inspected nothing in the ${surface.name}`)
  // Under a transient layer the surface draws itself, text the layer covers comes back from axe as
  // something it could not judge rather than as something it measured. Those items are set aside for
  // this pass alone: the caller runs the second read of the same instance, and that one must return
  // without them, so a surface no longer gets quieter by painting over its own text.
  const hasOcclusionNote = (item) => item.id === 'color-contrast' && item.note.includes(OCCLUSION_NOTE)
  const isOccluded = (item) => Boolean(occluder) && hasOcclusionNote(item)
  // The re-read's one exception: targets the surface permanently paints under, named by the
  // surface's own `alwaysOverlaid` prefix. They are printed by target rather than dropped.
  const isAlwaysOverlaid = (item) => Boolean(alwaysOverlaid) && hasOcclusionNote(item) && item.target.startsWith(alwaysOverlaid)
  const occluded = result.incomplete.filter((item) => isOccluded(item) && !isAlwaysOverlaid(item))
  const overlaid = result.incomplete.filter(isAlwaysOverlaid)
  const review = result.incomplete.filter((item) => !isReviewedIncomplete(item) && !isOccluded(item) && !isAlwaysOverlaid(item))
  // The reviewed items are named in the count so "nothing to report" stays distinguishable from
  // "the pass measured nothing"; they are allowed by id and reason, never by silence.
  const allowed = result.incomplete.length - review.length
  const occlusion = occluded.length ? `, ${occluded.length} of them occluded by the ${occluder.layer} and read again below` : ''
  console.log(`  ${result.violations.length + review.length === 0 ? '✓' : '✗'} axe: the ${surface.name} has no violations and no unreviewed items (${theme}), ${result.passes} checks passed, ${allowed} reviewed items allowed${occlusion}`)
  for (const item of result.violations) {
    console.log(`      ${item.id} ×${item.count} — ${item.note}`)
    console.log(`        ${item.target}`)
    console.log(`        ${item.html}`)
  }
  for (const item of occluded) {
    console.log(`      occluded: ${item.id} ×${item.count} — under the ${occluder.layer}`)
    console.log(`        ${item.target}`)
  }
  for (const item of overlaid) {
    console.log(`      always overlaid: ${item.id} ×${item.count} — the surface's own line layer sits over this text in any state`)
    console.log(`        ${item.target}`)
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

// The other half of the tint rule, one reader for the three palettes that are painted as text on
// their own tint. Every accent the appearance setting offers gets used that way (badges, selected
// rows, counters), so the pairing has to clear AA for all of them — the account this run signs in as
// only paints one. The status colors are the same rule with a fixed list, and the kanban block's own
// tag colours are the same rule on a palette that is not an appearance token at all: "not a token"
// is not a licence to fail AA. The values come out of the stylesheet through the same
// var()/color-mix chain the components paint with, so a new accent — or a new tag colour — is
// covered the day it is declared.
const TOKEN_MATRIX = (kind) => {
  const root = document.documentElement
  const initial = { theme: root.dataset.theme ?? '', accent: root.dataset.accent ?? '', background: root.dataset.background ?? '' }
  const accents = new Set()
  const tags = new Set()
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
        const tag = name.match(/^--kanban-tag-([a-z]+)-fg$/)
        if (tag) tags.add(tag[1])
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
  const palette = {
    // The accent-less fallback in the base :root block is left out on purpose: the store pins
    // data-accent on the root (store/ui/theme.ts), so nothing paints without one.
    accent: [...accents].sort().map((name) => ({ name, text: '--accent', tint: '--accent-soft' })),
    status: ['danger', 'warning', 'success'].map((name) => ({ name, text: `--${name}`, tint: `--${name}-soft` })),
    kanban: [...tags].sort().map((name) => ({ name, text: `--kanban-tag-${name}-fg`, tint: `--kanban-tag-${name}-bg` })),
  }[kind]
  if (!palette) throw new Error(`unknown palette to measure: ${kind}`)
  const matrix = []
  // Both themes, in the page: this function is serialized to the browser, so it carries its own copy
  // of the list. The tag palette is read under both background variants as well — the setting swaps
  // exactly the surfaces a tint sits on, and the light one makes them lighter and the dark one
  // lighter still, the direction a translucent wash runs out of contrast in first.
  const backgrounds = kind === 'kanban' ? ['', 'white'] : ['']
  for (const theme of ['light', 'dark']) {
    root.dataset.theme = theme
    for (const background of backgrounds) {
      if (background) root.dataset.background = background
      else root.removeAttribute('data-background')
      for (const entry of palette) {
        if (kind === 'accent') root.dataset.accent = entry.name
        matrix.push({
          theme,
          variant: background ? `${theme}/${background}` : theme,
          accent: entry.name,
          text: resolve(entry.text),
          tint: resolve(entry.tint),
          surfaces: [...surfaces].sort().map((name) => ({ name, color: resolve(name) })),
        })
      }
    }
  }
  probe.remove()
  if (initial.theme) root.dataset.theme = initial.theme
  else root.removeAttribute('data-theme')
  if (initial.accent) root.dataset.accent = initial.accent
  else root.removeAttribute('data-accent')
  if (initial.background) root.dataset.background = initial.background
  else root.removeAttribute('data-background')
  return matrix
}

/**
 * A colour painted as text sits on its own tint over some surface, so the tint is composited first:
 * the ratio depends on which surface is underneath, which is why every one of them is measured
 * instead of the editor's alone.
 *
 * `plainSurfaces` adds the palette's second rule: the same colour drawn as text on the surfaces
 * themselves. The kanban tags ask for it because they are also painted as a dot, a border and a bar
 * — places where the tint is not behind them — so the value has to read on the surface as well.
 * The failures say which of the two rules a colour missed.
 */
function judgeTokenMatrix(matrix, kindLabel = 'accent', { plainSurfaces = false } = {}) {
  const failures = []
  // Ratios, not pairs: a palette measured under two rules yields two of them per surface, and the
  // count is per variant so the line says what that variant was read for.
  const ratios = new Map()
  const count = (variant) => ratios.set(variant, (ratios.get(variant) ?? 0) + 1)
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
      const onTint = contrastRatio(text.rgb, over(tint, base.rgb))
      count(entry.variant ?? entry.theme)
      if (onTint < AA_NORMAL) {
        failures.push({ theme: entry.variant ?? entry.theme, accent: entry.accent, rule: 'on its own tint over', surface: surface.name, ratio: onTint, background: over(tint, base.rgb), foreground: text.rgb })
      }
      if (!plainSurfaces) continue
      const onSurface = contrastRatio(text.rgb, base.rgb)
      count(entry.variant ?? entry.theme)
      if (onSurface < AA_NORMAL) {
        failures.push({ theme: entry.variant ?? entry.theme, accent: entry.accent, rule: 'on', surface: surface.name, ratio: onSurface, background: base.rgb, foreground: text.rgb })
      }
    }
  }
  const byVariant = new Map()
  for (const entry of matrix) byVariant.set(entry.variant ?? entry.theme, (byVariant.get(entry.variant ?? entry.theme) ?? 0) + 1)
  for (const [variant, entries] of byVariant) {
    const failed = failures.filter((item) => item.theme === variant).length
    console.log(`  ${failed === 0 ? '✓' : '✗'} ${variant}: ${entries} ${kindLabel}/tint pairs measured (${ratios.get(variant) ?? 0} ratios), ${failed} below AA`)
  }
  for (const item of failures.sort((a, b) => a.ratio - b.ratio)) {
    console.log(`      ${item.ratio.toFixed(2)}:1 (needs ${AA_NORMAL}) [${item.theme}] ${kindLabel} '${item.accent}' as text ${item.rule} ${item.surface} — ${toHex(item.foreground)} on ${toHex(item.background)}`)
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
    const matrix = await page.evaluate(TOKEN_MATRIX, 'accent')
    if (matrix.length === 0) throw new Error('the stylesheet declares no accents to measure')
    for (const theme of THEMES) {
      await setAppTheme(page, theme)
      const accents = matrix.filter((entry) => entry.theme === theme)
      // The shell first, then the dialog surfaces: they sit on --bg-overlay, the
      // lightest surface in either theme, and that is where a dim tier runs out of
      // contrast first. The mind map's full screen view joins them with its keyboard
      // reference card up. The music surfaces open last: they read seeded state (a
      // note of its own, probe tracks from scripts/e2e.mjs) the earlier passes leave alone.
      for (const surface of SURFACES) {
        await surface.open(page)
        const collected = await page.evaluate(COLLECT)
        if (collected.rows.length === 0) throw new Error(`the ${theme}/${surface.name} pass measured no text at all`)
        const result = inspect(collected, theme)
        failures += report(`${theme} · ${surface.name}`, result)
        failures += judgeAccentSweep(`${theme} · ${surface.name}`, result, accents)
        // A surface opened under a layer it draws itself has text that layer covers, and axe reports
        // exactly that text as unjudgeable instead of reading it. Those items fail nothing here
        // because the same instance is read again below with the layer away, where they have to be
        // absent — save the targets the surface is always overlaid on, which that read still names
        // one by one; the count line names how many were, so nothing is excused in silence.
        failures += await judgeSurfaceAxe(surface, theme, page, surface.occluder)
        if (surface.occluder) {
          await surface.occluder.dismiss(page)
          failures += await judgeSurfaceAxe(
            { ...surface, name: `${surface.name} without its ${surface.occluder.layer}` },
            theme,
            page,
            null,
            surface.occluder.alwaysOverlaid,
          )
        }
        await surface.close(page)
      }
    }
    failures += judgeTokenMatrix(matrix)
    const semantic = await page.evaluate(TOKEN_MATRIX, 'status')
    if (semantic.length === 0) throw new Error('the stylesheet declares no status colors to measure')
    failures += judgeTokenMatrix(semantic, 'status color')
    // The kanban tags are the block's own palette, not an appearance token, and the reader that
    // watches the board only sees the tags a note happens to carry in the theme it happened to be
    // read in (§55 allowed `kanban:color-contrast` on exactly that basis). Here every declared
    // colour is measured against every surface, in both themes and both background variants.
    const tags = await page.evaluate(TOKEN_MATRIX, 'kanban')
    if (tags.length === 0) throw new Error('the stylesheet declares no kanban tag colours to measure')
    failures += judgeTokenMatrix(tags, 'kanban tag colour', { plainSurfaces: true })
    // Leave the instance in the theme it arrived in.
    await setAppTheme(page, initialTheme === 'dark' ? 'dark' : 'light')
  }
  finally {
    await browser.close()
  }
  console.log(failures === 0
    ? 'contrast gate passed: every text tier, accent, status color and kanban tag colour painted on a tint clears AA in both themes'
    : `contrast gate failed: ${failures} tier/surface pairs below AA`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(`contrast gate crashed: ${error.message}`)
  process.exit(1)
})
