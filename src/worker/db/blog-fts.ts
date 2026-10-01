import { LIMITS } from '@shared/constants'
import { segmentCJK } from '@shared/markdown-utils'
import { truncateText } from '@shared/text-utils'
import { selectQueueUsersRoundRobin } from './metadata'

/**
 * The blog's own full-text index (blog_posts_fts), maintained through the same shape as the note
 * index: a write enqueues in the batch that writes, the drain turns the queue into index rows, and
 * the search falls back to LIKE whenever an entry is still queued. The queue exists because the
 * indexed text is segmented in code (`segmentCJK`), which SQL alone cannot produce.
 */

export const BLOG_FTS_DRAIN_DELAY_MS = 10_000
const BLOG_FTS_DRAIN_BATCH = 5
const BLOG_FTS_DRAIN_ALL_BATCH = 250
const BLOG_FTS_STATEMENT_BATCH = 75
const BLOG_FTS_DRAIN_CURSOR_META_KEY = 'blog-fts-index-drain-user-v1'

// Every delete below targets one post_id, and an FTS5 table only reaches its own index through
// MATCH, so without this each delete scans the whole table.
export const BLOG_FTS_POST_MATCH_SQL = `blog_posts_fts MATCH ('post_id : "' || replace(?1, '"', '""') || '"')`

export type BlogFtsKind = 'upsert' | 'delete'

interface BlogFtsQueueRow {
  post_id: string
  kind: BlogFtsKind
  created_at: number
}

interface IndexablePost {
  id: string
  user_id: string
  title: string
  excerpt: string
  content: string
  updated_at: number
}

/**
 * One queue row per post, and the newest write wins: `created_at` only grows, so a drain holding an
 * older version can no longer match the row it read. The caller puts this in the same batch as the
 * write it describes — an enqueue that could be lost separately is an index that silently stops
 * tracking a post.
 */
export function enqueueBlogFtsStatement(
  db: D1Database,
  userId: string,
  postId: string,
  kind: BlogFtsKind,
  at = Date.now(),
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO blog_fts_queue (user_id, post_id, kind, created_at)
       VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(user_id, post_id) DO UPDATE SET
         kind = excluded.kind,
         created_at = CASE
           WHEN excluded.created_at > blog_fts_queue.created_at THEN excluded.created_at
           ELSE blog_fts_queue.created_at + 1
         END`,
    )
    .bind(userId, postId, kind, at)
}

/**
 * A queued upsert whose post is gone (purged) is handled as a delete instead of leaving a row behind.
 */
function buildBlogFtsItemStatements(
  db: D1Database,
  userId: string,
  item: BlogFtsQueueRow,
  post: IndexablePost | undefined,
): D1PreparedStatement[] {
  return item.kind === 'delete' || !post
    ? [deleteIndexRowStatement(db, userId, item), deleteQueueEntryStatement(db, userId, item)]
    : buildBlogFtsUpsertStatements(db, userId, item, post)
}

/**
 * Removes the index row of a post that is gone or asked for deletion. The guard is the queue version:
 * a write that lands in between replaces the queue row, and then this drain no longer owns the index
 * row it was about to touch.
 */
function deleteIndexRowStatement(db: D1Database, userId: string, item: BlogFtsQueueRow): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM blog_posts_fts WHERE ${BLOG_FTS_POST_MATCH_SQL} AND post_id = ?1 AND user_id = ?2
         AND EXISTS (SELECT 1 FROM blog_fts_queue
           WHERE user_id = ?2 AND post_id = ?1 AND kind = ?3 AND created_at = ?4)`,
    )
    .bind(item.post_id, userId, item.kind, item.created_at)
}

/** Removes the queue row this drain read; a newer write has replaced it and fails the match. */
function deleteQueueEntryStatement(db: D1Database, userId: string, item: BlogFtsQueueRow): D1PreparedStatement {
  return db
    .prepare(
      `DELETE FROM blog_fts_queue
        WHERE user_id = ?1 AND post_id = ?2 AND kind = ?3 AND created_at = ?4`,
    )
    .bind(userId, item.post_id, item.kind, item.created_at)
}

