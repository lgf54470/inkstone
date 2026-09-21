import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { isValidSlug } from '../../lib/id'
import { collectionTitle, isCollectionTargetType } from '../../lib/share-collections'
import { renderShareShell } from './public'

/**
 * `/c/:slug` (ADR-0005) exists for one reason: a collection is opened by pasting its address, so it
 * needs an HTML shell that can then load the directory. The shell is the share page's, unchanged —
 * same `noindex, nofollow`, same `Cache-Control: no-store` — because a set of pages that blocked
 * indexing while the page listing them allowed it would be an SEO hole in exactly one direction.
 */
export function registerCollectionPageRoutes(collectionPageRoutes: Hono<AppBindings>): void {
  collectionPageRoutes.get('/:slug', async (c) => {
    const slug = c.req.param('slug')
    const url = new URL(c.req.url)
    if (!isValidSlug(slug)) {
      return renderShareShell(c, url, null)
    }
    const row = await c.env.DB.prepare(
      `SELECT user_id, target_type, target_value, password_hash, expires_at, is_enabled
         FROM share_collections WHERE slug = ?1`,
    ).bind(slug).first<{
      user_id: string
      target_type: string
      target_value: string
      password_hash: string | null
      expires_at: number | null
      is_enabled: number
    }>()
    if (!row || row.is_enabled === 0 || !isCollectionTargetType(row.target_type)) {
      return renderShareShell(c, url, null)
    }
    // The collection's own title is a member-facing fact — it is the folder's or tag's name — so it
    // reaches the meta tags through the same path a password-protected share's title does, which is
    // to say it does not reach them at all when there is a password.
    const title = await collectionTitle(c.env.DB, row.user_id, { type: row.target_type, value: row.target_value })
    return renderShareShell(c, url, {
      password_hash: row.password_hash,
      expires_at: row.expires_at,
      title,
      excerpt: '',
    })
  })
}
