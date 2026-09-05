import { Hono } from "hono";
import type { AppBindings } from "../../env";
import { isValidSlug } from "../../lib/id";
import { renderShareShell } from "./public";

export function registerSharePageRoutes(sharePageRoutes: Hono<AppBindings>): void {
sharePageRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const url = new URL(c.req.url)

  if (!isValidSlug(slug)) {
    return renderShareShell(c, url, null)
  }

  const row = await c.env.DB.prepare(
    `SELECT s.password_hash, s.expires_at, s.is_enabled, n.title, n.excerpt
       FROM shares s JOIN notes n ON n.id = s.note_id AND n.user_id = s.user_id
      WHERE s.slug = ?1 AND n.deleted_at IS NULL`,
  )
    .bind(slug)
    .first<{
      password_hash: string | null
      expires_at: number | null
      is_enabled: number
      title: string
      excerpt: string
    }>()

  if (row && row.is_enabled === 0) {
    return renderShareShell(c, url, null)
  }

  return renderShareShell(c, url, row)
})
}