/**
 * Indexes one queued post. The guards are what make a drain safe to run twice from two requests: the
 * index row is written only while the post still carries the version that was read, and only while
 * the queue row is still the one that was read — a write that lands in between bumps its queue row's
 * `created_at`, so this drain no longer matches and the newer entry survives.
 */
function buildBlogFtsUpsertStatements(
  db: D1Database,
  userId: string,
  item: BlogFtsQueueRow,
  post: IndexablePost,
): D1PreparedStatement[] {
  return [
    deleteIndexRowStatement(db, userId, item),
    db
      .prepare(
        `INSERT INTO blog_posts_fts (post_id, user_id, title, excerpt, body)
         SELECT ?1, ?2, ?3, ?4, ?5
          WHERE EXISTS (SELECT 1 FROM blog_posts
            WHERE id = ?1 AND user_id = ?2 AND updated_at = ?6)
            AND EXISTS (SELECT 1 FROM blog_fts_queue
              WHERE user_id = ?2 AND post_id = ?1 AND kind = ?7 AND created_at = ?8)`,
      )
      .bind(
        item.post_id,
        userId,
        segmentCJK(post.title),
        segmentCJK(post.excerpt),
        segmentCJK(truncateText(post.content, LIMITS.ftsContentChars)),
        post.updated_at,
        item.kind,
        item.created_at,
      ),
    deleteQueueEntryStatement(db, userId, item),
  ]
}

