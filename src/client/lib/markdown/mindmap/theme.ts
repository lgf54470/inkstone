/**
 * What a ```mindmap body may say about its own palette, and how that meets the
 * app's light/dark setting.
 *
 * Precedence: the body wins. A document that names a theme keeps it — the note is
 * the more specific statement, and the map was written that way on purpose — while
 * the app's appearance setting is what a body that names nothing draws with
 * (`"auto"`, or no `theme` field at all). Switching the app theme therefore
 * repaints the maps that follow it and leaves the pinned ones alone, and the same
 * rule holds everywhere a map is drawn: the preview, the full screen view, the
 * share page, the slides and every export all resolve one of these choices.
 *
 * The field is JSON-only: the outline format has nowhere to put it.
 */

/**
 * The palette a block draws with: one of the app's two, or the body's own theme
 * object used as written (mind-elixir's own shape — `name`, `type`, `palette`,
 * `cssVar` — which is what the library's data files carry, so pasting one keeps
 * its palette). Leaving fields out is fine: the object is laid over the base its
 * `type` names, which is what keeps a theme without a `palette` from throwing.
 */
export type MindmapPalette =
  | { kind: 'light' }
  | { kind: 'dark' }
  | { kind: 'custom'; theme: unknown }

/** What a body asks for: its own palette, or `app` to follow the appearance setting. */
export type MindmapThemeChoice = { kind: 'app' } | MindmapPalette

/** What a body draws with when it names no palette: the app's own setting. */
export const APP_THEME_CHOICE: MindmapThemeChoice = { kind: 'app' }

/** The name a note may use for the default, spelled out where a reader will look for it. */
const FOLLOW_APP_NAMES = ['auto', 'app']

/**
 * Reads the body's `theme` field. A name it does not know is reported rather than
 * ignored: the block shows its source and says what to write instead, which is
 * what an unrecognised value deserves — a map drawn in the wrong palette silently
 * would be worse than one that says why it did not draw.
 */
export function readThemeChoice(value: unknown): { choice: MindmapThemeChoice } | { error: string } {
  if (value === undefined || value === null) return { choice: APP_THEME_CHOICE }
  if (typeof value === 'string') {
    const name = value.trim().toLowerCase()
    if (name === 'light') return { choice: { kind: 'light' } }
    if (name === 'dark') return { choice: { kind: 'dark' } }
    if (FOLLOW_APP_NAMES.includes(name)) return { choice: APP_THEME_CHOICE }
    return { error: themeFieldError() }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return { choice: { kind: 'custom', theme: value } }
  return { error: themeFieldError() }
}

function themeFieldError(): string {
  return '"theme" must be "light", "dark", "auto" or a theme object'
}

/**
 * The palette to draw with: the body's own when it named one, the app's setting
 * otherwise. This is the whole rule, in one place — the vendor only maps the
 * result onto the library's theme objects.
 */
export function resolveThemeChoice(choice: MindmapThemeChoice, appDark: boolean): MindmapPalette {
  if (choice.kind === 'app') return { kind: appDark ? 'dark' : 'light' }
  return choice
}
