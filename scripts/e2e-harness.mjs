/**
 * What both browser gates need to drive the same running instance: the system
 * Chrome they launch, the sign-in they both go through, the appearance control
 * they both turn, and the axe pass they both run over a surface.
 *
 * Each gate then owns one class of assertion and neither reaches into the
 * other's scenarios: `e2e-visual.mjs` asserts how the surfaces behave (prose
 * pipeline, presentation, mind map, the show's own a11y) and
 * `check-contrast.mjs` asserts what colours they paint — the shell's tiers on
 * their tints in both themes, plus the axe pass over those same surfaces.
 */
import fs from 'node:fs'

export function chromeExecutablePath() {
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

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** zh-CN and en-US labels, matched on both text and aria-label so the gates stay locale-agnostic. */
export function labelSelector(labels) {
  const text = labels.map((label) => `contains(., "${label}")`).join(' or ')
  const aria = labels.map((label) => `@aria-label="${label}"`).join(' or ')
  return `xpath/.//button[${aria} or ${text}]`
}

export async function clickButton(page, labels, timeout = 15_000) {
  await page.waitForSelector(labelSelector(labels), { timeout })
  const handle = (await page.$$(labelSelector(labels))).at(-1)
  await handle.click()
}

/**
 * A fork that lags the upstream release is offered the update on every owner
 * sign-in, and the prompt's scrim swallows whatever is clicked next — which a
 * gate reads as "the control I clicked did nothing". The prompt is real UI, so
 * both gates close it the way a person would before they start driving the app.
 */
export async function dismissUpdatePrompt(page) {
  const button = await page
    .waitForSelector(labelSelector(['下次再说', 'Remind me next time']), { timeout: 10_000 })
    .catch(() => null)
  if (!button) return false
  await button.click()
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 5_000 }).catch(() => {})
  await sleep(300)
  return true
}

/** Signs in as the account under test and leaves the app with no dialog on top of it. */
export async function loginThroughUi(page, { username, password }) {
  const hasLoginForm = await page.evaluate(() => !!document.querySelector('input[type="password"]'))
  if (hasLoginForm) {
    const prefilled = await page.evaluate(() => {
      const user = document.querySelector('input[autocomplete="username"], input[name="username"]')
      return !!user?.value
    })
    if (!prefilled) {
      const userField = await page.$('input[autocomplete="username"], input[name="username"]')
      const passwordField = await page.$('input[type="password"]')
      if (!userField || !passwordField) throw new Error('login form present but its fields were not found')
      await userField.type(username)
      await passwordField.type(password)
    }
    await page.click('button[type="submit"]')
    const signedIn = await page
      .waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 30_000 })
      .then(() => true, () => false)
    if (!signedIn) throw new Error(`sign-in failed for ${username}; pass INKSTONE_VISUAL_USERNAME/PASSWORD for this instance`)
    await sleep(1_500)
  }
  await dismissUpdatePrompt(page)
}

// Labels the theme control goes by, matched on the accessible name so the gates
// are locale-agnostic (shared/locales, settings section).
export const THEME_LABELS = {
  light: ['Light', '浅色'],
  dark: ['Dark', '深色'],
  system: ['System', '跟随系统'],
}

/** The theme is a per-account setting; the gates drive the same control a person would. */
export async function setAppTheme(page, theme) {
  const labels = THEME_LABELS[theme]
  // "system" has no resolved theme of its own — it is whatever the OS preference says — so it is
  // always driven, and verified through the control being checked rather than through a colour.
  const resolved = await page.evaluate(() => document.documentElement.dataset.theme)
  if (theme !== 'system' && resolved === theme) return
  await page.keyboard.down('Control')
  await page.keyboard.press(',')
  await page.keyboard.up('Control')
  await page.waitForSelector('[role="dialog"] button[role="radio"]', { timeout: 15_000 })
  const clicked = await page.evaluate((wanted) => {
    const button = [...document.querySelectorAll('[role="dialog"] button[role="radio"]')]
      .find((element) => wanted.includes(element.getAttribute('aria-label') ?? ''))
    button?.click()
    return Boolean(button)
  }, labels)
  if (!clicked) throw new Error(`setAppTheme: the settings dialog has no ${theme} option`)
  const settled = theme === 'system'
    ? () => page.waitForFunction((wanted) => {
      const button = [...document.querySelectorAll('[role="dialog"] button[role="radio"]')]
        .find((element) => wanted.includes(element.getAttribute('aria-label') ?? ''))
      return button?.getAttribute('aria-checked') === 'true'
    }, { timeout: 10_000 }, labels)
    : () => page.waitForFunction((next) => document.documentElement.dataset.theme === next, { timeout: 10_000 }, theme)
  await settled()
  await page.keyboard.press('Escape')
  await sleep(500)
}

