import { z } from 'zod'
import { Hono } from 'hono'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogSettings } from '@shared/types'
import type { AppBindings } from '../../env'
import { JSON_BODY_LIMITS, readJsonValidated } from '../../lib/request'
import { requireAuth } from '../../middleware/auth'
import { getMeta, setMeta } from '../../db/metadata'
import type { BlogPostRow } from '../../db/rows'
import { blogSettingsSchema } from './schemas'
import { toBlogPost } from './helpers'


const DEFAULT_BLOG_SETTINGS: BlogSettings = {
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
  frontendUrl: DEFAULT_BLOG_FRONTEND_URL,
  appearance: {
    theme: 'system',
    accent: 'cinnabar',
    background: 'paper',
    density: 'comfortable',
    language: 'zh-CN',
  },
}

/**
 * One blog has one settings row, under a key that names its account. The key used to be optional
 * (`blog_settings_global` when no account was given), which is the shape that made the public side
 * read a row nobody wrote: the only writers always had an account, so a global reader silently got
 * the defaults instead of the blog's settings. The reading and the writing are therefore the same
 * key by construction, not by both callers remembering to pass an account.
 */
export async function getBlogSettings(db: D1Database, userId: string): Promise<BlogSettings> {
  const raw = await getMeta(db, blogSettingsKey(userId))
  if (!raw) return DEFAULT_BLOG_SETTINGS
  try {
    const parsed = JSON.parse(raw) as Partial<BlogSettings>
    return {
      ...DEFAULT_BLOG_SETTINGS,
      ...parsed,
      appearance: { ...DEFAULT_BLOG_SETTINGS.appearance, ...(parsed.appearance || {}) },
      socialLinks: { ...DEFAULT_BLOG_SETTINGS.socialLinks, ...(parsed.socialLinks || {}) },
    }
  } catch (error) {
    // A row that cannot be parsed is reported rather than answered with defaults: the stored value is
    // what this blog will render until someone fixes it, and a silent fallback hides that.
    console.error('[blog] failed to parse stored settings, using defaults:', error instanceof Error ? error.message : error)
    return DEFAULT_BLOG_SETTINGS
  }
}

function blogSettingsKey(userId: string): string {
  return `blog_settings_${userId}`
}


async function saveBlogSettings(db: D1Database, settings: z.infer<typeof blogSettingsSchema>, userId: string): Promise<BlogSettings> {
  const current = await getBlogSettings(db, userId)
  const merged: BlogSettings = {
    ...current,
    ...settings,
    appearance: { ...current.appearance, ...(settings.appearance || {}) },
    socialLinks: { ...current.socialLinks, ...(settings.socialLinks || {}) },
  }
  await setMeta(db, blogSettingsKey(userId), JSON.stringify(merged))
  return merged
}

export function registerBlogSettingsRoutes(blogManageRoutes: Hono<AppBindings>): void {
  registerBlogSettingsGetRoute(blogManageRoutes)
  registerBlogSettingsPatchRoute(blogManageRoutes)
  registerBlogSlugCheckRoute(blogManageRoutes)
  registerBlogNotePostRoute(blogManageRoutes)
}

function registerBlogSettingsGetRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/settings', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const settings = await getBlogSettings(c.env.DB, userId)
    return c.json({ settings })
  })
}

function registerBlogSettingsPatchRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.patch('/settings', requireAuth, async (c) => {
    const userId = c.get('userId')!
    const body = await readJsonValidated(c, blogSettingsSchema, JSON_BODY_LIMITS.note)
    const settings = await saveBlogSettings(c.env.DB, body, userId)
    return c.json({ settings })
  })
}

function registerBlogSlugCheckRoute(blogManageRoutes: Hono<AppBindings>): void {
  blogManageRoutes.get('/check-slug', requireAuth, async (c) => {
    const slug = c.req.query('slug')?.trim() || ''
    const currentPostId = c.req.query('currentPostId')?.trim()

    if (!slug) return c.json({ available: false, reason: 'Slug cannot be empty' })
    if (!/^[a-zA-Z0-9_-]{2,80}$/.test(slug)) {
      return c.json({ available: false, reason: 'Slug must be 2-80 characters (letters, numbers, hyphens, underscores)' })
    }

    // The answer is about this account's own blog: asking whether a slug is free used to report
    // every account's posts, which told one blog's editor what another blog had published.
    const existing = await c.env.DB
      .prepare('SELECT id FROM blog_posts WHERE user_id = ?1 AND slug = ?2')
      .bind(c.get('userId')!, slug)
      .first<{ id: string }>()

    if (!existing || (currentPostId && existing.id === currentPostId)) {
      return c.json({ available: true })
    }
    return c.json({ available: false, reason: 'Slug is already in use' })
  })
}

function registerBlogNotePostRoute(blogManageRoutes: Hono<AppBindings>): void {
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

    return c.json({ post: toBlogPost(row) })
  })
}
