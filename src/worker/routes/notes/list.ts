import { Hono } from "hono";
import type { ListNotesResponse, SortKey, SortOrder, ViewKind } from "@shared/types";
import type { AppBindings } from "../../env";
import { NOTE_COLUMNS, toNoteSummary, type NoteRow } from "../../db/rows";
import { ApiError } from "../../lib/errors";
import { clampInt } from "../../lib/request";
import { NOTE_VIEWS } from './helpers';
import { NOTE_SORTS } from './helpers';
import { encodeNotesListCursor } from './helpers';
import { parseNotesListCursor } from './helpers';

export function registerNotesListRoutes(notesRoutes: Hono<AppBindings>): void {
notesRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const requestedView = c.req.query('view') as ViewKind | undefined
  const requestedSort = c.req.query('sort') as SortKey | undefined
  const view = requestedView && NOTE_VIEWS.has(requestedView) ? requestedView : 'all'
  const sort = requestedSort && NOTE_SORTS.has(requestedSort) ? requestedSort : 'updated'
  const order: SortOrder = c.req.query('order') === 'asc' ? 'asc' : 'desc'
  const limit = clampInt(c.req.query('limit'), 1, 1000, 500)
  const cursor = parseNotesListCursor(c.req.query('cursor'), view, sort, order)

  const binds: unknown[] = [userId]
  let where = 'n.user_id = ?1'

  if (view === 'trash') {
    where += ' AND n.deleted_at IS NOT NULL'
  } else {
    where += ' AND n.deleted_at IS NULL'
    where += view === 'archived' ? ' AND n.is_archived = 1' : ' AND n.is_archived = 0'
  }

  if (view === 'starred') where += ' AND n.is_starred = 1'
  if (view === 'pinned') where += ' AND n.is_pinned = 1'
  if (view === 'shared') where += ' AND EXISTS (SELECT 1 FROM shares s WHERE s.note_id = n.id AND (s.is_enabled = 1 OR s.is_enabled IS NULL))'
  if (view === 'published') where += ' AND EXISTS (SELECT 1 FROM blog_posts bp WHERE bp.note_id = n.id AND bp.is_published = 1)'
  if (view === 'unfiled') where += ' AND n.folder_id IS NULL'
  if (view === 'untagged') where += ' AND NOT EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id)'

  if (view === 'folder') {
    const folderId = c.req.query('folderId')
    if (!folderId) throw ApiError.badRequest('Missing folderId')
    binds.push(folderId)
    where += ` AND n.folder_id = ?${binds.length}`
  }

  if (view === 'tag') {
    const tag = c.req.query('tag')
    if (!tag) throw ApiError.badRequest('Missing tag')
    binds.push(tag)
    binds.push(`${tag}/%`)
    where += ` AND EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                 WHERE nt.note_id = n.id AND t.user_id = n.user_id
                   AND (t.name = ?${binds.length - 1} COLLATE NOCASE OR t.name LIKE ?${binds.length} COLLATE NOCASE))`
  }

  const countWhere = where
  const countBinds = [...binds]

  const dir = order === 'asc' ? 'ASC' : 'DESC'
  const valueColumn = view === 'trash'
    ? 'n.deleted_at'
    : sort === 'created'
      ? 'n.created_at'
      : sort === 'title'
        ? 'n.title'
        : 'n.updated_at'
  const valueCollation = sort === 'title' && view !== 'trash' ? ' COLLATE NOCASE' : ''
  const orderBy =
    view === 'trash'
      ? `n.deleted_at ${dir}, n.id ASC`
      : ({
          updated: `n.is_pinned DESC, n.updated_at ${dir}, n.id ASC`,
          created: `n.is_pinned DESC, n.created_at ${dir}, n.id ASC`,
          title: `n.is_pinned DESC, n.title COLLATE NOCASE ${dir}, n.id ASC`,
        }[sort] ?? `n.is_pinned DESC, n.updated_at ${dir}, n.id ASC`)

  if (cursor.kind === 'keyset') {
    const comparison = order === 'asc' ? '>' : '<'
    if (view === 'trash') {
      binds.push(cursor.cursor.value, cursor.cursor.value, cursor.cursor.id)
      const valueBind = binds.length - 2
      const repeatedValueBind = binds.length - 1
      const idBind = binds.length
      where += ` AND (${valueColumn}${valueCollation} ${comparison} ?${valueBind}
        OR (${valueColumn}${valueCollation} = ?${repeatedValueBind} AND n.id > ?${idBind}))`
    } else {
      binds.push(
        cursor.cursor.pinned,
        cursor.cursor.pinned,
        cursor.cursor.value,
        cursor.cursor.value,
        cursor.cursor.id,
      )
      const firstPinnedBind = binds.length - 4
      const repeatedPinnedBind = binds.length - 3
      const valueBind = binds.length - 2
      const repeatedValueBind = binds.length - 1
      const idBind = binds.length
      where += ` AND (n.is_pinned < ?${firstPinnedBind}
        OR (n.is_pinned = ?${repeatedPinnedBind} AND (
          ${valueColumn}${valueCollation} ${comparison} ?${valueBind}
          OR (${valueColumn}${valueCollation} = ?${repeatedValueBind} AND n.id > ?${idBind})
        )))`
    }
  }

  const listSql = cursor.kind === 'legacy'
    ? `SELECT ${NOTE_COLUMNS} FROM notes n WHERE ${where} ORDER BY ${orderBy}
       LIMIT ?${binds.length + 1} OFFSET ?${binds.length + 2}`
    : `SELECT ${NOTE_COLUMNS} FROM notes n WHERE ${where} ORDER BY ${orderBy}
       LIMIT ?${binds.length + 1}`
  const listStatement = cursor.kind === 'legacy'
    ? c.env.DB.prepare(listSql).bind(...binds, limit + 1, cursor.offset)
    : c.env.DB.prepare(listSql).bind(...binds, limit + 1)
  // COUNT(*) over the view predicate is only needed on the first page (the
  // client never re-reads `total` once paging starts); deep pages skip it so
  // the cost does not grow with every deleted row the index has to walk.
  const needsTotal = cursor.kind === 'first'
  const batch: D1PreparedStatement[] = []
  if (needsTotal) {
    batch.push(
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM notes n WHERE ${countWhere}`).bind(...countBinds),
    )
  }
  batch.push(listStatement)
  const results = await c.env.DB.batch(batch)
  const countResult = needsTotal ? results[0] : undefined
  const listResult = results[needsTotal ? 1 : 0]

  const total = countResult
    ? Number((countResult.results?.[0] as { total?: unknown } | undefined)?.total ?? 0)
    : null
  const rows = listResult?.results as NoteRow[] | undefined ?? []
  const pageRows = rows.slice(0, limit)
  const notes = pageRows.map(toNoteSummary)
  const body: ListNotesResponse = {
    notes,
    total,
    nextCursor: rows.length > limit && pageRows.length
      ? encodeNotesListCursor(pageRows[pageRows.length - 1]!, view, sort, order)
      : null,
  }
  return c.json(body)
})
}

