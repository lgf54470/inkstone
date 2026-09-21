import { ACCENTS, BOARD_LIBRARY_DEFAULT_NAME, DEFAULT_NEW_NOTE_TEMPLATE, LIMITS } from './constants'
import { normalizeMusicDir } from './music-path'
import type {
  AccentName,
  AppLocale,
  BackgroundName,
  BackupSchedule,
  EditorLayout,
  EditorSettings,
  PreviewSettings,
  ProseFont,
  ProseWidth,
  ThemePref,
  UiDensity,
  UserSettings,
} from './types'

/** The retention the cron applies when a user never chose one. */
export const VISIT_LOG_RETENTION_DEFAULT_DAYS = 30
/** A decade: beyond this a sweep is indistinguishable from "keep forever". */
export const VISIT_LOG_RETENTION_MAX_DAYS = 3_650

/** A quarter: a link unread for that long is worth asking about, and 0 means "do not ask". */
export const STALE_LINK_DEFAULT_DAYS = 90
/** The same ceiling as retention: past a decade the question stops meaning anything. */
export const STALE_LINK_MAX_DAYS = 3_650
/** The thresholds the hygiene control offers, in days; 0 is the off switch. */
export const STALE_LINK_DAY_OPTIONS = [0, 30, 90, 180, 365] as const

export const DEFAULT_SETTINGS: UserSettings = {
  appearance: {
    language: 'zh-CN',
    theme: 'system',
    accent: 'cinnabar',
    background: 'paper',
    density: 'comfortable',
    proseFont: 'sans',
    proseSize: 16,
    proseWidth: 'normal',
    proseLineHeight: 1.65,
  },
  editor: {
    fontSize: 15,
    fontFamily: 'mono',
    lineNumbers: false,
    typewriter: false,
    focusMode: false,
    spellcheck: false,
    showToolbar: true,
    tabSize: 2,
    autoSaveDelay: 500,
  },
  preview: {
    layout: 'split',
    syncScroll: true,
    showToc: true,
    math: true,
    mermaid: true,
    codeBlockCollapse: true,
    codeBlockCollapseLines: 24,
    linkHover: true,
    linkHoverDelayMs: 320,
    linkPreviewLength: 4000,
    // External https images are blocked by default (renderer placeholder + CSP
    // `img-src` without `https:`); opt in per user. Share pages stay blocked
    // regardless of this value.
    externalImages: false,
    pinnedWindowSize: 'medium',
    pinnedWindowWidth: 460,
    pinnedWindowHeight: 520,
    boardLibrary: BOARD_LIBRARY_DEFAULT_NAME,
  },
  backup: {
    schedule: 'sixHourly',
    musicTargetId: null,
    musicDir: 'music',
  },
  sync: {
    realtime: true,
    pollIntervalMs: 15_000,
  },
  notes: {
    newNoteTemplate: DEFAULT_NEW_NOTE_TEMPLATE,
    syncTitleToFrontMatter: true,
    syncFrontMatterTitle: true,
    todoTag: null,
  },
  share: {
    visitLogRetentionDays: VISIT_LOG_RETENTION_DEFAULT_DAYS,
    staleLinkDays: STALE_LINK_DEFAULT_DAYS,
    collectChannel: true,
  },
  blog: {
    visitLogRetentionDays: VISIT_LOG_RETENTION_DEFAULT_DAYS,
  },
}

const THEMES = ['light', 'dark', 'system'] as const
const LANGUAGES = ['zh-CN', 'en-US'] as const
const ACCENT_NAMES = ACCENTS.map((accent) => accent.name)
const BACKGROUND_NAMES = ['paper', 'white'] as const
const DENSITIES = ['comfortable', 'compact'] as const
const PROSE_FONTS = ['sans', 'serif'] as const
const PROSE_WIDTHS = ['narrow', 'normal', 'wide', 'full'] as const
const EDITOR_FONTS = ['mono', 'sans'] as const
const EDITOR_LAYOUTS = ['edit', 'live', 'split', 'preview'] as const
const BACKUP_SCHEDULES = ['off', 'hourly', 'sixHourly', 'daily'] as const
const PINNED_WINDOW_SIZES = ['small', 'medium', 'large', 'custom'] as const

/** Built-in floating-window sizes; `custom` reads width/height from the settings. */
export const PINNED_WINDOW_PRESETS: Record<'small' | 'medium' | 'large', { width: number; height: number }> = {
  small: { width: 340, height: 380 },
  medium: { width: 460, height: 520 },
  large: { width: 620, height: 680 },
}
export const PINNED_WINDOW_WIDTH_RANGE = [260, 1200] as const
export const PINNED_WINDOW_HEIGHT_RANGE = [140, 2000] as const

const SETTINGS_SECTIONS = ['appearance', 'editor', 'preview', 'backup', 'sync', 'notes', 'share', 'blog'] as const
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export function mergeSettings(partial: unknown): UserSettings {
  return mergeSettingsPatch(cloneDefaultSettings(), partial)
}

