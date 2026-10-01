import type { BlogComment, BlogCommentStatus, BlogPost, BlogPostIndexEntry, BlogPostSummary, BlogTrashEntry } from '@shared/types'
import type { BlogCommentModerationRow, BlogPostIndexRow, BlogPostRow, BlogPostSummaryRow, BlogTrashRow } from '../../db/rows'

/** The body-free shape every list and index answer shares; `toBlogPost` adds the body on top of it. */
export function toBlogPostSummary(row: BlogPostSummaryRow): BlogPostSummary {
  return {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    userId: row.user_id,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    folderId: row.folder_id || null,
    tags: JSON.parse(row.tags || '[]'),
    isPublished: Boolean(row.is_published),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: row.views || 0,
    commentsCount: row.comments_count || 0,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...toBlogSeoFields(row),
  }
}

/**
 * The per-post search and social preview values (FEA-02). The row stores text and a 0/1 flag; every
 * reader gets the same shape, so the public post page and the management list cannot disagree about
 * what an empty value means.
 */
export function toBlogSeoFields(row: {
  seo_title: string
  seo_description: string
  seo_image_url: string
  seo_canonical_url: string
  seo_noindex: number
}): Pick<BlogPostSummary, 'seoTitle' | 'seoDescription' | 'seoImageUrl' | 'seoCanonicalUrl' | 'seoNoindex'> {
  return {
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    seoImageUrl: row.seo_image_url || '',
    seoCanonicalUrl: row.seo_canonical_url || '',
    seoNoindex: Boolean(row.seo_noindex),
  }
}

/** A recycle-bin row: the list's own shape plus when the post was thrown away. */
export function toBlogTrashEntry(row: BlogTrashRow): BlogTrashEntry {
  return { ...toBlogPostSummary(row), deletedAt: row.deleted_at }
}

export function toBlogPostIndexEntry(row: BlogPostIndexRow): BlogPostIndexEntry {
  return {
    id: row.id,
    noteId: row.note_id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    folderId: row.folder_id || null,
    tags: JSON.parse(row.tags || '[]'),
    publishedAt: row.published_at,
    isPublished: Boolean(row.is_published),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    ...toBlogSeoFields(row),
  }
}

export function toBlogPost(row: BlogPostRow & { comments_count?: number }): BlogPost {
  return {
    ...toBlogPostSummary(row),
    content: row.content,
  }
}

export function toBlogComment(row: BlogCommentModerationRow): BlogComment {
  return {
    id: row.id,
    postId: row.post_id,
    postTitle: row.post_title,
    postSlug: row.post_slug,
    parentId: row.parent_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    authorUrl: row.author_url,
    authorAvatar: row.author_avatar,
    content: row.content,
    status: row.status as BlogCommentStatus,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }
}

export function summarizePostTagCounts(rows: ReadonlyArray<{ tags: string }>): Map<string, number> {
  const countMap = new Map<string, number>()
  for (const row of rows) {
    for (const tag of parsedPostTags(row.tags)) {
      countMap.set(tag, (countMap.get(tag) || 0) + 1)
    }
  }
  return countMap
}

function parsedPostTags(raw: string): string[] {
  let arr: unknown
  try {
    arr = JSON.parse(raw || '[]')
  } catch { /* Corrupt post tags are skipped so one bad row cannot break the dashboard. */ }
  if (!Array.isArray(arr)) return []
  return arr.map((t) => String(t).trim()).filter(Boolean)
}

function tryDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function safeDecodeTagParam(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const tag = raw.trim()
  if (!tag) return undefined
  if (!tag.includes('%')) return tag
  const first = tryDecode(tag).trim()
  const result = (first.includes('%') ? tryDecode(first) : first).trim()
  return result || undefined
}