/** Presses a combo the way the app's own hotkey map reads it: modifiers held, the key last. */
export async function pressCombo(page, keys) {
  for (const key of keys.slice(0, -1)) await page.keyboard.down(key)
  await page.keyboard.press(keys.at(-1))
  for (const key of keys.slice(0, -1)) await page.keyboard.up(key)
}

/**
 * The editor layout is a per-account setting the app cycles with its own shortcut: a scenario that has
 * to type a fence into the note and then read the prose back needs two different layouts, and both
 * gates reach them the way a person does rather than by writing the setting.
 */
export async function cycleEditorLayout(page) {
  await pressCombo(page, ['Control', 'Backslash'])
  await sleep(800)
}

/** Cycles the layout until the pane holding `selector` is on screen; false when it never was. */
export async function ensurePaneVisible(page, selector) {
  // One more attempt than the layout cycle has layouts: the shortcut walks
  // edit → live → split → preview, so reaching a pane can cost three presses.
  for (let attempt = 0; attempt < 4; attempt++) {
    const visible = await page.evaluate((sel) => {
      const element = document.querySelector(sel)
      return Boolean(element) && element.getClientRects().length > 0
    }, selector)
    if (visible) return true
    await cycleEditorLayout(page)
  }
  return false
}

// Injected once per page: axe ships its own browser build, and evaluating it keeps the app's CSP
// untouched (a script tag would be refused).
export async function ensureAxe(page) {
  if (await page.evaluate(() => Boolean(window.axe))) return
  await page.evaluate(fs.readFileSync('node_modules/axe-core/axe.min.js', 'utf8'))
}

/** Both of the shell's panels are named rather than found: "the dialog" is whatever was opened last. */
export const PALETTE_PANEL = '[role="dialog"]:has(input[role="combobox"])'
export const SETTINGS_PANEL = '[role="dialog"]:not(:has(input[role="combobox"]))'

/**
 * A panel animates in, and opacity is part of what axe reads: a dialog measured
 * mid-flight reads as dimmed text and reports a contrast failure that is really
 * about the animation.
 */
export async function waitForPanelSettled(page, selector) {
  await page.waitForFunction((sel) => {
    const panel = document.querySelector(sel)
    return Boolean(panel) && getComputedStyle(panel).opacity === '1'
  }, { timeout: 10_000 }, selector)
}

export async function runAxe(page, selector) {
  return page.evaluate(async (root) => {
    const target = root ? document.querySelector(root) : document
    if (!target) throw new Error(`axe: no element matching ${root}`)
    const results = await window.axe.run(target, { resultTypes: ['violations', 'incomplete'] })
    const summarize = (items) => items.map((item) => {
      // The deck box the failing node sits in, when it is one of the deck's own. axe hands back no
      // element, and the path below is cut for the log, so this is read from the path in full — the
      // box's own attribute is in it, which is what tells a deck's canvas apart from the app's chrome.
      const path = (item.nodes[0]?.target ?? []).join(' ')
      const box = /\[data-slide-element="([^"]+)"\]/.exec(path)?.[1] ?? ''
      return {
      id: item.id,
      count: item.nodes.length,
      box,
      target: (item.nodes[0]?.target ?? []).join(' ').slice(0, 90),
      note: (item.nodes[0]?.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 140),
      // The node itself, because a failing target is a Tailwind class soup nobody can read.
      html: (item.nodes[0]?.html ?? '').replace(/\s+/g, ' ').slice(0, 200),
      }
    })
    return { violations: summarize(results.violations), incomplete: summarize(results.incomplete), passes: results.passes.length }
  }, selector)
}

/**
 * Three results come back as "incomplete" rather than violations. Two of them are because the
 * slide list renders the same slide markup once per page — aria-hidden-focus (those copies are
 * inert, so nothing inside them is focusable) and duplicate-id-aria (the copies are inert and
 * aria-hidden, so their ids are not reachable) — and the rest is axe's own caveat on text it
 * cannot judge: a one-character label ("it cannot decide whether a single digit is text"), a
 * keyboard badge drawn from glyphs, and text a scaled slide canvas partly covers. They are allowed
 * by id and reason, so any new kind of review item still fails the gate; the violation list has to
 * stay empty.
 */
