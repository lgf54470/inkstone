import type { BlogComment, BlogCommentStatus, BlogPost } from "@shared/types";
import type { BlogCommentModerationRow, BlogPostRow } from "../../db/rows";

export function toBlogPost(row: BlogPostRow & { comments_count?: number }): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    userId: row.user_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
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