function cloneDefaultSettings(): UserSettings {
  return {
    appearance: { ...DEFAULT_SETTINGS.appearance },
    editor: { ...DEFAULT_SETTINGS.editor },
    preview: { ...DEFAULT_SETTINGS.preview },
    backup: { ...DEFAULT_SETTINGS.backup },
    sync: { ...DEFAULT_SETTINGS.sync },
    notes: { ...DEFAULT_SETTINGS.notes },
    share: { ...DEFAULT_SETTINGS.share },
    blog: { ...DEFAULT_SETTINGS.blog },
  }
}

/**
 * Merge a partial patch into the current settings.
 *
 * Sections that the patch does not touch are passed through by reference,
 * so subscribers observing a specific section (e.g. `settings.editor`) are
 * not re-rendered when an unrelated section changes.
 */
export function mergeSettingsPatch(current: unknown, patch: unknown): UserSettings {
  const previous = asRecord(current)
  const incoming = asRecord(patch)
  const defaults = cloneDefaultSettings()
  const combined: Record<string, unknown> = { ...previous }
  let isTouched = false
  for (const section of SETTINGS_SECTIONS) {
    if (!combined[section]) {
      combined[section] = defaults[section]
      isTouched = true
    }
    const patched = asRecord(incoming[section])
    if (Object.keys(patched).length === 0) continue
    isTouched = true
    combined[section] = mergeSettingsSection(section, asRecord(combined[section]), patched)
  }
  if (!isTouched) return previous as unknown as UserSettings
  return combined as unknown as UserSettings
}

/**
 * Guards the referential-stability contract of mergeSettingsPatch: sections
 * the patch did not touch must keep their object identity, otherwise narrow
 * store subscriptions silently regress into full-app re-renders on every
 * settings change.
 */
export function assertUnchangedSettingsSections(
  current: UserSettings,
  next: UserSettings,
  patch: unknown,
): void {
  const incoming = asRecord(patch)
  for (const section of SETTINGS_SECTIONS) {
    if (Object.keys(asRecord(incoming[section])).length > 0) continue
    if (current[section] !== next[section]) {
      throw new Error(`untouched settings section "${section}" was rebuilt; keep it referentially stable`)
    }
  }
}

function mergeAppearance(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    language: enumValue(patch.language, LANGUAGES, current.language as AppLocale),
    theme: enumValue(patch.theme, THEMES, current.theme as ThemePref),
    accent: enumValue(patch.accent, ACCENT_NAMES, current.accent as AccentName),
    background: enumValue(
      patch.background,
      BACKGROUND_NAMES,
      current.background as BackgroundName,
    ),
    density: enumValue(patch.density, DENSITIES, current.density as UiDensity),
    proseFont: enumValue(patch.proseFont, PROSE_FONTS, current.proseFont as ProseFont),
    proseSize: integerInRange(patch.proseSize, 13, 22, current.proseSize as number),
    proseWidth: enumValue(patch.proseWidth, PROSE_WIDTHS, current.proseWidth as ProseWidth),
    proseLineHeight: numberInRange(
      patch.proseLineHeight,
      1.4,
      2.2,
      current.proseLineHeight as number,
    ),
  }
}

function mergeEditor(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    fontSize: integerInRange(patch.fontSize, 12, 22, current.fontSize as number),
    fontFamily: enumValue(
      patch.fontFamily,
      EDITOR_FONTS,
      current.fontFamily as EditorSettings['fontFamily'],
    ),
    lineNumbers: booleanValue(patch.lineNumbers, current.lineNumbers as boolean),
    typewriter: booleanValue(patch.typewriter, current.typewriter as boolean),
    focusMode: booleanValue(patch.focusMode, current.focusMode as boolean),
    spellcheck: booleanValue(patch.spellcheck, current.spellcheck as boolean),
    showToolbar: booleanValue(patch.showToolbar, current.showToolbar as boolean),
    tabSize: patch.tabSize === 4 ? 4 : patch.tabSize === 2 ? 2 : (current.tabSize as number),
    autoSaveDelay: integerInRange(
      patch.autoSaveDelay,
      200,
      3000,
      current.autoSaveDelay as number,
    ),
  }
}

function mergePreview(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    layout: enumValue(patch.layout, EDITOR_LAYOUTS, current.layout as EditorLayout),
    syncScroll: booleanValue(patch.syncScroll, current.syncScroll as boolean),
    showToc: booleanValue(patch.showToc, current.showToc as boolean),
    math: booleanValue(patch.math, current.math as boolean),
    mermaid: booleanValue(patch.mermaid, current.mermaid as boolean),
    codeBlockCollapse: booleanValue(
      patch.codeBlockCollapse,
      current.codeBlockCollapse as boolean,
    ),
    codeBlockCollapseLines: integerInRange(
      patch.codeBlockCollapseLines,
      8,
      100,
      current.codeBlockCollapseLines as number,
    ),
    linkHover: booleanValue(patch.linkHover, current.linkHover as boolean),
    linkHoverDelayMs: integerInRange(
      patch.linkHoverDelayMs,
      150,
      1000,
      current.linkHoverDelayMs as number,
    ),
    externalImages: booleanValue(
      patch.externalImages,
      current.externalImages as boolean,
    ),
    linkPreviewLength: integerInRange(
      patch.linkPreviewLength,
      300,
      8000,
      current.linkPreviewLength as number,
    ),
    boardLibrary: stringValue(patch.boardLibrary, current.boardLibrary as string, LIMITS.boardLibraryNameMaxLength),
    ...mergePinnedWindow(current, patch),
  }
}