export function isReviewedIncomplete(item) {
  if (item.id === 'aria-hidden-focus' || item.id === 'duplicate-id-aria') return true
  return item.id === 'color-contrast' && /too short to determine|partially overlaps|partially obscured|only non-text characters/.test(item.note)
}

/**
 * The share center's reads only mean something on an account that has something to draw, and CI's
 * fixture account is exactly the account that has neither: with no traffic its KPI cards paint no
 * delta badge, and with no tags the hub's sidebar draws no tag row (SH-103 measured both — the same
 * instance read 230/0 on one run and 222/7 on the next, the difference being the tag and the visit
 * the run before had left behind). So both gates put the two there themselves and assert they are
 * there before reading the surface, which turns two silent skips into two real reads.
 *
 * It converges rather than accumulating: the note, the share and the tag are found or created once
 * and reused by every later run against the same instance, and the visit is recorded only when the
 * account has no traffic at all. The point is that the cards have something to compare against, not
 * that the visit log grows by a row per gate run.
 */
export const SHARE_HUB_PROBE = {
  noteTitle: 'Share center probe',
  tagName: 'share-center-probe',
}

/**
 * The share center's own labels, in one place because two gates open the same surface through the
 * same controls: separate copies fail as "the control is gone" on whichever side was not updated
 * when the copy changes (SH-99). `nav` doubles as the shell's own Share entry — the workspace
 * header carries the same name for one note's settings, which is why every lookup below is scoped
 * to the shell's sidebar and never to the document.
 */
export const SHARE_LABELS = {
  nav: ['分享', 'Share'],
  hub: ['分享中心', 'Share Hub'],
  manage: ['管理所有分享', 'Manage All Shares'],
  categoryAll: ['全部分享', 'All Shares'],
}

/** The dialog, by the name the shell gives it in either locale. */
export const SHARE_HUB_DIALOG = SHARE_LABELS.hub
  .map((label) => `[role="dialog"][aria-label="${label}"]`)
  .join(',')

/** The shell's bottom-bar tab that opens the navigation pane at phone width, where the sidebar lives. */
export const NAVIGATION_LABELS = ['导航', 'Navigation']

// The Share entry is drawn either as the rail's icon (collapsed sidebar, an accessible name only) or
// as one of the quick-nav buttons (expanded, where a count badge rides in front of the label).
const SHARE_ENTRY_TEXT = /^(\d+|99\+)?(分享|Share)$/
const MOBILE_PANE = '.mobile-pane-layer[data-active]'

/**
 * Opens the share center down the path a person takes, and returns whether it opened.
 *
 * The list's own toolbar is the entry, and it only draws in the shared view, so the Share nav entry
 * comes first — through the shell's bottom bar at phone width, where the sidebar lives in the
 * navigation pane. The toolbar is waited for rather than slept on: switching the view is a route
 * change, and pressing before the control exists would report an unopened surface as a broken one.
 *
 * `fixture` puts the data the reads need behind the account before opening (the KPI badge needs
 * traffic, the sidebar's tag row needs a tag) and treats a fixture that did not take as a failure
 * rather than as a quieter surface. `category` presses one row of the category bar inside the
 * dialog, for the caller that measures a specific one — the All Shares row is where a count badge
 * sits on the accent tint.
 *
 * The control that opens the surface is marked as such for as long as it is the opener, which is
 * what a focus-return assertion needs to know where focus belongs when the dialog closes.
 */
