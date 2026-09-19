import { Hono } from 'hono'
import type { AppBindings } from '../../env'
import { isValidSlug } from '../../lib/id'
import { renderShareShell } from '../share'

export const musicPageRoutes = new Hono<AppBindings>()

// The anonymous playlist page (M-51): the shell only decides the <title> and
// noindex; the viewer itself is the client app routed at /playlist/:slug.
musicPageRoutes.get('/:slug', async (c) => {
  const slug = c.req.param('slug')
  const url = new URL(c.req.url)
  if (!isValidSlug(slug)) return renderShareShell(c, url, null)
  const row = await c.env.DB
    .prepare('SELECT name, description FROM music_playlists WHERE share_slug = ?1')
    .bind(slug)
    .first<{ name: string; description: string }>()
  return renderShareShell(c, url, row ? { password_hash: null, expires_at: null, title: row.name, excerpt: row.description } : null)
})
