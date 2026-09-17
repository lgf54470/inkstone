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
