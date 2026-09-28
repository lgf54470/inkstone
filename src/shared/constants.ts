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


/**
 * How close a share's expiry has to be before the list calls it "expiring soon".
 * The category, the row's warning tone and the batch-extension flow all read this
 * one number, so "soon" means the same thing in each of them.
 */
export const EXPIRING_SOON_DAYS = 7

// FB-F7: the bitrates the aggregate upstream understands, in the order the setting lists them.
// The worker has held this list as its own whitelist all along; the client reads the same tuple,
// so a tier the setting can store can never be one the proxy refuses.
export const MUSIC_PROVIDER_QUALITIES = [128, 192, 320, 740, 999] as const
export type MusicProviderQuality = (typeof MUSIC_PROVIDER_QUALITIES)[number]
export const MUSIC_PROVIDER_DEFAULT_QUALITY: MusicProviderQuality = 320

export const LIMITS = {
  passwordMaxLength: 128,
  sharePasscodeMinLength: 8,
  shareSlugMinLength: 6,
  shareSlugMaxLength: 64,
  titleMaxLength: 512,
  shareReferrerMaxLength: 512,
  // A plausible marker is at most 32 chars; this cap only stops a body from carrying a novel,
  // and like the referrer cap it answers 400 rather than truncating what the caller sent.
  shareChannelMaxLength: 128,
  contentMaxBytes: 2 * 1024 * 1024,
  folderNameMaxLength: 120,
  tagNameMaxLength: 60,
  tagSelectionMax: 20,
  folderDepthMax: 12,
  attachmentMaxBytes: 25 * 1024 * 1024,
  attachmentQuotaBytesR2: 10 * 1024 * 1024 * 1024,
  attachmentQuotaBytesKv: 1024 * 1024 * 1024,
  attachmentUploadsPerHour: 100,
  // Each delete is an R2 head + delete + a ledger write, and the client only fires them one at a
  // time; the budget exists to bound a scripted hammer, not any hand-driven cleanup.
  attachmentDeletesPerHour: 300,
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
  // Position saves ride a heartbeat while music plays, so they would starve the library-write
  // budget if they shared its key; they still deserve their own ceiling.
  musicPlaybackSavesPerHour: 2000,
  musicCoverLookupsPerHour: 60,
  musicLyricLookupsPerHour: 60,
  // A lyric search scans the whole table with LIKE; the id list it ships back stays
  // bounded no matter how many songs repeat the same chorus.
  musicLyricSearchMaxIds: 50,
  // A one-character lyric probe is all noise; two characters already answer real
  // queries, and the server LIKE scan costs the same at any width.
  musicLyricQueryMinLength: 2,
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
  musicAlistNameMaxLength: 100,
  musicAlistUrlMaxLength: 2048,
  musicAlistRootPathMaxLength: 1024,
  musicAlistTokenMaxLength: 512,
  musicAlistListEntryMax: 500,
  musicPodcastFetchesPerHour: 60,
  musicPodcastFeedMaxBytes: 2 * 1024 * 1024,
  musicPodcastEpisodeMax: 500,
  musicPodcastCacheTtlMs: 10 * 60 * 1000,
  musicProviderRequestsPerHour: 120,
  // FB2-PF1: the catalogue's own pictures are a browsing cost, not a playback one. A page of hits
  // asks for one picture each, so charging them to the family above spent the allowance that
  // resolves playable URLs — two pages of browsing could refuse the next play. This family is sized
  // for scrolling (a page of hits × several pages an hour) and its own key is what keeps the two
  // costs from trading places: the artwork route never draws on `provider`, and resolving a URL
  // never draws on this one.
  musicProviderArtworkPerHour: 600,
  musicProviderBodyMaxBytes: 1024 * 1024,
  // FB-S1: how long an upstream may take to *start* answering a stream. The transfer itself is not
  // bounded — a song streams for minutes — and the byte cap below is a runaway guard rather than a
  // quota, so it sits far above any real track.
  musicStreamConnectTimeoutMs: 12_000,
  musicStreamMaxBytes: 512 * 1024 * 1024,
  // FB-F9: one health scan walks at most this many reference rows — the cap is what keeps a single
  // press from becoming an unbounded burst of requests at third-party hosts.
  musicReferenceHealthMaxTracks: 50,
  musicProviderSearchCount: 20,
  musicServerNameMaxLength: 100,
  musicServerUrlMaxLength: 2048,
  musicServerUsernameMaxLength: 100,
  musicServerSecretMaxLength: 512,
  musicServerSearchCount: 30,
  musicProviderQualities: MUSIC_PROVIDER_QUALITIES,
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

/**
 * FB-S4: the catalogues the aggregate music upstream (GD) fronts. One list, read by both sides of
 * the wire: the client asks this upstream once per catalogue, and the worker's proxy accepts a
 * catalogue name only if it is on this list. Drift between two hand-kept copies is quiet in both
 * directions — a name the client offers and the worker refuses is one source that always errors,
 * and a catalogue the worker knows but nobody asks for is one nobody ever sees — so the order here
 * is also the merge order when two catalogues answer with the same song.
 */
export const GDS_UPSTREAM_SOURCES = ['netease', 'kuwo', 'migu', 'qq', 'bilibili'] as const
export type GdsUpstreamSource = (typeof GDS_UPSTREAM_SOURCES)[number]

// FB-M16: server-type sources are the reader's own music servers, registered with a URL and an
// account. A kind names a *protocol*, not a brand: `subsonic` is what Subsonic, Navidrome, Airsonic
// and Nextcloud's music app all answer, and `jellyfin` is the API Emby answers too — so one adapter
// per family covers the four names the review listed.
export const MUSIC_SERVER_KINDS = ['subsonic', 'jellyfin'] as const
export type MusicServerKind = (typeof MUSIC_SERVER_KINDS)[number]

export const BACKUP_INTERVALS: Record<string, number> = {
  off: 0,
  hourly: 60 * 60 * 1000,
  sixHourly: 6 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
}