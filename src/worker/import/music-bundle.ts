/** M-53b: restore of the music section of an export bundle (metadata only, merge by id). */
import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import { isDerivedMusicObjectKey, isWebdavRelativePath } from '../routes/music'
import { isValidId, isValidSlug } from '../lib/id'
import { addWarning } from './shared'
import type { ImportContext } from './types'

const MAX_TRACKS = LIMITS.importArchiveEntriesMax * 4
const MAX_TAGS = LIMITS.importArchiveEntriesMax * 2
const MAX_PLAYLISTS = LIMITS.importArchiveEntriesMax
const MAX_ITEMS = 50_000

const HASH_RE = /^[0-9a-f]{64}$/

const idField = z.string().refine(isValidId)
const stampField = z.number().int().positive()

const trackSchema = z.object({
  id: idField,
  title: z.string().max(LIMITS.musicTitleMaxLength),
  artist: z.string().max(LIMITS.musicArtistMaxLength),
  album: z.string().max(LIMITS.musicAlbumMaxLength),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  source: z.enum(['r2', 'webdav']),
  objectKey: z.string().min(1).max(1024),
  mime: z.string().min(1).max(128),
  sizeBytes: z.number().int().min(0).max(LIMITS.musicTrackMaxBytes),
  coverUrl: z.string().max(2048).nullable(),
  lyric: z.string().max(LIMITS.musicLyricMaxBytes).nullable(),
  isFavorite: z.boolean(),
  isPinned: z.boolean(),
  playCount: z.number().int().min(0).max(1_000_000_000),
  lastPlayedAt: z.number().int().nullable(),
  contentHash: z.string().regex(HASH_RE).nullable(),
  tagIds: z.array(z.string().max(64)).max(50),
  createdAt: stampField,
  updatedAt: stampField,
}).refine(
  (track) => (track.source === 'webdav'
    // A restored row may only name a remote path the import route itself would accept.
    ? isWebdavRelativePath(track.objectKey)
    // An R2 key must be exactly what this row's own upload would have derived,
    // so a crafted bundle can never point a track at another account's object.
    : isDerivedMusicObjectKey(track.id, track.createdAt, track.objectKey)),
  { message: 'objectKey does not belong to this track' },
)

const tagSchema = z.object({
  id: idField,
  name: z.string().min(1).max(LIMITS.tagNameMaxLength),
  color: z.string().max(32).nullable(),
  parentId: idField.nullable(),
  isPinned: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
  createdAt: stampField,
})

const playlistSchema = z.object({
  id: idField,
  name: z.string().min(1).max(LIMITS.musicPlaylistNameMaxLength),
  description: z.string().max(LIMITS.musicPlaylistDescriptionMaxLength),
  isPinned: z.boolean(),
  isFavorite: z.boolean(),
  shareSlug: z.string().nullable().refine(
    (value) => value === null || isValidSlug(value),
    { message: 'Invalid share slug' },
  ),
  sortOrder: z.number().int().min(0).max(100_000),
  createdAt: stampField,
  updatedAt: stampField,
})

const playlistItemSchema = z.object({
  id: idField,
  playlistId: idField,
  trackId: idField,
  sortOrder: z.number().int().min(0).max(100_000),
  // Rows carried over by the legacy rebuild can hold a zero added timestamp.
  createdAt: z.number().int().min(0),
})

type TrackRow = z.infer<typeof trackSchema>
type TagRow = z.infer<typeof tagSchema>
type PlaylistRow = z.infer<typeof playlistSchema>
type ItemRow = z.infer<typeof playlistItemSchema>

const sectionSchema = z.object({
  tracks: z.array(z.unknown()).max(MAX_TRACKS),
  tags: z.array(z.unknown()).max(MAX_TAGS),
  playlists: z.array(z.unknown()).max(MAX_PLAYLISTS),
  playlistItems: z.array(z.unknown()).max(MAX_ITEMS),
})

