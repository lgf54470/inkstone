export type ThemePref = 'light' | 'dark' | 'system'

export type AppLocale = 'zh-CN' | 'en-US'

export type AccentName = 'cinnabar' | 'indigo' | 'celadon' | 'amber' | 'terracotta' | 'wisteria' | 'graphite'

export type BackgroundName = 'paper' | 'white'

export type UiDensity = 'comfortable' | 'compact'

export type ProseFont = 'sans' | 'serif'

export type ProseWidth = 'narrow' | 'normal' | 'wide' | 'full'

export type EditorLayout = 'edit' | 'live' | 'split' | 'preview'

export type BackupSchedule = 'off' | 'hourly' | 'sixHourly' | 'daily'

export interface AppearanceSettings {
  language: AppLocale
  theme: ThemePref
  accent: AccentName
  background: BackgroundName
  density: UiDensity
  proseFont: ProseFont
  proseSize: number
  proseWidth: ProseWidth
  proseLineHeight: number
}

export interface EditorSettings {
  fontSize: number
  fontFamily: 'mono' | 'sans'
  lineNumbers: boolean
  typewriter: boolean
  focusMode: boolean
  spellcheck: boolean
  showToolbar: boolean
  tabSize: number
  autoSaveDelay: number
}

export type PinnedWindowSizeName = 'small' | 'medium' | 'large' | 'custom'

export interface PreviewSettings {
  layout: EditorLayout
  syncScroll: boolean
  showToc: boolean
  math: boolean
  mermaid: boolean
  codeBlockCollapse: boolean
  codeBlockCollapseLines: number
  linkHover: boolean
  linkHoverDelayMs: number
  linkPreviewLength: number
  /** Load external (https) images in rendered notes. Off by default: external
   *  images are replaced with a blocked placeholder (renderer-level), and the
   *  server drops `https:` from CSP `img-src` while it is off — so raw-HTML
   *  images in notes stay blocked on the app page and are ALWAYS blocked on
   *  share pages (/s/*), where visitors never opt in. */
  externalImages: boolean
  pinnedWindowSize: PinnedWindowSizeName
  pinnedWindowWidth: number
  pinnedWindowHeight: number
  /** Name of the whiteboard library the boards open; `default` is the reserved one. */
  boardLibrary: string
}

export interface BackupSettings {
  schedule: BackupSchedule
  musicTargetId: string | null
  musicDir: string
}

export interface SyncSettings {
  realtime: boolean
  pollIntervalMs: number
}

export interface NoteSettings {
  newNoteTemplate: string
  syncTitleToFrontMatter: boolean
  syncFrontMatterTitle: boolean
  /** Tag(s, comma-separated) that file notes into the sidebar to-do tree; null falls back to the locale default. */
  todoTag: string | null
}

/** Share-center preferences the server acts on, not just the UI. */
export interface ShareSettings {
  /**
   * Days a visit log row survives before the maintenance cron deletes it;
   * 0 keeps every row. It has to live here rather than in the browser so the
   * sweep runs whether or not the owner ever opens the app again.
   */
  visitLogRetentionDays: number
  /**
   * Days without a visit after which a link counts as stale (SH-70); 0 turns
   * the report off. What "nobody reads this any more" means depends on how
   * busy the site is, so it is the owner's number — and the dashboard query
   * reads it from here rather than from the request.
   */
  staleLinkDays: number
  /**
   * Whether a visit may record the `?ref=` marker its URL carried (ADR-0004). On by default
   * because what it collects is text the owner itself put in the link, not anything about the
   * visitor — and off means the write path stores no marker at all, not that the dashboard
   * hides one it already has.
   */
  collectChannel: boolean
}

/** Blog-center preferences the server acts on, not just the UI. */
export interface BlogSettings {
  /**
   * Days a `blog_visits` row survives before the maintenance cron deletes it;
   * 0 keeps every row. Same reasoning as the share twin.
   */
  visitLogRetentionDays: number
}

export interface UserSettings {
  appearance: AppearanceSettings
  editor: EditorSettings
  preview: PreviewSettings
  backup: BackupSettings
  sync: SyncSettings
  notes: NoteSettings
  share: ShareSettings
  blog: BlogSettings
}
