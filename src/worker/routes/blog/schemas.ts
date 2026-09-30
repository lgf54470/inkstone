import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import { isSafeExternalUrl } from '@shared/url-safety'

/**
 * A URL a request carries has to be one the app may render, and the rule is the shared allowlist — a
 * scheme check is only as good as the renderer trusting the same answer. An empty value stays valid:
 * every one of these fields is optional, and "no picture" is not a bad URL.
 */
const SAFE_URL_MESSAGE = 'URL must be http(s), mailto or a site-relative path'

function safeUrl(kind: 'link' | 'image' = 'link') {
  return (value: string | null | undefined) => !value || isSafeExternalUrl(value, kind)
}

/**
 * How many rows one batch or import request may carry.
 *
 * The platform's limit is per statement, not per request — D1 refuses a statement that binds more
 * than 100 variables — and the handlers answer it by splitting the list (see `chunkIds` in
 * `comments.ts`), so this number is not that one. It bounds a single request's work instead: a
 * selection a person made, or a directory they exported, not an arbitrary payload that reaches the
 * route and spends a transaction's worth of statements before anything can be said about it.
 */
const BATCH_ROW_LIMIT = 1000

/** What a card shows of a post before it is cut off; a longer one is a body, not an excerpt. */
const EXCERPT_MAX_LENGTH = 2000

export const blogPostWriteSchema = z.object({
  noteId: z.string().min(1, 'noteId is required'),
  // The shape a post is written in mirrors the note it came from, so the title and excerpt are
  // bounded by the same number the note side uses. The body is bounded by bytes in the handler, not
  // by a character count here: a limit that counts characters does not bound what the row weighs.
  title: z.string().max(LIMITS.titleMaxLength).optional(),
  slug: z.string().max(200).optional(),
  excerpt: z.string().max(EXCERPT_MAX_LENGTH).optional(),
  content: z.string().optional(),
  coverUrl: z.string().nullable().optional().refine(safeUrl('image'), SAFE_URL_MESSAGE),
  categoryId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  isPublished: z.boolean().optional(),
  allowComments: z.boolean().optional(),
  isPinned: z.boolean().optional(),
})

export const blogPostPatchSchema = blogPostWriteSchema.omit({ noteId: true })

export const blogBatchSchema = z.object({
  action: z.enum(['publish', 'unpublish', 'delete', 'setCategory', 'setFolder', 'setPinned']),
  postIds: z.array(z.string()).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} posts per request`),
  categoryId: z.string().nullable().optional(),
  folderId: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
})

export const blogToggleGroupSchema = z.object({
  type: z.enum(['folder', 'tag']),
  target: z.string(),
  enabled: z.boolean(),
})

export const blogScopedFolderSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  parentId: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  position: z.number().optional(),
})

export const blogTagCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().max(50),
  color: z.string().nullable().optional(),
})

export const blogTagPatchSchema = z.object({
  name: z.string().max(50).optional(),
  color: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
})

export const blogCategoryCreateSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

export const blogCategoryPatchSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  position: z.number().optional(),
})

export const blogCommentStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'spam']),
})

export const blogCommentBatchSchema = z.object({
  action: z.enum(['approve', 'reject', 'spam', 'delete']),
  commentIds: z.array(z.string()).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} comments per request`),
})

/**
 * What a page-view beacon carries. The view itself is what is being reported, so the body is only
 * the post it happened on and where the reader came from; everything else (address, user-agent,
 * country) is read off the request rather than trusted from the page.
 */
export const blogVisitBeaconSchema = z.object({
  slug: z.string().min(1).max(200),
  referrer: z.string().max(2048).nullable().optional(),
})

export const blogPublicCommentSchema = z.object({
  postSlug: z.string().min(1).max(200),
  parentId: z.string().max(64).nullable().optional(),
  authorName: z.string().max(100),
  authorEmail: z.string().max(200),
  authorUrl: z.string().max(500).optional().refine(safeUrl(), SAFE_URL_MESSAGE),
  authorAvatar: z.string().max(2048).optional().refine(safeUrl('image'), SAFE_URL_MESSAGE),
  content: z.string().min(1).max(4000),
})