// Validates one section row-by-row: a few bad rows must not sink the whole
// restore, but every drop is reported (counts are aggregated so a hostile file
// cannot flood the warnings list).
function collectMusicSection(raw: unknown, ctx: ImportContext): {
  tracks: TrackRow[]
  tags: TagRow[]
  playlists: PlaylistRow[]
  items: ItemRow[]
} | null {
  const section = sectionSchema.safeParse(raw)
  if (!section.success) {
    addWarning(ctx.result, 'Skipped the music section of the export: it is not a valid library snapshot')
    return null
  }
  const parse = <T extends { id: string }>(
    entries: readonly unknown[],
    schema: z.ZodType<T>,
    label: string,
  ): T[] => {
    const valid: T[] = []
    const seen = new Set<string>()
    let dropped = 0
    let duplicated = 0
    for (const entry of entries) {
      const result = schema.safeParse(entry)
      if (!result.success) {
        dropped += 1
        continue
      }
      if (seen.has(result.data.id)) {
        duplicated += 1
        continue
      }
      seen.add(result.data.id)
      valid.push(result.data)
    }
    if (dropped > 0) addWarning(ctx.result, `Skipped ${dropped} invalid ${label} rows in the export`)
    if (duplicated > 0) {
      addWarning(ctx.result, `Skipped ${duplicated} duplicated ${label} IDs in the export`)
    }
    return valid
  }
  return {
    tracks: parse(section.data.tracks, trackSchema, 'track'),
    tags: parse(section.data.tags, tagSchema, 'tag'),
    playlists: parse(section.data.playlists, playlistSchema, 'playlist'),
    items: parse(section.data.playlistItems, playlistItemSchema, 'playlist item'),
  }
}

async function existingIds(db: D1Database, table: string, userId: string): Promise<Set<string>> {
  const rows = await db.prepare(`SELECT id FROM ${table} WHERE user_id = ?1`).bind(userId).all<{ id: string }>()
  return new Set(rows.results.map((row) => row.id))
}

export async function restoreMusicBundleSection(
  db: D1Database,
  userId: string,
  raw: unknown,
  ctx: ImportContext,
): Promise<void> {
  if (raw === undefined || raw === null) return
  const section = collectMusicSection(raw, ctx)
  if (!section) return

  const knownTracks = await existingIds(db, 'music_tracks', userId)
  const knownTags = await existingIds(db, 'music_tags', userId)
  const knownPlaylists = await existingIds(db, 'music_playlists', userId)

  // Existing rows win: restore only creates what the account lost, it never
  // rewrites current state.
  const freshTracks = await applyQuota(db, userId, section.tracks.filter((track) => !knownTracks.has(track.id)), ctx)
  const freshTags = section.tags.filter((tag) => !knownTags.has(tag.id))
  const freshPlaylists = section.playlists.filter((playlist) => !knownPlaylists.has(playlist.id))
  for (const track of freshTracks) knownTracks.add(track.id)
  for (const tag of freshTags) knownTags.add(tag.id)
  for (const playlist of freshPlaylists) knownPlaylists.add(playlist.id)

  const links = section.tracks
    .flatMap((track) => track.tagIds.map((tagId) => ({ trackId: track.id, tagId })))
    .filter((link) => knownTracks.has(link.trackId) && knownTags.has(link.tagId))
  const missingLinks = section.tracks
    .flatMap((track) => track.tagIds.map((tagId) => ({ trackId: track.id, tagId })))
    .filter((link) => !knownTracks.has(link.trackId) || !knownTags.has(link.tagId)).length
  const freshItems = section.items.filter(
    (item) => knownPlaylists.has(item.playlistId) && knownTracks.has(item.trackId),
  )
  const missingItems = section.items.length - freshItems.length

  await db.batch([
    insertJsonBatch(db, 'music_tracks', TRACK_COLUMNS, freshTracks.map(trackToColumns), userId),
    insertJsonBatch(db, 'music_tags', TAG_COLUMNS, freshTags.map(tagToColumns), userId),
    insertJsonBatch(db, 'music_playlists', PLAYLIST_COLUMNS, freshPlaylists.map(playlistToColumns), userId),
    insertJsonBatch(db, 'music_playlist_items', ITEM_COLUMNS, freshItems.map(itemToColumns), userId),
    insertJsonBatch(db, 'music_track_tags', LINK_COLUMNS, links.map((link) => [link.trackId, link.tagId]), userId),
  ])

  if (missingLinks > 0) {
    addWarning(ctx.result, `Skipped ${missingLinks} tag links that point at rows outside the restored library`)
  }
  if (missingItems > 0) {
    addWarning(ctx.result, `Skipped ${missingItems} playlist items that point at rows outside the restored library`)
  }
}

