import { Hono, type Context } from 'hono'
import { LIMITS } from '@shared/constants'
import type { SyncDeletion, SyncResponse } from '@shared/types'
import type { AppBindings } from '../env'
import { NOTE_COLUMNS, toFolder, toNoteSummary, toTag, type FolderRow, type NoteRow, type TagRow } from '../db/rows'
import { ApiError } from '../lib/errors'
import { clampInt } from '../lib/request'
import { requireAuth } from '../middleware/auth'

export const syncRoutes = new Hono<AppBindings>()

export const CHANGE_BOUNDS_SQL = `SELECT
  (SELECT seq FROM changes WHERE user_id = ?1 ORDER BY seq ASC LIMIT 1) AS lo,
  (SELECT seq FROM changes WHERE user_id = ?1 ORDER BY seq DESC LIMIT 1) AS hi`

const FOLDER_SELECT = `f.id, f.parent_id, f.name, f.icon, f.color, f.position, f.created_at, f.updated_at`

const TAG_SELECT = `t.id, t.name, t.color, t.is_pinned, t.created_at,
  COALESCE(nc.count, 0) AS note_count`

const TAG_COUNT_JOIN = `LEFT JOIN (
  SELECT nt.tag_id, COUNT(*) AS count
    FROM note_tags nt JOIN notes n ON n.id = nt.note_id
   WHERE n.user_id = ?1 AND n.deleted_at IS NULL AND n.is_archived = 0
   GROUP BY nt.tag_id
) nc ON nc.tag_id = t.id`


syncRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('userId')
  const since = clampInt(c.req.query('since'), 0, Number.MAX_SAFE_INTEGER, 0)
  const after = (c.req.query('after') ?? '').slice(0, 128)

  const bounds = await c.env.DB.prepare(CHANGE_BOUNDS_SQL)
    .bind(userId)
    .first<{ lo: number | null; hi: number | null }>()
  const lo = bounds?.lo ?? 0
  const hi = bounds?.hi ?? 0

  // A non-empty `after` key always means the caller is mid-way through a
  // full snapshot page chain; keep serving snapshot pages regardless of
  // `since`, so following the returned nextKey can never silently drop
  // remaining pages.
  const needFull = since <= 0 || (lo > 0 && since < lo - 1)
  if (needFull || after) {
    const requestedSnapshot = clampInt(c.req.query('snapshot'), 0, Number.MAX_SAFE_INTEGER, hi)
    const snapshotCursor = after ? Math.min(requestedSnapshot, hi) : hi
    return c.json(await fullSnapshot(c.env.DB, userId, snapshotCursor, after))
  }

  if (since >= hi) return c.json(emptySyncResponse(since, hi))
  return c.json(await loadSyncDelta(c, userId, since, hi))
})

function emptySyncResponse(since: number, hi: number): SyncResponse {
  return {
    // Never move the client's cursor backwards, even if it reported a
    // seq ahead of the server (e.g. data was trimmed).
    cursor: Math.max(since, hi),
    full: false,
    hasMore: false,
    nextKey: null,
    facetsFull: false,
    settingsChanged: false,
    profileChanged: false,
    siteChanged: false,
    notes: [],
    folders: [],
    tags: [],
    deletions: [],
    serverTime: Date.now(),
  }
}

async function loadSyncDelta(
  c: Context<AppBindings>,
  userId: string,
  since: number,
  hi: number,
): Promise<SyncResponse> {
  const { changes, cursor, hasMore } = await collectSyncChanges(c.env.DB, userId, since, hi)
  const latest = latestChanges(changes)
  const split = splitChangeIds(latest)
  const { notes, folders, tags } = await loadChangedFacets(c, userId, split)
  const deletions = appendMissingDeletions(split, notes, folders, tags)
  return {
    cursor,
    full: false,
    hasMore,
    nextKey: null,
    facetsFull: split.facetsFull,
    settingsChanged: split.settingsChanged,
    profileChanged: split.profileChanged,
    siteChanged: split.siteChanged,
    notes: notes.map(toNoteSummary),
    folders: folders.map(toFolder),
    tags: tags.map(toTag),
    deletions,
    serverTime: Date.now(),
  }
}

