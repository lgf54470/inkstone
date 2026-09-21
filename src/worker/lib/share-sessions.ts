import type { ShareSession, ShareSessionNote } from '@shared/types'
import { SESSION_GAP_MS } from '@shared/visitor-session'
import { DAY_MS, publicVisitorFingerprint } from './share-analytics'

/**
 * The visitor session view (ADR-0003): one visitor's visits, folded into "sittings" so the owner can
 * answer "did this person read it through" instead of reading rows one by one.
 *
 * Three consequences of how fingerprints work are baked into the query rather than documented and
 * hoped for:
 *
 * 1. **A session cannot cross a UTC day.** The fingerprint's salt rotates at UTC midnight, so two
 *    rows on either side of it belong to two different fingerprints by construction. The derivation
 *    partitions by `(fingerprint, UTC day)` anyway: the guarantee then lives where it is relied on
 *    and a change to the salt cannot silently start merging two days into one session.
 * 2. **A session is not a person.** Everyone behind one NAT can share a fingerprint and one person
 *    on two devices gets two — which is why nothing here is named after a person.
 * 3. **Sessions are derived, never stored.** They are computed from the visit rows, so the retention
 *    sweep and the link-scoped delete remove them by removing their rows.
 */
interface SessionCursor {
  startedAt: number
  sessionKey: string
}

export interface SessionRow {
  session_key: string
  fp: string
  started_at: number
  last_seen_at: number
  visits: number
  note_id: string
  slug: string
  note_title: string | null
  note_visits: number
}

/**
 * The rows of one page, folded into sessions. The statement answers flat rows (one per session and
 * note) so the page limit counts sessions rather than notes; this is where they become sessions
 * again. Rows arrive grouped and ordered by the statement, so a single pass suffices — and the fold
 * takes the note list in the order the visitor read them, which is the part worth reading.
 */
export function foldSessionRows(rows: SessionRow[]): ShareSession[] {
  const sessions: ShareSession[] = []
  for (const row of rows) {
    const previous = sessions[sessions.length - 1]
    if (!previous || previous.startedAt !== row.started_at || previous.fingerprint !== publicVisitorFingerprint(row.fp)) {
      sessions.push({
        fingerprint: publicVisitorFingerprint(row.fp),
        startedAt: row.started_at,
        lastSeenAt: row.last_seen_at,
        visits: row.visits,
        notes: [],
      })
    }
    const session = sessions[sessions.length - 1]
    // The same note can be opened twice inside one session; the statement already merged them.
    if (!session.notes.some((note: ShareSessionNote) => note.noteId === row.note_id)) {
      session.notes.push(toSessionNote(row))
    }
  }
  return sessions
}

function toSessionNote(row: SessionRow): ShareSessionNote {
  return {
    noteId: row.note_id,
    noteTitle: row.note_title,
    slug: row.slug,
    visits: row.note_visits,
  }
}

/**
 * The page after this one, or null when the page was short. Opaque on purpose: it names a session's
 * start and its derived key, which is an implementation detail the client must not compose itself.
 */
export function nextSessionCursor(rows: SessionRow[], sessions: ShareSession[], limit: number): string | null {
  if (sessions.length < limit) return null
  const last = rows[rows.length - 1]
  if (!last) return null
  return encodeSessionCursor({ startedAt: last.started_at, sessionKey: last.session_key })
}