async function applyQuota(
  db: D1Database,
  userId: string,
  tracks: TrackRow[],
  ctx: ImportContext,
): Promise<TrackRow[]> {
  if (!tracks.length) return tracks
  const row = await db.prepare(
    'SELECT COALESCE(SUM(size_bytes), 0) AS bytes FROM music_tracks WHERE user_id = ?1',
  ).bind(userId).first<{ bytes: number }>()
  let used = row?.bytes ?? 0
  const kept: TrackRow[] = []
  let overQuota = 0
  for (const track of tracks) {
    if (used + track.sizeBytes > LIMITS.musicQuotaBytes) {
      overQuota += 1
      continue
    }
    used += track.sizeBytes
    kept.push(track)
  }
  if (overQuota > 0) {
    addWarning(ctx.result, `Skipped ${overQuota} tracks that would exceed the music storage quota`)
  }
  return kept
}

const TRACK_COLUMNS = [
  'id', 'title', 'artist', 'album', 'duration_ms', 'source', 'object_key', 'mime', 'size_bytes',
  'cover_url', 'lyric', 'is_favorite', 'is_pinned', 'play_count', 'last_played_at', 'content_hash',
  'created_at', 'updated_at',
] as const
const TAG_COLUMNS = ['id', 'name', 'color', 'parent_id', 'is_pinned', 'sort_order', 'created_at'] as const
const PLAYLIST_COLUMNS = [
  'id', 'name', 'description', 'is_pinned', 'is_favorite', 'share_slug', 'sort_order', 'created_at', 'updated_at',
] as const
const ITEM_COLUMNS = ['id', 'playlist_id', 'track_id', 'sort_order', 'created_at'] as const
const LINK_COLUMNS = ['track_id', 'tag_id'] as const

type Cell = string | number | null

function trackToColumns(track: TrackRow): Cell[] {
  return [
    track.id, track.title, track.artist, track.album, track.durationMs, track.source, track.objectKey,
    track.mime, track.sizeBytes, track.coverUrl, track.lyric, track.isFavorite ? 1 : 0,
    track.isPinned ? 1 : 0, track.playCount, track.lastPlayedAt, track.contentHash,
    track.createdAt, track.updatedAt,
  ]
}

function tagToColumns(tag: TagRow): Cell[] {
  return [tag.id, tag.name, tag.color, tag.parentId, tag.isPinned ? 1 : 0, tag.sortOrder, tag.createdAt]
}

function playlistToColumns(playlist: PlaylistRow): Cell[] {
  return [
    playlist.id, playlist.name, playlist.description, playlist.isPinned ? 1 : 0,
    playlist.isFavorite ? 1 : 0, playlist.shareSlug, playlist.sortOrder, playlist.createdAt, playlist.updatedAt,
  ]
}

function itemToColumns(item: ItemRow): Cell[] {
  return [item.id, item.playlistId, item.trackId, item.sortOrder, item.createdAt]
}

// Rows arrive as column arrays in the table's column order; user_id is bound
// per statement and never taken from the file.
function insertJsonBatch(
  db: D1Database,
  table: string,
  columns: readonly string[],
  rows: Cell[][],
  userId: string,
): D1PreparedStatement {
  const selects = columns.map((_, index) => `json_extract(j.value, '$[${index}]')`).join(', ')
  return db.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}, user_id)
     SELECT ${selects}, ?2 FROM json_each(?1) AS j`,
  ).bind(JSON.stringify(rows), userId)
}