export const blogSettingsSchema = z.object({
  siteName: z.string().optional(),
  subtitle: z.string().optional(),
  bio: z.string().optional(),
  authorName: z.string().optional(),
  authorAvatar: z.string().optional(),
  socialLinks: z.object({
    github: z.string().optional().refine(safeUrl(), SAFE_URL_MESSAGE),
    twitter: z.string().optional().refine(safeUrl(), SAFE_URL_MESSAGE),
    email: z.string().optional().refine(safeUrl(), SAFE_URL_MESSAGE),
    website: z.string().optional().refine(safeUrl(), SAFE_URL_MESSAGE),
  }).optional(),
  requireCommentApproval: z.boolean().optional(),
  postsPerPage: z.number().optional(),
  frontendUrl: z.string().optional().refine(safeUrl(), SAFE_URL_MESSAGE),
  appearance: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    accent: z.string().optional(),
    background: z.enum(['paper', 'white']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    language: z.enum(['zh-CN', 'en-US']).optional(),
  }).optional(),
})

export const blogLinkUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Name is required').max(200),
  url: z.string().min(1, 'URL is required').max(2000).refine(safeUrl(), SAFE_URL_MESSAGE),
  description: z.string().max(1000).optional().default(''),
  avatar: z.string().max(2000).optional().default('').refine(safeUrl('image'), SAFE_URL_MESSAGE),
  email: z.string().max(200).optional().default(''),
  categoryId: z.string().nullable().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional().default('approved'),
  isPinned: z.boolean().optional().default(false),
  pinnedOrder: z.number().int().optional().default(0),
  isFavorite: z.boolean().optional().default(false),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
})

export const blogLinkCategoryUpsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Category name is required').max(100),
  icon: z.string().max(100).nullable().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
})

export const blogLinkStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
})

export const blogLinkPinSchema = z.object({
  isPinned: z.boolean(),
})

export const blogLinkFavoriteSchema = z.object({
  isFavorite: z.boolean(),
})

export const blogLinkBatchSchema = z.object({
  action: z.enum([
    'approve',
    'reject',
    'delete',
    'setCategory',
    'setPinned',
    'pin',
    'unpin',
    'setFavorite',
    'favorite',
    'unfavorite',
  ]),
  linkIds: z.array(z.string()).min(1).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} links per request`),
  categoryId: z.string().nullable().optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
})

export const blogLinkReorderSchema = z.object({
  orders: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int().optional(),
      pinnedOrder: z.number().int().optional(),
    }),
  ).min(1).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} links per request`),
})

export const blogLinkCheckSchema = z.object({
  urls: z.array(z.string().min(1)).min(1).max(15),
})

export const blogPublicLinkRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  url: z.string().min(1, 'URL is required').max(2000).refine(safeUrl(), SAFE_URL_MESSAGE),
  description: z.string().max(1000).optional().default(''),
  avatar: z.string().max(2000).optional().default('').refine(safeUrl('image'), SAFE_URL_MESSAGE),
  email: z.string().max(200).optional().default(''),
})

export const blogLinkImportSchema = z.object({
  links: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(200),
      url: z.string().min(1).max(2000).refine(safeUrl(), SAFE_URL_MESSAGE),
      description: z.string().max(1000).optional().default(''),
      avatar: z.string().max(2000).optional().default('').refine(safeUrl('image'), SAFE_URL_MESSAGE),
      email: z.string().max(200).optional().default(''),
      categoryId: z.string().nullable().optional(),
      status: z.enum(['pending', 'approved', 'rejected']).optional().default('approved'),
      isPinned: z.boolean().optional().default(false),
      pinnedOrder: z.number().int().optional().default(0),
      isFavorite: z.boolean().optional().default(false),
      sortOrder: z.number().int().optional().default(0),
      isActive: z.boolean().optional().default(true),
    }),
  ).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} links per import`),
  categories: z.array(
    z.object({
      id: z.string().optional(),
      name: z.string().min(1).max(100),
      icon: z.string().nullable().optional(),
      parentId: z.string().nullable().optional(),
      sortOrder: z.number().int().optional().default(0),
    }),
  ).max(BATCH_ROW_LIMIT, `At most ${BATCH_ROW_LIMIT} categories per import`).optional().default([]),
})

// Body of DELETE /api/blog/visits?type=all: the wipe is unrecoverable, so the
// current password travels in the body rather than the query string (SH-47).
export const blogVisitWipeSchema = z.object({
  password: z.string().max(LIMITS.passwordMaxLength).optional(),
})