async function collectSyncChanges(
  db: D1Database,
  userId: string,
  since: number,
  hi: number,
): Promise<{
  changes: Array<{ seq: number; entity: string; entity_id: string; op: string }>
  cursor: number
  hasMore: boolean
}> {
  const { results: changes } = await db.prepare(
    `SELECT seq, entity, entity_id, op FROM changes
      WHERE user_id = ?1 AND seq > ?2 ORDER BY seq ASC LIMIT ?3`,
  )
    .bind(userId, since, LIMITS.syncBatchSize)
    .all<{ seq: number; entity: string; entity_id: string; op: string }>()
  const cursor = changes.length ? changes[changes.length - 1]!.seq : since
  const hasMore = changes.length === LIMITS.syncBatchSize && cursor < hi
  return { changes, cursor, hasMore }
}

function latestChanges(
  changes: Array<{ seq: number; entity: string; entity_id: string; op: string }>,
): Map<string, { entity: string; id: string; op: string }> {
  const latest = new Map<string, { entity: string; id: string; op: string }>()
  for (const ch of changes) {
    latest.set(`${ch.entity}:${ch.entity_id}`, { entity: ch.entity, id: ch.entity_id, op: ch.op })
  }
  return latest
}

interface SplitChangeIds {
  noteIds: string[]
  folderIds: string[]
  tagIds: string[]
  deletions: SyncDeletion[]
  facetsFull: boolean
  settingsChanged: boolean
  profileChanged: boolean
  siteChanged: boolean
}

type ChangeBucket =
  | { kind: 'deletion'; entity: 'note' | 'folder' | 'tag' }
  | { kind: 'id'; bucket: 'note' | 'folder' | 'tag' }
  | { kind: 'skip' }

function changeBucket(item: { entity: string; op: string }): ChangeBucket {
  if (item.op === 'delete') {
    if (item.entity === 'note' || item.entity === 'folder' || item.entity === 'tag') {
      return { kind: 'deletion', entity: item.entity }
    }
    return { kind: 'skip' }
  }
  if (item.entity === 'note') return { kind: 'id', bucket: 'note' }
  if (item.entity === 'folder') return { kind: 'id', bucket: 'folder' }
  if (item.entity === 'tag') return { kind: 'id', bucket: 'tag' }
  return { kind: 'skip' }
}

function splitChangeIds(
  latest: Map<string, { entity: string; id: string; op: string }>,
): SplitChangeIds {
  const noteIds: string[] = []
  const folderIds: string[] = []
  const tagIds: string[] = []
  const deletions: SyncDeletion[] = []
  const idsByBucket: Record<'note' | 'folder' | 'tag', string[]> = {
    note: noteIds,
    folder: folderIds,
    tag: tagIds,
  }
  for (const item of latest.values()) {
    const bucket = changeBucket(item)
    if (bucket.kind === 'deletion') deletions.push({ entity: bucket.entity, id: item.id })
    else if (bucket.kind === 'id') idsByBucket[bucket.bucket].push(item.id)
  }
  return {
    noteIds,
    folderIds,
    tagIds,
    deletions,
    facetsFull: [...latest.values()].some((item) => item.entity === 'note'),
    settingsChanged: [...latest.values()].some((item) => item.entity === 'settings'),
    profileChanged: [...latest.values()].some((item) => item.entity === 'profile'),
    siteChanged: [...latest.values()].some((item) => item.entity === 'site'),
  }
}

async function loadChangedFacets(
  c: Context<AppBindings>,
  userId: string,
  split: SplitChangeIds,
): Promise<{ notes: NoteRow[]; folders: FolderRow[]; tags: TagRow[] }> {
  const notes = await loadInChunks(split.noteIds, (ids) =>
    c.env.DB.prepare(
      `SELECT ${NOTE_COLUMNS} FROM notes n
        WHERE n.user_id = ?1 AND n.id IN (${placeholders(ids.length, 2)})`,
    )
      .bind(userId, ...ids)
      .all<NoteRow>(),
  )
  const folders = split.facetsFull
    ? (
        await c.env.DB.prepare(
          `SELECT ${FOLDER_SELECT} FROM folders f
            WHERE f.user_id = ?1 AND f.deleted_at IS NULL
            ORDER BY f.position ASC, f.created_at ASC, f.id ASC`,
        )
          .bind(userId)
          .all<FolderRow>()
      ).results
    : await loadInChunks(split.folderIds, (ids) =>
        c.env.DB.prepare(
          `SELECT ${FOLDER_SELECT} FROM folders f
            WHERE f.user_id = ?1 AND f.deleted_at IS NULL
              AND f.id IN (${placeholders(ids.length, 2)})`,
        )
          .bind(userId, ...ids)
          .all<FolderRow>(),
      )
  const tags = split.facetsFull
    ? (
        await c.env.DB.prepare(
          `SELECT ${TAG_SELECT} FROM tags t
            ${TAG_COUNT_JOIN}
           WHERE t.user_id = ?1 ORDER BY t.name COLLATE NOCASE`,
        )
          .bind(userId)
          .all<TagRow>()
      ).results
    : await loadInChunks(split.tagIds, (ids) =>
        c.env.DB.prepare(
          `SELECT ${TAG_SELECT} FROM tags t
            ${TAG_COUNT_JOIN}
           WHERE t.user_id = ?1 AND t.id IN (${placeholders(ids.length, 2)})`,
        )
          .bind(userId, ...ids)
          .all<TagRow>(),
      )
  return { notes, folders, tags }
}

