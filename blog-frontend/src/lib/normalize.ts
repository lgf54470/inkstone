import type {
  BlogPost,
  BlogCategory,
  BlogTag,
  BlogComment,
  BlogSiteInfo,
  TimelineGroup,
  CalendarDayPost,
} from './types'
import { FALLBACK_SITE_INFO } from './fallbacks'

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return 0
}

function toTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function extractCoverUrl(raw?: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const mdMatch = /!\[.*?\]\(([^)\s]+)/.exec(trimmed)
  if (mdMatch) return mdMatch[1]
  const parenMatch = /\(([^)\s]+)\)/.exec(trimmed)
  if (parenMatch) return parenMatch[1]
  return trimmed
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

export function normalizePost(value: unknown): BlogPost {
  const p = asRecord(value)
  return {
    id: asString(p.id),
    noteId: asString(p.noteId) || asString(p.note_id),
    title: asString(p.title),
    slug: asString(p.slug),
    excerpt: asString(p.excerpt),
    content: asString(p.content),
    coverUrl: extractCoverUrl(asString(p.coverUrl) || asString(p.cover_url)),
    categoryId: asString(p.categoryId) || asString(p.category_id) || null,
    tags: parseTags(p.tags),
    isPublished: Boolean(p.isPublished ?? p.is_published ?? true),
    publishedAt: toTimestamp(p.publishedAt) || toTimestamp(p.published_at) || Date.now(),
    allowComments: Boolean(p.allowComments ?? p.allow_comments ?? true),
    isPinned: Boolean(p.isPinned ?? p.is_pinned ?? false),
    views: toNumber(p.views),
    commentsCount: toNumber(p.commentsCount) || toNumber(p.comments_count) || 0,
    createdAt: toTimestamp(p.createdAt) || toTimestamp(p.created_at) || Date.now(),
    updatedAt: toTimestamp(p.updatedAt) || toTimestamp(p.updated_at) || Date.now(),
  }
}

export function normalizeSiteInfo(value: unknown): BlogSiteInfo {
  const raw = asRecord(value)
  const settings = asRecord(raw.settings || raw.site)
  const links = asRecord(settings.socialLinks)
  return {
    siteName: asString(settings.siteName) || FALLBACK_SITE_INFO.siteName,
    subtitle: asString(settings.subtitle) || FALLBACK_SITE_INFO.subtitle,
    bio: asString(settings.bio) || FALLBACK_SITE_INFO.bio,
    authorName: asString(settings.authorName) || FALLBACK_SITE_INFO.authorName,
    authorAvatar: asString(settings.authorAvatar),
    socialLinks: {
      github: asString(links.github) || FALLBACK_SITE_INFO.socialLinks.github,
      twitter: asString(links.twitter) || undefined,
      email: asString(links.email) || undefined,
      website: asString(links.website) || undefined,
    },
    postsPerPage: toNumber(settings.postsPerPage) || 10,
    requireCommentApproval: Boolean(settings.requireCommentApproval),
  }
}

export function normalizeCategory(value: unknown): BlogCategory {
  const c = asRecord(value)
  return {
    id: asString(c.id),
    name: asString(c.name),
    slug: asString(c.slug),
    description: asString(c.description),
    color: asString(c.color) || 'var(--accent)',
    icon: asString(c.icon) || undefined,
    postsCount: toNumber(c.postsCount) || toNumber(c.posts_count) || 0,
    createdAt: toTimestamp(c.createdAt) || toTimestamp(c.created_at) || Date.now(),
    updatedAt: toTimestamp(c.updatedAt) || toTimestamp(c.updated_at) || Date.now(),
  }
}

export function normalizeTag(value: unknown): BlogTag {
  const t = asRecord(value)
  return {
    name: asString(t.name),
    postsCount: toNumber(t.postsCount) || toNumber(t.posts_count) || 0,
  }
}

export function normalizeTimelineGroup(value: unknown): TimelineGroup {
  const group = asRecord(value)
  return {
    year: toNumber(group.year),
    months: asArray(group.months).map((m) => {
      const month = asRecord(m)
      return {
        month: toNumber(month.month),
        posts: asArray(month.posts).map((p) => {
          const post = asRecord(p)
          return {
            id: asString(post.id),
            title: asString(post.title),
            slug: asString(post.slug),
            publishedAt: toTimestamp(post.publishedAt) || toTimestamp(post.published_at) || Date.now(),
            coverUrl: extractCoverUrl(asString(post.coverUrl) || asString(post.cover_url)),
            views: toNumber(post.views),
          }
        }),
      }
    }),
  }
}

export function normalizeCalendarDay(value: unknown): CalendarDayPost {
  const day = asRecord(value)
  return {
    date: asString(day.date),
    count: toNumber(day.count),
    posts: asArray(day.posts).map((p) => {
      const post = asRecord(p)
      return { title: asString(post.title), slug: asString(post.slug) }
    }),
  }
}

const COMMENT_STATUSES = ['pending', 'approved', 'rejected', 'spam'] as const

function commentStatus(value: unknown): BlogComment['status'] {
  const status = asString(value)
  return (COMMENT_STATUSES as readonly string[]).includes(status) ? (status as BlogComment['status']) : 'approved'
}

export function normalizeComment(value: unknown): BlogComment {
  const c = asRecord(value)
  return {
    id: asString(c.id),
    postId: asString(c.post_id) || asString(c.postId),
    parentId: asString(c.parent_id) || asString(c.parentId) || null,
    authorName: asString(c.author_name) || asString(c.authorName),
    authorEmail: asString(c.author_email) || asString(c.authorEmail),
    authorUrl: asString(c.author_url) || asString(c.authorUrl) || undefined,
    avatarUrl: asString(c.author_avatar) || asString(c.authorAvatar) || undefined,
    content: asString(c.content),
    status: commentStatus(c.status),
    createdAt: toTimestamp(c.created_at) || toTimestamp(c.createdAt) || Date.now(),
    updatedAt: toTimestamp(c.updated_at) || toTimestamp(c.updatedAt) || Date.now(),
  }
}