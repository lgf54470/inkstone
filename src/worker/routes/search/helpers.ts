import { segmentCJK } from '@shared/markdown-utils'
import { folderPathsById } from '@shared/folder-path'
import { truncateText } from '@shared/text-utils'
import type { SearchHit } from '@shared/types'
import { drainFtsQueue, hasPendingFtsWork } from '../../db/fts'
import { NOTE_COLUMNS, toNoteSummary, type NoteRow } from '../../db/rows'
import { contentWindowSql, makeSnippet } from '../../lib/snippet'

export const GRAPH_EDGE_CANDIDATE_LIMIT = 10_000

/** How many of the reader's node budget is held back so unresolved ghosts can still reach the page. */
export const GRAPH_UNRESOLVED_ALLOWANCE = 50

/** How many ghosts one response carries before the page is called truncated. The same number as the
 * allowance above is a coincidence of two different decisions, so they carry two names (G-37). */
export const GRAPH_UNRESOLVED_MAX = 50

/** The longest search line a graph request accepts, counted in characters, not tokens. */
export const GRAPH_QUERY_MAX_CHARS = 200

export interface ParsedQuery {
  text: string
  terms: string[]
  tags: string[]
  folder: string | null
  starred: boolean | null
  archived: boolean | null
  trash: boolean
}

