import { z } from "zod";
import { Hono } from "hono";
import type { BlogPost, BlogSettings } from "@shared/types";
import type { AppBindings } from "../../env";
import { JSON_BODY_LIMITS, readJsonValidated } from "../../lib/request";
import { requireAuth } from "../../middleware/auth";
import { getMeta, setMeta } from "../../db/metadata";
import type { BlogPostRow } from "../../db/rows";
import { blogSettingsSchema } from './schemas';

export const DEFAULT_BLOG_SETTINGS: BlogSettings = {
  siteName: 'Inkstone Blog',
  subtitle: 'Deep thoughts and quiet reflections',
  bio: 'Thoughts, essays, and stories powered by Inkstone and Astro.',
  authorName: 'Inkstone Writer',
  authorAvatar: '',
  socialLinks: {
    github: '',
    twitter: '',
    email: '',
    website: '',
  },
  requireCommentApproval: true,
  postsPerPage: 10,
  frontendUrl: 'http://localhost:4321',
  appearance: {
    theme: 'system',
    accent: 'cinnabar',
    background: 'paper',
    density: 'comfortable',
    language: 'zh-CN',
  },
}

// Helper: load blog settings from app_meta
export async function getBlogSettings(db: D1Database, userId?: string): Promise<BlogSettings> {
  const metaKey = userId ? `blog_settings_${userId}` : 'blog_settings_global'
  const raw = await getMeta(db, metaKey)
  if (!raw) return DEFAULT_BLOG_SETTINGS
  try {
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_BLOG_SETTINGS,
      ...parsed,
      appearance: { ...DEFAULT_BLOG_SETTINGS.appearance, ...(parsed.appearance || {}) },
      socialLinks: { ...DEFAULT_BLOG_SETTINGS.socialLinks, ...(parsed.socialLinks || {}) },
    }
  } catch {
    return DEFAULT_BLOG_SETTINGS
  }
}

export async function saveBlogSettings(db: D1Database, settings: z.infer<typeof blogSettingsSchema>, userId?: string): Promise<BlogSettings> {
  const current = await getBlogSettings(db, userId)
  const merged: BlogSettings = {
    ...current,
    ...settings,
    appearance: { ...current.appearance, ...(settings.appearance || {}) },
    socialLinks: { ...current.socialLinks, ...(settings.socialLinks || {}) },
  }
  const metaKey = userId ? `blog_settings_${userId}` : 'blog_settings_global'
  await setMeta(db, metaKey, JSON.stringify(merged))
  return merged
}

export function registerBlogSettingsRoutes(blogManageRoutes: Hono<AppBindings>): void {
// 2. Settings
blogManageRoutes.get('/settings', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const settings = await getBlogSettings(c.env.DB, userId)
  return c.json({ settings })
})

blogManageRoutes.patch('/settings', requireAuth, async (c) => {
  const userId = c.get('userId')!
  const body = await readJsonValidated(c, blogSettingsSchema, JSON_BODY_LIMITS.note)
  const settings = await saveBlogSettings(c.env.DB, body, userId)
  return c.json({ settings })
})

// 3. Slug availability check
blogManageRoutes.get('/check-slug', requireAuth, async (c) => {
  const slug = c.req.query('slug')?.trim() || ''
  const currentPostId = c.req.query('currentPostId')?.trim()

  if (!slug) return c.json({ available: false, reason: 'Slug cannot be empty' })
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(slug)) {
    return c.json({ available: false, reason: 'Slug must be 2-80 characters (letters, numbers, hyphens, underscores)' })
  }

  const existing = await c.env.DB
    .prepare('SELECT id FROM blog_posts WHERE slug = ?1')
    .bind(slug)
    .first<{ id: string }>()

  if (!existing || (currentPostId && existing.id === currentPostId)) {
    return c.json({ available: true })
  }
  return c.json({ available: false, reason: 'Slug is already in use' })
})

// 4. Get post by noteId
blogManageRoutes.get('/note-post/:noteId', requireAuth, async (c) => {
  const noteId = c.req.param('noteId')
  const userId = c.get('userId')!

  const row = await c.env.DB
    .prepare('SELECT * FROM blog_posts WHERE note_id = ?1 AND user_id = ?2')
    .bind(noteId, userId)
    .first<BlogPostRow>()

  if (!row) {
    return c.json({ post: null })
  }

  const post: BlogPost = {
    id: row.id,
    slug: row.slug,
    noteId: row.note_id,
    userId: row.user_id,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    coverUrl: row.cover_url,
    categoryId: row.category_id,
    tags: JSON.parse(row.tags || '[]'),
    isPublished: Boolean(row.is_published),
    allowComments: Boolean(row.allow_comments),
    isPinned: Boolean(row.is_pinned),
    views: row.views || 0,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  return c.json({ post })
})
}