function appendMissingDeletions(
  split: SplitChangeIds,
  notes: NoteRow[],
  folders: FolderRow[],
  tags: TagRow[],
): SyncDeletion[] {
  const deletions = [...split.deletions]
  const gotNotes = new Set(notes.map((n) => n.id))
  for (const id of split.noteIds) if (!gotNotes.has(id)) deletions.push({ entity: 'note', id })
  const gotFolders = new Set(folders.map((f) => f.id))
  for (const id of split.folderIds) if (!gotFolders.has(id)) deletions.push({ entity: 'folder', id })
  const gotTags = new Set(tags.map((t) => t.id))
  for (const id of split.tagIds) if (!gotTags.has(id)) deletions.push({ entity: 'tag', id })
  return deletions
}


syncRoutes.get('/ws', requireAuth, async (c) => {
  if (!c.env.SYNC_HUB) {
    throw new ApiError(503, 'storage_unavailable', 'The realtime channel is disabled; polling will be used')
  }
  const origin = c.req.header('Origin')
  if (origin && origin !== new URL(c.req.url).origin) {
    throw ApiError.forbidden('The realtime connection origin is not trusted')
  }
  if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') {
    throw ApiError.badRequest('This endpoint accepts only WebSocket upgrade requests')
  }

  const userId = c.get('userId')
  const stub = c.env.SYNC_HUB.get(c.env.SYNC_HUB.idFromName(userId))
  return stub.fetch(
    new Request('https://sync-hub.internal/connect', {
      headers: c.req.raw.headers,
    }),
  )
})


async function fullSnapshot(
  db: D1Database,
  userId: string,
  cursor: number,
  after: string,
): Promise<SyncResponse> {
  const [notes, folders, tags] = await Promise.all([
    db
      .prepare(
        `SELECT ${NOTE_COLUMNS} FROM notes n WHERE n.user_id = ?1
          AND n.id > ?2 ORDER BY n.id ASC LIMIT ?3`,
      )
      .bind(userId, after, LIMITS.syncBatchSize + 1)
      .all<NoteRow>(),
    !after
      ? db
          .prepare(
            `SELECT ${FOLDER_SELECT} FROM folders f WHERE f.user_id = ?1 AND f.deleted_at IS NULL
              ORDER BY f.position ASC`,
          )
          .bind(userId)
          .all<FolderRow>()
      : Promise.resolve({ results: [] as FolderRow[] }),
    !after
      ? db
          .prepare(
            `SELECT ${TAG_SELECT} FROM tags t
              ${TAG_COUNT_JOIN}
             WHERE t.user_id = ?1 ORDER BY t.name COLLATE NOCASE`,
          )
          .bind(userId)
          .all<TagRow>()
      : Promise.resolve({ results: [] as TagRow[] }),
  ])
  const pageNotes = notes.results.slice(0, LIMITS.syncBatchSize)
  const hasMore = notes.results.length > LIMITS.syncBatchSize

  return {
    cursor,
    full: true,
    hasMore,
    nextKey: hasMore ? pageNotes[pageNotes.length - 1]!.id : null,
    facetsFull: true,
    settingsChanged: true,
    profileChanged: true,
    siteChanged: true,
    notes: pageNotes.map(toNoteSummary),
    folders: folders.results.map(toFolder),
    tags: tags.results.map(toTag),
    deletions: [],
    serverTime: Date.now(),
  }
}

function placeholders(count: number, start: number): string {
  return Array.from({ length: count }, (_, i) => `?${start + i}`).join(', ')
}

async function loadInChunks<T>(
  ids: string[],
  load: (chunk: string[]) => Promise<{ results: T[] }>,
): Promise<T[]> {
  if (!ids.length) return []
  const chunks: string[][] = []
  for (let index = 0; index < ids.length; index += 80) {
    chunks.push(ids.slice(index, index + 80))
  }
  const pages = await Promise.all(chunks.map(load))
  return pages.flatMap((page) => page.results)
}