export function parseQuery(raw: string): ParsedQuery {
  const parsed: ParsedQuery = {
    text: '',
    terms: [],
    tags: [],
    folder: null,
    starred: null,
    archived: null,
    trash: false,
  }
  const plain: string[] = []
  const tokenRe = /([A-Za-z]+):"([^"]*)"|"([^"]*)"|(\S+)/g

  for (const m of raw.matchAll(tokenRe)) {
    if (m[1] !== undefined) {
      applyQuotedKeyToken(parsed, m[1].toLowerCase(), m[2]?.trim() ?? '', plain)
      continue
    }
    if (m[3] !== undefined) {
      if (m[3].trim()) pushTerm(parsed, m[3].trim(), plain)
      continue
    }
    applyBareToken(parsed, m[4] ?? '', plain)
  }

  parsed.terms = [...new Set(parsed.terms)].slice(0, 12)
  parsed.tags = [...new Set(parsed.tags)].slice(0, 8)
  parsed.text = plain.slice(0, 12).join(' ')
  return parsed
}

function applyQuotedKeyToken(parsed: ParsedQuery, key: string, value: string, plain: string[]): void {
  if (key === 'tag' && value) {
    parsed.tags.push(value.replace(/^#/, ''))
    return
  }
  if (key === 'folder' && value) {
    parsed.folder = value
    return
  }
  if (value) pushTerm(parsed, `${key}:${value}`, plain)
}

function applyBareToken(parsed: ParsedQuery, token: string, plain: string[]): void {
  const colon = token.indexOf(':')
  if (colon > 0) {
    const key = token.slice(0, colon).toLowerCase()
    const value = token.slice(colon + 1)
    if (key === 'tag' && value) {
      parsed.tags.push(value.replace(/^#/, ''))
      return
    }
    if (key === 'folder' && value) {
      parsed.folder = value
      return
    }
    if (key === 'is') {
      if (applyIsQualifier(parsed, value, token, plain)) return
    }
    if (key === 'in' && value.toLowerCase() === 'trash') {
      parsed.trash = true
      return
    }
  }
  if (token) pushTerm(parsed, token, plain)
}

function applyIsQualifier(parsed: ParsedQuery, value: string, token: string, plain: string[]): boolean {
  const qualifier = value.toLowerCase()
  if (qualifier === 'starred') {
    parsed.starred = true
    return true
  }
  if (qualifier === 'archived') {
    parsed.archived = true
    return true
  }
  if (qualifier === 'unarchived') {
    parsed.archived = false
    return true
  }
  if (qualifier) pushTerm(parsed, token, plain)
  return qualifier !== ''
}

function pushTerm(parsed: ParsedQuery, token: string, plain: string[]): void {
  parsed.terms.push(token)
  plain.push(token)
}

export interface UserSearchResult {
  results: SearchHit[]
  mode: 'fts' | 'like'
  query: ParsedQuery
}

export async function searchUserNotes(
  db: D1Database,
  userId: string,
  raw: string,
  limit: number,
  ftsEnabled: boolean,
  drain = true,
): Promise<UserSearchResult> {
  const query = parseQuery(truncateText(raw.trim(), 512))
  if (!raw.trim()) return { results: [], mode: ftsEnabled ? 'fts' : 'like', query }

  let useFts = ftsEnabled
  if (useFts) {
    try {
      if (drain) await drainFtsQueue(db, userId, 50, true)
      useFts = !(await hasPendingFtsWork(db, userId))
    } catch {
      useFts = false
    }
  }

  if (useFts && query.terms.length && !query.trash) {
    try {
      return { results: await ftsSearch(db, userId, query, limit), mode: 'fts', query }
    } catch (error) {
      console.warn(
        '[inkstone] FTS query failed; falling back to LIKE:',
        error instanceof Error ? error.message : error,
      )
    }
  }
  return { results: await likeSearch(db, userId, query, limit), mode: 'like', query }
}


// The terms are scoped to the two columns a person searches. The index also carries note_id (so
// deletes can reach a row without scanning the table), and an unscoped query would answer with
// whatever note happens to hold the term inside its id.
function buildFtsQuery(terms: string[]): string {
  const parts: string[] = []
  for (const term of terms) {
    const seg = segmentCJK(term).trim().replace(/"/g, '')
    if (!seg) continue
    if (seg.includes(' ')) parts.push(`{title body} : "${seg}"`)
    else parts.push(`{title body} : "${seg}"*`)
  }
  return parts.join(' AND ')
}


async function ftsSearch(
  db: D1Database,
  userId: string,
  q: ParsedQuery,
  limit: number,
): Promise<SearchHit[]> {
  const match = buildFtsQuery(q.terms)
  if (!match) return []

  const binds: unknown[] = [match, userId]
  let where = `notes_fts MATCH ?1 AND notes_fts.user_id = ?2
    AND n.user_id = ?2 AND n.deleted_at IS NULL`
  applyFilters(q, binds, (clause) => (where += clause))
  binds.push(q.terms[0]!)
  const contentWindow = contentWindowSql('n.content', binds.length)
  binds.push(limit)


  const { results } = await db
    .prepare(
      `SELECT ${NOTE_COLUMNS}, ${contentWindow} AS content,
              bm25(notes_fts, 0.0, 0.0, 10.0, 1.0) AS score
         FROM notes_fts JOIN notes n
           ON n.id = notes_fts.note_id AND n.user_id = notes_fts.user_id
        WHERE ${where}
        ORDER BY score ASC, n.updated_at DESC, n.id ASC
        LIMIT ?${binds.length}`,
    )
    .bind(...binds)
    .all<NoteRow & { content: string; score: number }>()

  if (!results.length) return []

  return results.map((row) => ({
    note: toNoteSummary(row),
    snippet: makeSnippet(row.content ?? '', q.terms),
    score: -row.score,
  }))
}


async function likeSearch(
  db: D1Database,
  userId: string,
  q: ParsedQuery,
  limit: number,
): Promise<SearchHit[]> {
  const binds: unknown[] = [userId]
  const termBindIndexes: number[] = []
  let where = 'n.user_id = ?1'
  where += q.trash ? ' AND n.deleted_at IS NOT NULL' : ' AND n.deleted_at IS NULL'

  for (const term of q.terms) {
    binds.push(`%${escapeLike(term)}%`)
    const i = binds.length
    termBindIndexes.push(i)
    where += ` AND (n.title LIKE ?${i} ESCAPE '\\' OR n.content LIKE ?${i} ESCAPE '\\')`
  }
  applyFilters(q, binds, (clause) => (where += clause))

  const candidateLimit = q.terms.length ? Math.min(limit * 3, 600) : limit
  let contentSelect = 'n.excerpt'
  if (q.terms.length) {
    binds.push(q.terms[0]!)
    contentSelect = contentWindowSql('n.content', binds.length)
  }
  binds.push(candidateLimit)
  const titleRank = termBindIndexes.length
    ? termBindIndexes.map((index) => `(CASE WHEN n.title LIKE ?${index} ESCAPE '\\' THEN 10 ELSE 0 END)`).join(' + ')
    : '0'
  const { results } = await db
    .prepare(
      `SELECT ${NOTE_COLUMNS}, ${contentSelect} AS content FROM notes n
        WHERE ${where}
        ORDER BY ${titleRank} DESC, n.updated_at DESC, n.id ASC
        LIMIT ?${binds.length}`,
    )
    .bind(...binds)
    .all<NoteRow & { content: string }>()

  const ranked = results.map((row) => ({ row, score: scoreOf(row, q.terms) }))
  if (q.terms.length) {
    ranked.sort(
      (a, b) =>
        b.score - a.score ||
        b.row.updated_at - a.row.updated_at ||
        a.row.id.localeCompare(b.row.id),
    )
  }
  return ranked.slice(0, limit).map(({ row, score }) => ({
    note: toNoteSummary(row),
    snippet: makeSnippet(row.content, q.terms),
    score,
  }))
}


function applyFilters(q: ParsedQuery, binds: unknown[], append: (clause: string) => void): void {
  if (q.starred === true) append(' AND n.is_starred = 1')
  if (q.archived === true) append(' AND n.is_archived = 1')
  else if (q.archived === false) append(' AND n.is_archived = 0')

  for (const tag of q.tags) {
    binds.push(tag)
    append(
      ` AND EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
          WHERE nt.note_id = n.id AND t.user_id = n.user_id
            AND t.name = ?${binds.length} COLLATE NOCASE)`,
    )
  }
  if (q.folder) {
    binds.push(q.folder)
    append(
      ` AND EXISTS (SELECT 1 FROM folders f WHERE f.id = n.folder_id
          AND f.name = ?${binds.length} COLLATE NOCASE AND f.user_id = n.user_id)`,
    )
  }
}


function scoreOf(row: NoteRow & { content: string }, terms: string[]): number {
  let score = 0
  const title = row.title.toLowerCase()
  const body = row.content.toLowerCase()
  for (const term of terms) {
    const t = term.toLowerCase()
    if (title.includes(t)) score += 10
    score += countOccurrences(body, t, 8)
  }
  return score
}


function countOccurrences(text: string, query: string, limit: number): number {
  if (!query) return 0
  let count = 0
  let offset = 0
  while (count < limit) {
    const found = text.indexOf(query, offset)
    if (found < 0) break
    count++
    offset = found + query.length
  }
  return count
}

import { escapeLike } from '../../lib/like'

export { escapeLike }


/**
 * The notes a reader took out of the graph. An entry that is not a note id is dropped rather than
 * answered 400: a preference can outlive the note it named, and a stale entry must not cost the reader
 * the whole picture. The list travels as one bound json_each argument, so it never reaches D1's
 * hundred-variable ceiling however long it is (G-42).
 */
export function parseExcludedNoteIds(
  raw: string | undefined,
  isValidId: (value: unknown) => value is string,
  max: number,
): string[] {
  const ids = [...new Set((raw ?? '').split(',').map((item) => item.trim()).filter(isValidId))]
  return ids.slice(0, max)
}


/**
 * Which side of a link a local graph walks (G-44). `incoming` is the notes that point at the centre —
 * who references it — `outgoing` is what it points at, and `both` is the neighbourhood the panel has
 * always drawn. Unknown spellings answer `both`, so a stale preference cannot empty the picture.
 */
export type GraphLinkDirection = 'both' | 'incoming' | 'outgoing'

export function parseGraphLinkDirection(raw: string | undefined): GraphLinkDirection {
  return raw === 'incoming' || raw === 'outgoing' ? raw : 'both'
}

/**
 * The clause that leaves a reader's excluded notes out of a graph page. The whole list travels as one
 * bound json_each argument, so its length never runs into D1's hundred-variable ceiling, and one id can
 * be kept in — the centre of a local graph is the note the reader is standing on (G-42).
 */
/**
 * Every folder the account has, said by where it sits. The graph page is bounded to a few hundred notes,
 * while a `path:` term and a legend row have to name the whole way down, so the tree is read once per
 * request rather than walked per note (G-48).
 */
export async function loadFolderPaths(db: D1Database, userId: string): Promise<Map<string, string>> {
  const result = await db.prepare(
    `SELECT id, parent_id, name FROM folders WHERE user_id = ? AND deleted_at IS NULL`,
  ).bind(userId).all<{ id: string; parent_id: string | null; name: string }>()
  return folderPathsById(result.results.map((row) => ({ id: row.id, parentId: row.parent_id, name: row.name })))
}

export function excludedNoteClause(excluded: readonly string[], keepId: string | null): { filter: string, bind: string } | null {
  const kept = excluded.filter((id) => id !== keepId)
  return kept.length === 0 ? null : { filter: 'n.id NOT IN (SELECT value FROM json_each(?))', bind: JSON.stringify(kept) }
}

/**
 * The walk itself, with only one thing varying by direction (G-44): which end of a link has to be the
 * note already reached, and therefore which end the next note is. `both` keeps the two-sided test the
 * panel has always used, so an unset direction answers exactly what it did before.
 */
export function localNeighborhoodSql(direction: GraphLinkDirection): string {
  const reached = direction === 'incoming'
    ? 'l.target_note_id = neighborhood.id'
    : direction === 'outgoing'
      ? 'l.source_note_id = neighborhood.id'
      : '(l.source_note_id = neighborhood.id OR l.target_note_id = neighborhood.id)'
  const neighbour = direction === 'incoming'
    ? 'l.source_note_id'
    : direction === 'outgoing'
      ? 'l.target_note_id'
      : 'CASE WHEN l.source_note_id = neighborhood.id THEN l.target_note_id ELSE l.source_note_id END'
  return `WITH RECURSIVE neighborhood(id, depth, path) AS (
    SELECT ? AS id, 0 AS depth, ',' || ? || ',' AS path
    UNION
    SELECT adjacent.id,
      neighborhood.depth + 1,
      neighborhood.path || adjacent.id || ','
    FROM neighborhood
    JOIN links l ON l.user_id = ? AND l.target_note_id IS NOT NULL
      AND ${reached}
    JOIN notes adjacent ON adjacent.id = ${neighbour}
      AND adjacent.user_id = l.user_id AND adjacent.deleted_at IS NULL AND adjacent.is_archived = 0
    WHERE neighborhood.depth < ? AND INSTR(neighborhood.path, ',' || adjacent.id || ',') = 0
  ), nearby AS (SELECT id, MIN(depth) AS depth FROM neighborhood GROUP BY id)`
}
