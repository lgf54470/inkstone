import { ApiError } from '../../lib/errors'
import { publicPostVisibleSql } from './publish-moment'

/**
 * A renamed post keeps answering on its old address. Two questions meet here, and they pull in
 * opposite directions:
 *
 * - **Taking** a slug makes it a live address, so any redirect recorded for it is no longer true. It
 *   has to go whether the row belonged to another post (that post moved on long ago) or to this one
 *   (renamed back to an address it retired). A brand-new post taking an old slug is the same
 *   question: without the cleanup the reader would be sent to a different post.
 * - **Retiring** a slug records it against the post that is leaving it, so the old link lands.
 *
 * The statements ride in the same batch as the write they belong to: a rename cannot land with its
 * history missing (a dead link) or with history pointing at an address that was never released.
 */

/**
 * The full take-and-retire pair for a write that moves a post's address, and nothing when the
 * address did not move. Shared by the create/upsert/patch paths and the revision restore so none of
 * them can apply half of it.
 */
export function slugMoveStatements({ db, userId, postId, from, to, now }: {
  db: D1Database
  userId: string
  postId: string
  from: string
  to: string
  now: number
}): D1PreparedStatement[] {
  if (from === to) return []
  return renameSlugStatements({ db, userId, postId, previousSlug: from, nextSlug: to, now })
}

/**
 * Whether a slug is free inside this account: another blog may publish the same name — that is a
 * different site — so the question is scoped to the owner.
 */
export async function assertSlugFree(db: D1Database, userId: string, slug: string, excludeId?: string): Promise<void> {
  const conflict = excludeId
    ? await db.prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND slug = ?2 AND id != ?3')
        .bind(userId, slug, excludeId).first()
    : await db.prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND slug = ?2')
        .bind(userId, slug).first()
  if (conflict) throw ApiError.conflict('Slug already exists')
}

export interface TakenSlug {
  db: D1Database
  userId: string
  /** The slug the post now answers on. */
  slug: string
}

/** The redirect for a slug that is being taken has to be removed — it is a live address again. */
export function claimSlugStatements({ db, userId, slug }: TakenSlug): D1PreparedStatement[] {
  return [db.prepare('DELETE FROM blog_post_slugs WHERE user_id = ?1 AND slug = ?2').bind(userId, slug)]
}

export interface RenamedSlug {
  db: D1Database
  userId: string
  postId: string
  /** The slug the post answered on until now; the one that has to keep working. */
  previousSlug: string
  /** The slug the post is leaving behind, so any redirect for it is no longer true. */
  nextSlug: string
  now: number
}

export function renameSlugStatements({ db, userId, postId, previousSlug, nextSlug, now }: RenamedSlug): D1PreparedStatement[] {
  return [
    // `INSERT OR REPLACE` covers a post renamed back to a slug it retired before: the row is one
    // address, and the fresh timestamp is what "retired from" means from here on.
    db
      .prepare(
        `INSERT OR REPLACE INTO blog_post_slugs (post_id, user_id, slug, created_at)
         VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(postId, userId, previousSlug, now),
    ...claimSlugStatements({ db, userId, slug: nextSlug }),
  ]
}

/**
 * The current address of the post that retired this slug, for the reader who asked for the old one. A
 * post that is not readable right now (unpublished, or scheduled for later) is not an answer: sending
 * a reader to a page that says nothing is worse than the 404 they asked for, so the same visibility
 * rule every reader-facing query uses is applied here too.
 */
export async function resolveRetiredSlug(db: D1Database, userId: string, slug: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT p.slug AS slug
       FROM blog_post_slugs h
       JOIN blog_posts p ON p.id = h.post_id AND p.user_id = h.user_id
       WHERE h.user_id = ?1 AND h.slug = ?2 AND ${publicPostVisibleSql('p')}`,
    )
    .bind(userId, slug)
    .first<{ slug: string }>()
  return row?.slug ?? null
}
