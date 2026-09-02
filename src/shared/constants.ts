import type {
  AccentName,
  AppLocale,
  BackgroundName,
  BackupSchedule,
  EditorLayout,
  EditorSettings,
  ProseFont,
  ProseWidth,
  ThemePref,
  UiDensity,
  UserSettings,
  ViewKind,
} from './types'
import { version as packageVersion } from '../../package.json'

export const APP_VERSION = packageVersion
export const GITHUB_REPOSITORY_URL = 'https://github.com/shuaiplus/inkstone'
export const GITHUB_PACKAGE_URL =
  'https://raw.githubusercontent.com/shuaiplus/inkstone/refs/heads/main/package.json'
export const CLIENT_HEADER = 'X-Inkstone-Client'
export const SESSION_COOKIE = '__Host-inkstone_session'
export const LEGACY_SESSION_COOKIE = 'inkstone_session'

/**
 * Session lifetime design (sliding window):
 * - `SESSION_TTL_MS` (90d): absolute cap. A session row/cookie never outlives 90 days,
 *   bounding the window in which a stolen session token stays usable.
 * - `SESSION_RENEW_BEFORE_MS` (45d = TTL/2): renewal threshold. On an authenticated
 *   request, if less than this much TTL remains, the session is extended back to the
 *   full 90 days (see middleware/auth.ts and lib/session-store.ts).
 *
 * Trade-offs: renewal only happens for requests that already presented a valid
 * session, so an abandoned session dies within at most 90 days (no idle-forever
 * sessions, maintenance sweeps the rows), while an active user never gets logged out
 * as long as they authenticate at least once per 45 days. The half-life threshold
 * also bounds write amplification: each session triggers at most one DB renewal
 * write per 45 days of activity. The 45-day window is generous enough to survive
 * the app's offline period (offline edits are queued locally and flushed on
 * reconnect, which needs a still-valid session) yet short enough that a freshly
 * stolen cookie's remaining lifetime stays bounded.
 */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
export const SESSION_RENEW_BEFORE_MS = SESSION_TTL_MS / 2


export const LIMITS = {
  passwordMaxLength: 128,
  titleMaxLength: 512,
  contentMaxBytes: 2 * 1024 * 1024,
  folderNameMaxLength: 120,
  tagNameMaxLength: 60,
  tagSelectionMax: 20,
  folderDepthMax: 12,
  attachmentMaxBytes: 25 * 1024 * 1024,
  attachmentQuotaBytes: 1024 * 1024 * 1024,
  attachmentUploadsPerHour: 100,
  importFilesMax: 500,
  importUploadMaxBytes: 64 * 1024 * 1024,
  importBundleMaxBytes: 32 * 1024 * 1024,
  importArchiveEntriesMax: 2500,
  importArchiveExpandedMaxBytes: 80 * 1024 * 1024,
  versionsPerNote: 50,
  backupRunsKept: 50,
  backupTargetsMax: 12,
  changeLogKept: 5000,
  syncBatchSize: 500,
  searchLimit: 50,

  ftsContentChars: 200_000,
} as const

export const ACCENTS: { name: AccentName; swatch: string; foreground: string }[] = [
  { name: 'cinnabar', swatch: 'oklch(58% 0.15 31)', foreground: 'white' },
  { name: 'indigo', swatch: 'oklch(62% 0.16 252)', foreground: 'white' },
  { name: 'celadon', swatch: 'oklch(66% 0.13 150)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'amber', swatch: 'oklch(76% 0.15 95)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'terracotta', swatch: 'oklch(68% 0.1 205)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'wisteria', swatch: 'oklch(62% 0.16 300)', foreground: 'white' },
  { name: 'graphite', swatch: 'oklch(55% 0.035 250)', foreground: 'white' },
]

export const PROSE_WIDTH_CH: Record<string, string> = {
  narrow: '58ch',
  normal: '72ch',
  wide: '88ch',
  full: '100%',
}

export const VIEW_KINDS: ViewKind[] = ['all', 'recent', 'starred', 'unfiled', 'archived', 'trash', 'folder', 'tag']

/**
 * Default template inserted at the top of new notes. Keep placeholders ASCII:
 * they are filled in at creation time with the localized note title and the
 * current date/time. First line must be `---` (a leading blank line would
 * prevent the front matter from being parsed).
 */
export const DEFAULT_NEW_NOTE_TEMPLATE = `---
title: {{title}}
createdAt: {{createdAt}}
tags: []
aliases:
  - ''
---

`

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
  },
  backup: {
    schedule: 'sixHourly',
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
}

export const BACKUP_INTERVALS: Record<string, number> = {
  off: 0,
  hourly: 60 * 60 * 1000,
  sixHourly: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}

const THEMES = ['light', 'dark', 'system'] as const
const LANGUAGES = ['zh-CN', 'en-US'] as const
const ACCENT_NAMES = ACCENTS.map((accent) => accent.name)
const BACKGROUND_NAMES = ['paper', 'white'] as const
const DENSITIES = ['comfortable', 'compact'] as const
const PROSE_FONTS = ['sans', 'serif'] as const
const PROSE_WIDTHS = ['narrow', 'normal', 'wide', 'full'] as const
const EDITOR_FONTS = ['mono', 'sans'] as const
const EDITOR_LAYOUTS = ['edit', 'split', 'preview'] as const
const BACKUP_SCHEDULES = ['off', 'hourly', 'sixHourly', 'daily'] as const


const SETTINGS_SECTIONS = ['appearance', 'editor', 'preview', 'backup', 'sync', 'notes'] as const
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
  const combined: Record<string, unknown> = { ...previous }
  let touched = false
  for (const section of SETTINGS_SECTIONS) {
    const patched = asRecord(incoming[section])
    if (Object.keys(patched).length === 0) continue
    touched = true
    combined[section] = mergeSettingsSection(section, asRecord(combined[section]), patched)
  }
  if (!touched) return previous as unknown as UserSettings
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

function mergeSettingsSection(
  section: SettingsSection,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): unknown {
  switch (section) {
    case 'appearance':
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
    case 'editor':
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
    case 'preview':
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
      }
    case 'backup':
      return {
        schedule: enumValue(patch.schedule, BACKUP_SCHEDULES, current.schedule as BackupSchedule),
      }
    case 'sync':
      return {
        realtime: booleanValue(patch.realtime, current.realtime as boolean),
        pollIntervalMs: integerInRange(
          patch.pollIntervalMs,
          5000,
          120_000,
          current.pollIntervalMs as number,
        ),
      }
    case 'notes':
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
