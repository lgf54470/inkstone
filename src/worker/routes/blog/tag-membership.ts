import type { BlogTagRow } from '../../db/rows'
import { blogTagNeedles } from './tag-needles'

/**
 * Blog tag memberships live in `blog_posts.tags` as a JSON array of names, and `blog_tags` rows are
 * metadata keyed by the same name (ADR-0007). Every write that changes a name therefore has to move
 * the memberships in the same request; this module owns that move and the tag resolution the routes
 * share, so rename, merge and delete cannot drift apart.
 */

/** Statements per `DB.batch`; D1 rejects oversized batches, and this keeps a rename's payload bounded. */
export const TAG_MEMBERSHIP_BATCH_SIZE = 40

/**
 * One member under a rename/merge/delete. Exact matches and every descendant path move together —
 * the hierarchy is part of the name (`a/b`), and both the list filter and the public tag page already
 * promise that a parent tag covers its descendants.
 */
export function remapTagMember(member: string, from: string, to: string | null): string | null {
  if (member === from) return to
  if (member.startsWith(`${from}/`)) return to === null ? null : `${to}${member.slice(from.length)}`
  return member
}

/**
 * The rewritten array, or `null` when nothing changed (the caller then skips the write). Returns
 * `string[]` because the rewrite also normalizes the non-string legacy members the read side
 * stringifies; duplicates are dropped on the first occurrence so a merge does not leave the same tag
 * twice in one post.
 */
export function rewriteTagMembership(tags: readonly unknown[], from: string, to: string | null): string[] | null {
  const rewritten: string[] = []
  const seen = new Set<string>()
  let changed = false
  for (const member of tags) {
    const mapped = remapTagMember(String(member), from, to)
    if (mapped !== member) changed = true
    if (mapped === null) continue
    if (seen.has(mapped)) {
      changed = true
      continue
    }
    seen.add(mapped)
    rewritten.push(mapped)
  }
  return changed ? rewritten : null
}

export interface ResolvedBlogTag {
  name: string
  row: BlogTagRow | null
}

export const BLOG_TAG_SELECT = 'id, user_id, name, color, is_pinned, created_at'

/**
 * A tag reference from the client is a row id when the tag has a row and its own name when it is
 * derived (`GET /api/blog/tags` hands out `id = name` for those), so both spellings resolve here.
 * The membership probe is scoped to posts the counts see (the bin is excluded on purpose — a tag that
 * only lives in trashed posts is not a tag the author can act on).
 */
export async function resolveBlogTag(db: D1Database, userId: string, ref: string): Promise<ResolvedBlogTag | null> {
  const rowById = await db.prepare(
    `SELECT ${BLOG_TAG_SELECT} FROM blog_tags WHERE id = ?1 AND user_id = ?2`,
  ).bind(ref, userId).first<BlogTagRow>()
  if (rowById) return { name: rowById.name, row: rowById }

  const rowByName = await db.prepare(
    `SELECT ${BLOG_TAG_SELECT} FROM blog_tags WHERE user_id = ?1 AND name = ?2`,
  ).bind(userId, ref).first<BlogTagRow>()
  if (rowByName) return { name: rowByName.name, row: rowByName }

  if (await blogTagHasMembers(db, userId, ref)) return { name: ref, row: null }
  return null
}

/** Whether any live post carries this tag (or a descendant of it). */
export async function blogTagHasMembers(db: D1Database, userId: string, name: string): Promise<boolean> {
  const [exact, descendant] = blogTagNeedles(name)
  const found = await db.prepare(
    `SELECT 1 FROM blog_posts
      WHERE user_id = ?1 AND deleted_at IS NULL
        AND (tags LIKE ?2 ESCAPE '\\' OR tags LIKE ?3 ESCAPE '\\')
      LIMIT 1`,
  ).bind(userId, exact, descendant).first()
  return Boolean(found)
}

/** How many posts the last move rewrote; the routes report it and the tests assert on it. */
export async function moveBlogTagMemberships(
  db: D1Database,
  userId: string,
  from: string,
  to: string | null,
): Promise<number> {
  const [exact, descendant] = blogTagNeedles(from)
  const now = Date.now()
  // `json_valid`/`json_type` keep a malformed legacy row out of the rewrite instead of throwing on
  // JSON.parse — the read side treats such a row as having no tags, and rewriting it would replace
  // whatever it holds with a value this code invented.
  const { results } = await db.prepare(
    `SELECT id, tags FROM blog_posts
      WHERE user_id = ?1
        AND json_valid(tags) AND json_type(tags) = 'array'
        AND (tags LIKE ?2 ESCAPE '\\' OR tags LIKE ?3 ESCAPE '\\')`,
  ).bind(userId, exact, descendant).all<{ id: string; tags: string }>()

  const updates: D1PreparedStatement[] = []
  for (const row of results ?? []) {
    const rewritten = rewriteTagMembership(JSON.parse(row.tags) as unknown[], from, to)
    if (!rewritten) continue
    updates.push(
      db.prepare('UPDATE blog_posts SET tags = ?1, updated_at = ?2 WHERE id = ?3 AND user_id = ?4')
        .bind(JSON.stringify(rewritten), now, row.id, userId),
    )
  }

  for (let index = 0; index < updates.length; index += TAG_MEMBERSHIP_BATCH_SIZE) {
    await db.batch(updates.slice(index, index + TAG_MEMBERSHIP_BATCH_SIZE))
  }
  return updates.length
}