function mergePinnedWindow(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    pinnedWindowSize: enumValue(
      patch.pinnedWindowSize,
      PINNED_WINDOW_SIZES,
      current.pinnedWindowSize as PreviewSettings['pinnedWindowSize'],
    ),
    pinnedWindowWidth: integerInRange(
      patch.pinnedWindowWidth,
      PINNED_WINDOW_WIDTH_RANGE[0],
      PINNED_WINDOW_WIDTH_RANGE[1],
      current.pinnedWindowWidth as number,
    ),
    pinnedWindowHeight: integerInRange(
      patch.pinnedWindowHeight,
      PINNED_WINDOW_HEIGHT_RANGE[0],
      PINNED_WINDOW_HEIGHT_RANGE[1],
      current.pinnedWindowHeight as number,
    ),
  }
}

function mergeBackup(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    schedule: enumValue(patch.schedule, BACKUP_SCHEDULES, current.schedule as BackupSchedule),
    musicTargetId: nullableStringValue(patch.musicTargetId, current.musicTargetId as string | null, 64),
    musicDir: normalizeMusicDir(patch.musicDir, current.musicDir as string),
  }
}

function mergeSync(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    realtime: booleanValue(patch.realtime, current.realtime as boolean),
    pollIntervalMs: integerInRange(
      patch.pollIntervalMs,
      5000,
      120_000,
      current.pollIntervalMs as number,
    ),
  }
}

function mergeNotes(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    newNoteTemplate: stringValue(
      patch.newNoteTemplate,
      current.newNoteTemplate as string,
      4096,
    ),
    syncTitleToFrontMatter: booleanValue(
      patch.syncTitleToFrontMatter,
      current.syncTitleToFrontMatter as boolean,
    ),
    syncFrontMatterTitle: booleanValue(
      patch.syncFrontMatterTitle,
      current.syncFrontMatterTitle as boolean,
    ),
    todoTag: nullableStringValue(
      patch.todoTag,
      current.todoTag as string | null,
      256,
    ),
  }
}

/**
 * The share section adds the hygiene threshold to the visit-log knob. An account that stored its
 * settings before this field existed has no value to fall back on, so the shipped default — not
 * `undefined` — is what an absent one becomes.
 */
function mergeShare(current: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  return {
    ...mergeVisitLogRetention(current, patch),
    staleLinkDays: integerInRange(
      patch.staleLinkDays,
      0,
      STALE_LINK_MAX_DAYS,
      (current.staleLinkDays ?? STALE_LINK_DEFAULT_DAYS) as number,
    ),
    // Collecting markers is on for accounts that predate the field: the stored settings of such an
    // account have no value to fall back on, and the shipped default is the intended behaviour.
    collectChannel: booleanValue(
      patch.collectChannel,
      (current.collectChannel ?? true) as boolean,
    ),
  }
}

/**
 * Both visit-log surfaces keep the same single knob, so the same cleaner backs
 * `share` and `blog`: 0 means "keep forever" and must survive as 0.
 */
function mergeVisitLogRetention(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    visitLogRetentionDays: integerInRange(
      patch.visitLogRetentionDays,
      0,
      VISIT_LOG_RETENTION_MAX_DAYS,
      current.visitLogRetentionDays as number,
    ),
  }
}

function mergeSettingsSection(
  section: SettingsSection,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): unknown {
  switch (section) {
    case 'appearance':
      return mergeAppearance(current, patch)
    case 'editor':
      return mergeEditor(current, patch)
    case 'preview':
      return mergePreview(current, patch)
    case 'backup':
      return mergeBackup(current, patch)
    case 'sync':
      return mergeSync(current, patch)
    case 'notes':
      return mergeNotes(current, patch)
    case 'share':
      return mergeShare(current, patch)
    case 'blog':
      return mergeVisitLogRetention(current, patch)
  }
}

function nullableStringValue(
  value: unknown,
  fallback: string | null,
  maxLength: number,
): string | null {
  if (value === null)
    return null
  if (typeof value !== 'string')
    return fallback
  const trimmed = value.trim()
  if (!trimmed)
    return null
  return trimmed.slice(0, maxLength)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringValue(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' ? value.slice(0, maxLength) : fallback
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(numberInRange(value, min, max, fallback))
}
