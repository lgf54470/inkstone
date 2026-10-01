import type { z } from 'zod'
import { extractCoverUrl } from '@shared/markdown-utils'
import { ApiError } from '../../lib/errors'
import { newSlug } from '../../lib/id'
import { blogPostWriteSchema } from './schemas'

/** A post address: lowercase, 2–80 characters, drawn from the alphabet a URL carries unescaped. */
export const SLUG_RE = /^[a-zA-Z0-9_-]{2,80}$/

export interface PostSource {
  noteTitle: string
  noteContent: string
}

/** The note text a post is written from: what the request carries, or the note it names. */
export async function resolvePostSource(
  db: D1Database,
  userId: string,
  body: { noteId: string; title?: string; content?: string },
): Promise<PostSource> {
  let noteTitle = body.title || ''
  let noteContent = body.content || ''
  if (noteTitle && noteContent) return { noteTitle, noteContent }
  const note = await db
    .prepare('SELECT title, content FROM notes WHERE id = ?1 AND user_id = ?2 AND deleted_at IS NULL')
    .bind(body.noteId, userId)
    .first<{ title: string; content: string }>()
  if (!note) throw ApiError.notFound('Note not found')
  noteTitle = noteTitle || note.title
  noteContent = noteContent || note.content
  return { noteTitle, noteContent }
}

export function normalizedSlug(rawSlug: string | undefined): string {
  const slug = (rawSlug?.trim() || newSlug().slice(0, 8)).toLowerCase()
  if (!SLUG_RE.test(slug)) {
    throw ApiError.badRequest('Invalid slug format')
  }
  return slug
}

export interface PostWriteInput {
  slug: string
  title: string
  excerpt: string
  content: string
  coverUrl: string | null
  categoryId: string | null
  folderId: string | null
  tagsJson: string
  isPublished: number
  publishedAt?: number
  allowComments: number
  isPinned: number
  seoTitle: string
  seoDescription: string
  seoImageUrl: string
  seoCanonicalUrl: string
  seoNoindex: number
}

export function postInputFromBody(
  body: z.infer<typeof blogPostWriteSchema>,
  note: PostSource,
  slug: string,
): PostWriteInput {
  return {
    slug,
    title: note.noteTitle,
    excerpt: body.excerpt || '',
    content: note.noteContent,
    coverUrl: extractCoverUrl(body.coverUrl || ''),
    categoryId: body.categoryId || null,
    folderId: body.folderId || null,
    tagsJson: JSON.stringify(body.tags || []),
    isPublished: body.isPublished !== false ? 1 : 0,
    publishedAt: body.publishedAt,
    allowComments: body.allowComments !== false ? 1 : 0,
    isPinned: body.isPinned ? 1 : 0,
    seoTitle: body.seoTitle || '',
    seoDescription: body.seoDescription || '',
    seoImageUrl: body.seoImageUrl || '',
    seoCanonicalUrl: body.seoCanonicalUrl || '',
    seoNoindex: body.seoNoindex ? 1 : 0,
  }
}

export function updateBlogPost(db: D1Database, id: string, input: PostWriteInput, publishedAt: number): D1PreparedStatement {
  const now = Date.now()
  return db
    .prepare(`
      UPDATE blog_posts SET
        slug = ?1,
        title = ?2,
        excerpt = ?3,
        content = ?4,
        cover_url = ?5,
        category_id = ?6,
        folder_id = ?7,
        tags = ?8,
        is_published = ?9,
        allow_comments = ?10,
        is_pinned = ?11,
        published_at = ?12,
        updated_at = ?13,
        seo_title = ?14,
        seo_description = ?15,
        seo_image_url = ?16,
        seo_canonical_url = ?17,
        seo_noindex = ?18,
        deleted_at = NULL
      WHERE id = ?19
    `)
    .bind(
      input.slug,
      input.title,
      input.excerpt,
      input.content,
      input.coverUrl,
      input.categoryId,
      input.folderId,
      input.tagsJson,
      input.isPublished,
      input.allowComments,
      input.isPinned,
      publishedAt,
      now,
      input.seoTitle,
      input.seoDescription,
      input.seoImageUrl,
      input.seoCanonicalUrl,
      input.seoNoindex,
      id,
    )
}

export function insertBlogPost(
  db: D1Database,
  input: PostWriteInput & { id: string; noteId: string; userId: string },
): D1PreparedStatement {
  const now = Date.now()
  return db
    .prepare(`
      INSERT INTO blog_posts (
        id, slug, note_id, user_id, title, excerpt, content, cover_url,
        category_id, folder_id, tags, is_published, allow_comments, is_pinned, views,
        published_at, created_at, updated_at,
        seo_title, seo_description, seo_image_url, seo_canonical_url, seo_noindex
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?16, ?16,
        ?17, ?18, ?19, ?20, ?21)
    `)
    .bind(
      input.id,
      input.slug,
      input.noteId,
      input.userId,
      input.title,
      input.excerpt,
      input.content,
      input.coverUrl,
      input.categoryId,
      input.folderId,
      input.tagsJson,
      input.isPublished,
      input.allowComments,
      input.isPinned,
      // A new post takes the moment its author picked; without one it went out as it was written.
      input.publishedAt ?? now,
      now,
      input.seoTitle,
      input.seoDescription,
      input.seoImageUrl,
      input.seoCanonicalUrl,
      input.seoNoindex,
    )
}
