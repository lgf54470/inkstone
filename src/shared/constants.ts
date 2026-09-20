import type { AccentName, ViewKind } from './types'
import { version as packageVersion } from '../../package.json'

export const APP_VERSION = packageVersion
export const GITHUB_REPOSITORY_URL = 'https://github.com/shuaiplus/inkstone'
export const GITHUB_PACKAGE_URL =
  'https://raw.githubusercontent.com/shuaiplus/inkstone/refs/heads/main/package.json'
// Blog settings fallback used across the worker default, the demo seed, and
// every client consumer that renders links before the user configures a URL.
export const DEFAULT_BLOG_FRONTEND_URL = 'http://localhost:4321'
export const COPY_FEEDBACK_MS = 2000
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
  sharePasscodeMinLength: 8,
  shareSlugMinLength: 6,
  shareSlugMaxLength: 64,
  titleMaxLength: 512,
  shareReferrerMaxLength: 512,
  contentMaxBytes: 2 * 1024 * 1024,
  folderNameMaxLength: 120,
  tagNameMaxLength: 60,
  tagSelectionMax: 20,
  folderDepthMax: 12,
  attachmentMaxBytes: 25 * 1024 * 1024,
  attachmentQuotaBytesR2: 10 * 1024 * 1024 * 1024,
  attachmentQuotaBytesKv: 1024 * 1024 * 1024,
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

  musicTrackMaxBytes: 64 * 1024 * 1024,
  musicQuotaBytes: 4 * 1024 * 1024 * 1024,
  musicUploadsPerHour: 200,
  musicWebdavRequestsPerHour: 300,
  musicPlayEventsPerHour: 600,
  musicLibraryWritesPerHour: 1000,
  musicCoverLookupsPerHour: 60,
  musicLyricLookupsPerHour: 60,
  // Anonymous readers of a published library are metered by client IP, per surface:
  // the listing is one query per open, while a player issues a stream request per
  // range it needs, so playback gets the wider allowance.
  musicPublicLibraryPerHour: 120,
  musicPublicStreamsPerHour: 600,
  musicPublicCoversPerHour: 600,
  musicTitleMaxLength: 200,
  musicArtistMaxLength: 200,
  musicAlbumMaxLength: 200,
  musicLyricMaxBytes: 128 * 1024,
  musicPlaylistNameMaxLength: 120,
  musicPlaylistDescriptionMaxLength: 500,
  musicPlaylistItemsMax: 5000,
  // One batch request may carry at most this many ids; the client splits a bigger
  // selection into several requests instead of sending one the server must reject.
  musicBatchItemsMax: 500,
  // How many ids a single D1 statement may carry: the platform binds at most 100 parameters,
  // and the user id occupies the first slot. One request is executed as several such statements.
  musicSqlIdChunkMax: 96,

  boardLibraryMaxBytes: 8 * 1024 * 1024,
  boardLibraryNameMaxLength: 60,
} as const

/** The library a board starts from: a named one like any other, shown as the default. */
export const BOARD_LIBRARY_DEFAULT_NAME = 'default'

export const ACCENTS: { name: AccentName; swatch: string; foreground: string }[] = [
  { name: 'cinnabar', swatch: 'oklch(58% 0.15 31)', foreground: 'white' },
  { name: 'indigo', swatch: 'oklch(62% 0.16 252)', foreground: 'white' },
  { name: 'celadon', swatch: 'oklch(66% 0.13 150)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'amber', swatch: 'oklch(76% 0.15 95)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'terracotta', swatch: 'oklch(68% 0.1 205)', foreground: 'oklch(16% 0.008 265)' },
  { name: 'wisteria', swatch: 'oklch(62% 0.16 300)', foreground: 'white' },
  { name: 'graphite', swatch: 'oklch(55% 0.035 250)', foreground: 'white' },
]


export const VIEW_KINDS: ViewKind[] = ['all', 'recent', 'starred', 'pinned', 'shared', 'published', 'unfiled', 'archived', 'trash', 'folder', 'tag', 'untagged']

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

export const BACKUP_INTERVALS: Record<string, number> = {
  off: 0,
  hourly: 60 * 60 * 1000,
  sixHourly: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}