export async function openShareCenter(page, { base, mobile = false, fixture = false, category = null } = {}) {
  if (fixture) {
    const seeded = await seedShareHubData({ page, base })
    if (seeded.views === 0) {
      throw new Error(`share center: the account still reads no traffic after the fixture (${JSON.stringify(seeded)})`)
    }
  }
  if (mobile) {
    await page.evaluate((labels) => {
      const tab = [...document.querySelectorAll('nav button')].find((item) => labels.some((label) => item.textContent.includes(label)))
      tab?.click()
    }, NAVIGATION_LABELS)
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
  }, { scope, labels: SHARE_LABELS.nav, pattern: SHARE_ENTRY_TEXT.source })
  if (!point) return false
  await page.mouse.click(point.x, point.y)
  const manage = await page.waitForFunction(({ labels, scope }) => {
    const root = scope ? document.querySelector(scope) : document
    return [...(root?.querySelectorAll('button') ?? [])]
      .some((item) => labels.includes(item.getAttribute('aria-label') ?? '') && item.getBoundingClientRect().width > 0)
  }, { timeout: 15_000 }, { labels: SHARE_LABELS.manage, scope: mobile ? MOBILE_PANE : '' }).then(() => true, () => false)
  if (!manage) return false
  const managePoint = await page.evaluate(({ labels, scope }) => {
    // The opener a focus-return assertion reads is the last one that was pressed, so the mark
    // travels with it — an older mark left behind would answer for the wrong control.
    for (const marked of document.querySelectorAll('[data-gate-opener]')) delete marked.dataset.gateOpener
    const root = scope ? document.querySelector(scope) : document
    const control = [...(root?.querySelectorAll('button') ?? [])]
      .find((item) => labels.includes(item.getAttribute('aria-label') ?? ''))
    if (!control) return null
    control.scrollIntoView({ block: 'center' })
    control.dataset.gateOpener = '1'
    const box = control.getBoundingClientRect()
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, { labels: SHARE_LABELS.manage, scope: mobile ? MOBILE_PANE : '' })
  if (!managePoint) return false
  await page.mouse.click(managePoint.x, managePoint.y)
  const opened = await page
    .waitForSelector(SHARE_HUB_DIALOG, { timeout: 15_000 })
    .then(() => true, () => false)
  if (!opened) return false
  await waitForPanelSettled(page, SHARE_HUB_DIALOG)
  if (category) {
    await clickButton(page, category)
  }
  return true
}

/**
 * The two probe tracks the music surfaces are measured on. They are titled rather than seeded by id
 * because a title is what the surfaces paint and what the reader looks for.
 */
export const MUSIC_PROBE = {
  titles: ['E2E Probe Audio One', 'E2E Probe Audio Two'],
}

/**
 * A one-second silent WAV: 8-bit mono at 8kHz, the smallest file the upload path accepts (it is a
 * real container the browser decodes, which is what makes the track playable in the grid and the
 * immersive player — the surfaces these probes exist for are measured with a current track).
 *
 * Silence, not music: this is a fixture, and a tone would make every measurement depend on what the
 * waveform happens to be.
 */
function probeWavBytes() {
  const samples = 8_000
  const header = [
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, // RIFF....WAVE
    0x66, 0x6d, 0x74, 0x20, 36, 0, 0, 0, // fmt  (16-byte PCM block)
    1, 0, 1, 0, // PCM, mono
    0x40, 0x1f, 0, 0, // 8000 Hz
    0x40, 0x1f, 0, 0, // byte rate
    1, 0, 8, 0, // block align, 8 bits
    0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0, // data
  ]
  const size = samples
  header[4] = (36 + size) & 0xff
  header[5] = ((36 + size) >> 8) & 0xff
  header[6] = ((36 + size) >> 16) & 0xff
  header[7] = ((36 + size) >> 24) & 0xff
  header[40] = size & 0xff
  header[41] = (size >> 8) & 0xff
  header[42] = (size >> 16) & 0xff
  header[43] = (size >> 24) & 0xff
  // 8-bit PCM is unsigned, so silence is 128 rather than 0.
  return [...header, ...new Array(size).fill(128)]
}

/**
 * Makes sure the account has the two probe tracks the music surfaces are measured on, and reports
 * what it did. Without them an empty library paints no view toggle at all, and the gate that went
 * looking for it crashed on the missing control instead of saying why (SH-100) — so the fixture is
 * a prerequisite the gate arranges for itself, the same way the share center seeds its visit.
 *
 * Uploading through the product's own endpoint is deliberate: a track written straight into D1
 * would have no object behind it, and the surfaces stream what they list. It stays idempotent — an
 * account that already has the titles uploads nothing, which also keeps the per-hour upload budget
 * out of the way of repeated runs.
 */