async function loadIndexablePosts(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<Map<string, IndexablePost>> {
  const posts = new Map<string, IndexablePost>()
  if (!ids.length) return posts
  const { results } = await db
    .prepare(
      `SELECT id, user_id, title, excerpt, content, updated_at FROM blog_posts
        WHERE user_id = ?1 AND id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(userId, JSON.stringify(ids))
    .all<IndexablePost>()
  for (const post of results) posts.set(post.id, post)
  return posts
}

export async function drainBlogFtsQueue(
  db: D1Database,
  userId: string,
  max = BLOG_FTS_DRAIN_BATCH,
  ignoreDelay = false,
): Promise<number> {
  const cutoff = ignoreDelay ? Date.now() : Date.now() - BLOG_FTS_DRAIN_DELAY_MS
  const { results } = await db
    .prepare(
      `SELECT post_id, kind, created_at FROM blog_fts_queue
        WHERE user_id = ?1 AND created_at <= ?2
        ORDER BY created_at ASC LIMIT ?3`,
    )
    .bind(userId, cutoff, max)
    .all<BlogFtsQueueRow>()
  if (!results.length) return 0

  const upsertIds = results.filter((item) => item.kind === 'upsert').map((item) => item.post_id)
  const posts = await loadIndexablePosts(db, userId, upsertIds)

  let statements: D1PreparedStatement[] = []
  for (const item of results) {
    const itemStatements = buildBlogFtsItemStatements(db, userId, item, posts.get(item.post_id))
    if (statements.length && statements.length + itemStatements.length > BLOG_FTS_STATEMENT_BATCH) {
      await db.batch(statements)
      statements = []
    }
    statements.push(...itemStatements)
  }
  if (statements.length) await db.batch(statements)
  return results.length
}

export async function hasPendingBlogFtsWork(db: D1Database, userId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS pending FROM blog_fts_queue WHERE user_id = ?1 LIMIT 1`)
    .bind(userId)
    .first<{ pending: number }>()
  return row?.pending === 1
}

export async function drainAllBlogFtsQueues(db: D1Database, maxUsers = 20): Promise<number> {
  const users = await selectQueueUsersRoundRobin(
    db,
    'blog_fts_queue',
    BLOG_FTS_DRAIN_CURSOR_META_KEY,
    maxUsers,
  )
  let processed = 0
  for (const user_id of users) {
    processed += await drainBlogFtsQueue(db, user_id, BLOG_FTS_DRAIN_ALL_BATCH)
  }
  return processed
}

// The rows an index may not keep: one whose post is gone. A post in the bin keeps its row — the bin
// can restore it, and the public read filters it out anyway — so only a purge makes an orphan.
const BLOG_FTS_ORPHAN_SQL = `NOT EXISTS (SELECT 1 FROM blog_posts p
  WHERE p.id = blog_posts_fts.post_id AND p.user_id = ?1)`

export interface BlogFtsIndexAudit {
  posts: number
  rows: number
  indexed: number
  duplicateRows: number
  orphanRows: number
}

/** Counts what the index holds against what it should hold, per account. */
export async function auditBlogFtsIndex(db: D1Database, userId: string): Promise<BlogFtsIndexAudit> {
  const posts = await db
    .prepare(`SELECT COUNT(*) AS n FROM blog_posts WHERE user_id = ?1`)
    .bind(userId)
    .first<{ n: number }>()
  const rows = await db
    .prepare(
      `SELECT COUNT(*) AS rows, COUNT(DISTINCT post_id) AS indexed,
              COUNT(*) - COUNT(DISTINCT post_id) AS duplicates
         FROM blog_posts_fts WHERE user_id = ?1`,
    )
    .bind(userId)
    .first<{ rows: number; indexed: number; duplicates: number }>()
  const orphans = await db
    .prepare(`SELECT COUNT(*) AS n FROM blog_posts_fts WHERE user_id = ?1 AND ${BLOG_FTS_ORPHAN_SQL}`)
    .bind(userId)
    .first<{ n: number }>()
  return {
    posts: posts?.n ?? 0,
    rows: rows?.rows ?? 0,
    indexed: rows?.indexed ?? 0,
    duplicateRows: rows?.duplicates ?? 0,
    orphanRows: orphans?.n ?? 0,
  }
}

/** How many drain passes one rebuild makes before leaving the rest to the regular drains. */
const BLOG_FTS_REBUILD_DRAIN_ROUNDS = 100

/**
 * The repair path. Every post of the account is re-enqueued — not only the ones that look stale,
 * because an index that lost queue rows has nothing to tell a stale row from a fresh one — and the
 * queue is drained without the write delay, so an operator does not wait out the ten seconds a
 * just-queued write would normally sit. What no post owns is dropped, and the result is audited:
 * reporting a finished rebuild over a drifted index is the silence this path exists to break.
 */
export async function rebuildBlogFtsIndex(db: D1Database, userId: string): Promise<number> {
  const queued = await enqueueAllBlogPosts(db, userId)
  for (let round = 0; round < BLOG_FTS_REBUILD_DRAIN_ROUNDS; round++) {
    if (!(await drainBlogFtsQueue(db, userId, BLOG_FTS_DRAIN_ALL_BATCH, true))) break
  }
  await db.prepare(`DELETE FROM blog_posts_fts WHERE user_id = ?1 AND ${BLOG_FTS_ORPHAN_SQL}`).bind(userId).run()
  const audit = await auditBlogFtsIndex(db, userId)
  if (audit.duplicateRows || audit.orphanRows) {
    throw new Error(
      `The blog full text index did not converge: ${audit.duplicateRows} rows beyond the first for their post, ` +
      `${audit.orphanRows} rows whose post is gone, ${audit.indexed} of ${audit.posts} posts indexed`,
    )
  }
  return queued
}

/**
 * Every row of `blog_posts`, trashed ones included: the bin can put a post back and a restore does
 * not enqueue one, so the index keeps a row from the moment the post is written until the moment
 * it is purged. The upsert is the monotonic one the write path uses, so a newer write keeps its
 * version and the drain that entry feeds is the one that will win.
 */
async function enqueueAllBlogPosts(db: D1Database, userId: string): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO blog_fts_queue (user_id, post_id, kind, created_at)
       SELECT user_id, id, 'upsert', ?2 FROM blog_posts WHERE user_id = ?1
       ON CONFLICT(user_id, post_id) DO UPDATE SET
         kind = excluded.kind,
         created_at = CASE
           WHEN excluded.created_at > blog_fts_queue.created_at THEN excluded.created_at
           ELSE blog_fts_queue.created_at + 1
         END`,
    )
    .bind(userId, Date.now())
    .run()
  return result.meta.changes ?? 0
}