function encodeSessionCursor(cursor: SessionCursor): string {
  return btoa(`${cursor.startedAt}|${cursor.sessionKey}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

/** Null for an absent cursor; a malformed one is an error the caller must answer, not a first page. */
export function decodeSessionCursor(raw: string | undefined): SessionCursor | null {
  if (!raw) return null
  const padded = raw.replaceAll('-', '+').replaceAll('_', '/')
  const decoded = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const separator = decoded.indexOf('|')
  const startedAt = Number(decoded.slice(0, separator))
  const sessionKey = decoded.slice(separator + 1)
  if (separator < 1 || !sessionKey || !Number.isSafeInteger(startedAt) || startedAt < 0) {
    throw new Error('invalid session cursor')
  }
  return { startedAt, sessionKey }
}

/**
 * One page of sessions for the whole account, derived in a single statement: the visit rows are
 * keyed by (fingerprint, UTC day, cumulative session number), the page picks whole sessions, and the
 * join re-attaches each one's notes. `LIMIT` therefore counts sessions, not rows.
 */
export function sessionsStatement(db: D1Database, params: {
  userId: string
  startTs: number
  /** The filter clause the analytics request already resolved, alias-free like the aggregate's. */
  clause: string
  cursor: SessionCursor | null
  limit: number
}): D1PreparedStatement {
  const { userId, startTs, clause, cursor, limit } = params
  const binds: Array<string | number> = [userId, startTs]
  let cursorPredicate = ''
  if (cursor) {
    binds.push(cursor.startedAt, cursor.sessionKey)
    cursorPredicate = `WHERE started_at < ?3 OR (started_at = ?3 AND session_key < ?4)`
  }
  binds.push(limit)
  return db.prepare(sessionsQuery({ clause, cursorPredicate, limitParam: binds.length })).bind(...binds)
}

/**
 * The statement's text, split from its parameters: both decisions that vary — where the page
 * boundary goes and how many sessions come back — are resolved by the caller, so this stays the
 * shape of the query rather than a function that is half SQL and half binding arithmetic.
 */
function sessionsQuery(params: { clause: string; cursorPredicate: string; limitParam: number }): string {
  const { clause, cursorPredicate, limitParam } = params
  return `WITH base AS (
       SELECT visitor_fp AS fp,
              CAST(visited_at / ${DAY_MS} AS INTEGER) AS utc_day,
              visited_at, note_id, slug
         FROM share_visits
        WHERE user_id = ?1 AND visited_at >= ?2
          AND visitor_fp IS NOT NULL AND visitor_fp <> ''${clause}
     ),
     sessionised AS (
       SELECT fp, utc_day, visited_at, note_id, slug,
              CASE WHEN LAG(visited_at) OVER scoped IS NULL
                     OR visited_at - LAG(visited_at) OVER scoped > ${SESSION_GAP_MS}
                   THEN 1 ELSE 0 END AS is_start
         FROM base
       WINDOW scoped AS (PARTITION BY fp, utc_day ORDER BY visited_at)
     ),
     keyed AS (
       SELECT fp, utc_day, visited_at, note_id, slug,
              fp || '|' || utc_day || '|' ||
              SUM(is_start) OVER (PARTITION BY fp, utc_day ORDER BY visited_at) AS session_key
         FROM sessionised
     ),
     grouped AS (
       SELECT session_key, fp, MIN(visited_at) AS started_at,
              MAX(visited_at) AS last_seen_at, COUNT(*) AS visits
         FROM keyed GROUP BY session_key
     ),
     page AS (
       SELECT * FROM grouped ${cursorPredicate}
        ORDER BY started_at DESC, session_key DESC LIMIT ?${limitParam}
     ),
     -- The note totals join the page rather than the whole window: an account whose window holds
     -- hundreds of thousands of rows otherwise groups every session's notes only to discard all but
     -- 25. The grouping is bounded by the page now, so the statement's cost sits in the fold, which
     -- has to look at every row in the window and cannot be narrowed by any index (ADR-0003).
     note_totals AS (
       SELECT k.session_key, k.note_id, MAX(k.slug) AS slug, MAX(n.title) AS note_title,
              COUNT(*) AS note_visits, MIN(k.visited_at) AS first_at
         FROM keyed k JOIN page page_row ON page_row.session_key = k.session_key
         LEFT JOIN notes n ON n.id = k.note_id AND n.user_id = ?1
        GROUP BY k.session_key, k.note_id
     )
     SELECT p.session_key, p.fp, p.started_at, p.last_seen_at, p.visits,
            n.note_id, n.slug, n.note_title, n.note_visits
       FROM page p JOIN note_totals n ON n.session_key = p.session_key
      ORDER BY p.started_at DESC, p.session_key DESC, n.first_at ASC, n.note_id ASC`
}
