import { Hono } from 'hono'
import { LIMITS } from '@shared/constants'
import type { BlogMediaItem } from '@shared/types'
import type { AppBindings } from '../../env'
import { ApiError } from '../../lib/errors'
import { newId } from '../../lib/id'
import { safeAttachmentMime } from '../../lib/image'
import { FORM_BODY_LIMITS, readFormDataWithinLimit } from '../../lib/request'
import { enforceAttachmentUploadBudget } from '../../lib/upload-budget'
import { readAttachmentObjectStreamForRow } from '../../attachments/backend'
import { drainAttachmentCleanup } from '../../attachments/cleanup'
import { attachmentCleanupTarget, attachmentObjectKeyCandidates, type AttachmentObjectStorage } from '../../attachments/keys'
import { persistAttachmentWithinQuota } from '../../attachments/storage'
import { blogOwnerOf } from './owner'

/**
 * The blog's own media library (FEA-07). It is the attachment library seen through a narrower
 * question — "which pictures may a post use as its cover" — so it lists the account's images (and
 * only images), accepts an upload through the same storage, quota and validation path as every
 * other attachment, and refuses to delete a picture a post or a note is still using. The public
 * half lives here too: a picture is served to readers only while a published post of its owner
 * shows it, which is what makes a cover work without opening the attachment library to the world.
 */

/** The library is a picker, not an archive: past this the author uploads fewer or searches by hand. */
export const BLOG_MEDIA_LIST_LIMIT = 200

export function registerBlogMediaRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogMediaListRoute(blogManageRoutes)
  registerBlogMediaUploadRoute(blogManageRoutes)
  registerBlogMediaDeleteRoute(blogManageRoutes)
}

interface BlogMediaRow {
  id: string
  filename: string
  mime: string
  size: number
  width: number | null
  height: number | null
  created_at: number
}

function toBlogMediaItem(row: BlogMediaRow): BlogMediaItem {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    // The picker draws the owner's own attachment through the attachment route (which serves it to
    // its owner), and the cover it hands back is the public address the reader-facing page may use.
    previewUrl: `/api/files/${row.id}?preview=1`,
    publicUrl: `/api/blog/public/media/${row.id}`,
  }
}

/** The public address of an attachment, as a stored cover URL carries it. */
function blogPublicMediaPath(id: string): string {
  return `/api/blog/public/media/${id}`
}

function registerBlogMediaListRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/media', async (c) => {
    const userId = c.get('userId')!
    const { results } = await c.env.DB
      .prepare(`
        SELECT id, filename, mime, size, width, height, created_at
          FROM attachments
         WHERE user_id = ?1 AND mime LIKE 'image/%'
         ORDER BY created_at DESC, id DESC
         LIMIT ?2
      `)
      .bind(userId, BLOG_MEDIA_LIST_LIMIT)
      .all<BlogMediaRow>()
    return c.json({ media: (results || []).map(toBlogMediaItem) })
  })
}

function registerBlogMediaUploadRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.post('/media', async (c) => {
    const userId = c.get('userId')!
    await enforceAttachmentUploadBudget(c.env.DB, userId)

    const form = await readFormDataWithinLimit(c.req, FORM_BODY_LIMITS.attachment)
    const file = form.get('file')
    if (!(file instanceof File)) throw ApiError.badRequest('Missing file field')
    if (file.size > LIMITS.attachmentMaxBytes) {
      throw ApiError.tooLarge('The file exceeds the 25 MB limit')
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    // A cover is an `<img>`: the upload is checked before anything is stored, so a PDF or a script
    // never becomes a library entry the picker would offer as a picture.
    const mime = safeAttachmentMime(bytes, file.type)
    if (!mime.startsWith('image/')) {
      throw ApiError.badRequest('Only image files can be used as a cover')
    }

    const id = newId()
    const now = Date.now()
    const stored = await persistAttachmentWithinQuota(c.env, {
      id,
      userId,
      noteId: null,
      filename: file.name || 'image',
      reportedMime: file.type,
      bytes,
      createdAt: now,
    })

    return c.json(toBlogMediaItem({
      id,
      filename: stored.filename,
      mime: stored.mime,
      size: bytes.byteLength,
      width: stored.width,
      height: stored.height,
      created_at: now,
    }), 201)
  })
}

function registerBlogMediaDeleteRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.delete('/media/:id', async (c) => {
    const userId = c.get('userId')!
    const id = c.req.param('id')
    const row = await c.env.DB
      .prepare(`
        SELECT id, user_id, note_id, filename, mime, storage, object_key, created_at
          FROM attachments WHERE id = ?1 AND user_id = ?2
      `)
      .bind(id, userId)
      .first<{
        id: string
        user_id: string
        note_id: string | null
        filename: string
        mime: string
        storage: AttachmentObjectStorage
        object_key: string
        created_at: number
      }>()
    if (!row) throw ApiError.notFound('Media not found')

    // A picture a note is using or a post is showing is not the library's to remove: the first
    // would break the note's own attachment list, the second would break a live cover. Both
    // refusals name the caller's next step instead of deleting quietly.
    if (row.note_id) {
      throw ApiError.badRequest('This image belongs to a note; remove it from the attachment library instead')
    }
    const used = await firstPostUsingMedia(c.env.DB, userId, id)
    if (used) {
      throw ApiError.badRequest(`This image is the cover of "${used.title}"; change that post first`)
    }

    await c.env.DB.batch([
      ...attachmentObjectKeyCandidates(row).map((key) =>
        c.env.DB.prepare(
          `INSERT OR IGNORE INTO attachment_cleanup (object_key, user_id, created_at)
           SELECT ?1, user_id, ?2 FROM attachments WHERE id = ?3 AND user_id = ?4`,
        ).bind(attachmentCleanupTarget(row.storage, key), Date.now(), row.id, userId),
      ),
      c.env.DB.prepare(`DELETE FROM attachments WHERE id = ?1 AND user_id = ?2`).bind(row.id, userId),
    ])
    // A failed drain is safe: the cleanup row stays queued and the next scheduled run retries it.
    void drainAttachmentCleanup(c.env, userId).catch(() => {})
    return c.json({ ok: true })
  })
}

/** The first post of the account that still shows this image, in either cover slot. */
async function firstPostUsingMedia(
  db: D1Database,
  userId: string,
  id: string,
): Promise<{ title: string } | null> {
  const needle = `%${blogPublicMediaPath(id)}%`
  return db
    .prepare(`
      SELECT title FROM blog_posts
       WHERE user_id = ?1 AND deleted_at IS NULL
         AND (cover_url LIKE ?2 ESCAPE '\\' OR seo_image_url LIKE ?2 ESCAPE '\\')
       LIMIT 1
    `)
    .bind(userId, needle)
    .first<{ title: string }>()
}

interface BlogMediaObjectRow {
  id: string
  user_id: string
  storage: AttachmentObjectStorage
  object_key: string
  mime: string
}

function registerBlogPublicMediaRoute(blogPublicRoutes: Hono<AppBindings>): void {
  blogPublicRoutes.get('/media/:id', async (c) => {
    const id = c.req.param('id')
    const ownerId = blogOwnerOf(c).userId
    const row = await c.env.DB
      .prepare(`
        SELECT id, user_id, storage, object_key, mime
          FROM attachments WHERE id = ?1 AND user_id = ?2 AND mime LIKE 'image/%'
      `)
      .bind(id, ownerId)
      .first<BlogMediaObjectRow>()
    if (!row) throw ApiError.notFound('Media not found')

    // A stored cover URL is the only reason this picture is public: an attachment the blog has not
    // published stays private no matter who asks for it.
    if (!(await blogMediaInUse(c.env.DB, ownerId, id))) throw ApiError.notFound('Media not found')

    const object = await readAttachmentObjectStreamForRow(c.env, {
      id: row.id,
      user_id: row.user_id,
      storage: row.storage,
      object_key: row.object_key,
      mime: row.mime,
      filename: '',
      created_at: 0,
    })
    if (!object) throw ApiError.notFound('Media data is missing')

    return new Response(object.body as BodyInit, {
      headers: {
        'Content-Type': row.mime,
        // The bytes behind an id never change (re-uploading stores a new id), so a reader's browser
        // and any cache in front of it may keep this for a while without asking again.
        'Cache-Control': 'public, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  })
}

/** A picture may be served publicly only while a published post of its owner shows it (FEA-07). */
async function blogMediaInUse(db: D1Database, userId: string, id: string): Promise<boolean> {
  const needle = `%${blogPublicMediaPath(id)}%`
  const row = await db
    .prepare(`
      SELECT 1 AS used FROM blog_posts
       WHERE user_id = ?1 AND deleted_at IS NULL AND is_published = 1
         AND (cover_url LIKE ?2 ESCAPE '\\' OR seo_image_url LIKE ?2 ESCAPE '\\')
       LIMIT 1
    `)
    .bind(userId, needle)
    .first<{ used: number }>()
  return Boolean(row)
}

/** The reader-facing half of the media library, mounted under `/api/blog/public`. */
export function registerBlogPublicMediaRoutes(blogPublicRoutes: Hono<AppBindings>): void {
  registerBlogPublicMediaRoute(blogPublicRoutes)
}