export async function seedMusicProbeTracks({ page }) {
  const listed = await apiCall(page, 'GET', '/api/music/library')
  const present = new Set((listed.data?.tracks ?? []).map((track) => track.title))
  const missing = MUSIC_PROBE.titles.filter((title) => !present.has(title))
  const bytes = probeWavBytes()
  for (const title of missing) {
    const result = await page.evaluate(async ({ title, bytes }) => {
      const form = new FormData()
      form.append('file', new File([new Uint8Array(bytes)], `${title}.wav`, { type: 'audio/wav' }))
      form.append('title', title)
      form.append('artist', 'Inkstone E2E')
      form.append('album', 'Contrast probe')
      form.append('durationMs', '1000')
      const response = await fetch('/api/music/tracks', {
        method: 'POST',
        headers: { 'X-Inkstone-Client': '1' },
        body: form,
      })
      return { status: response.status, body: (await response.text()).slice(0, 200) }
    }, { title, bytes })
    if (result.status !== 201) {
      throw new Error(`music probe fixture: uploading '${title}' answered ${result.status} (${result.body})`)
    }
  }
  // Read back through the endpoint the surfaces list from, so "the fixture is in place" is an
  // answer about the library rather than about the upload calls having returned 201.
  const after = await apiCall(page, 'GET', '/api/music/library')
  const seeded = new Set((after.data?.tracks ?? []).map((track) => track.title))
  return { uploaded: missing.length, found: MUSIC_PROBE.titles.filter((title) => seeded.has(title)) }
}

/**
 * The user agent the fixture's visit is recorded for. The product's bot list classifies
 * `HeadlessChrome` as a crawler — correctly — and a crawler visit is never written, so the row this
 * fixture exists to put in place would simply not be there.
 */
export const REAL_VISITOR_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/**
 * One call through the signed-in page's own session, with the header the app's transport sends. The
 * fixture and its read-back are not what either gate is watching; the surfaces are.
 */
export async function apiCall(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const response = await fetch(path, {
      method,
      headers: {
        'X-Inkstone-Client': '1',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return { status: response.status, data: await response.json().catch(() => null) }
  }, { method, path, body })
}

/** What the dashboard's own KPI strip reads, so "the fixture is in place" is asked of the endpoint
 * the surface under test uses rather than of the table behind it. */
export async function shareHubViews(page) {
  const response = await apiCall(page, 'GET', '/api/share/analytics/global?range=7d')
  return Number(response.data?.totalViews ?? 0)
}

/** Puts one shared, tagged note with one recorded visit behind the account, and reports what it
 * found. The caller asserts the result: a fixture that silently failed to be there is the blind spot
 * this exists to close, wearing the same green. */
export async function seedShareHubData({ page, base }) {
  const listed = await apiCall(page, 'GET', '/api/notes?limit=200')
  const found = (listed.data?.notes ?? []).find((item) => item.title === SHARE_HUB_PROBE.noteTitle)
  const note = found ?? (await apiCall(page, 'POST', '/api/notes', {
    title: SHARE_HUB_PROBE.noteTitle,
    content: `# ${SHARE_HUB_PROBE.noteTitle}\n\nThe share center's own reads need one visit and one tag to read.`,
  })).data
  // A create answers 201 for a new row and 200 for one that was already there (the tag is created
  // with the keep-existing policy), so the fixture stays idempotent across runs.
  const tag = await apiCall(page, 'POST', '/api/share/tags', { name: SHARE_HUB_PROBE.tagName })
  const share = await apiCall(page, 'POST', `/api/share/${note?.id ?? ''}`, { tags: [SHARE_HUB_PROBE.tagName] })
  const slug = share.data?.share?.slug ?? ''
  let views = await shareHubViews(page)
  if (views === 0 && slug) {
    // Two things about this call. It is the visit-recording one: the share page's shell records
    // nothing, the row is written when the page's own client asks for the note — a plain GET of
    // `/s/:slug` leaves the log empty. And it goes out from here rather than from the owner's page,
    // because a visit is recorded for the user agent that asks and a page cannot present another
    // one: from the browser the request would look like the owner revisiting their own link.
    await fetch(`${base}/api/public/${slug}`, {
      method: 'POST',
      headers: { 'User-Agent': REAL_VISITOR_UA, 'X-Inkstone-Client': '1', 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((response) => response.text())
      .catch(() => '')
    // The row is written after the response is sent (the worker hands `recordShareVisit` to
    // `waitUntil`), so it is polled rather than assumed to be there on the first read.
    for (let attempt = 0; attempt < 20 && views === 0; attempt++) {
      await sleep(500)
      views = await shareHubViews(page)
    }
  }
  return { note: listed.status, share: share.status, tag: tag.status, slug, views }
}
