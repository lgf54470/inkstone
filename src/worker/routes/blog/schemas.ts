import { z } from "zod";

export const blogPostWriteSchema = z.object({
  noteId: z.string().min(1, 'noteId is required'),
  title: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  content: z.string().optional(),
  coverUrl: z.string().nullable().optional(),
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
  postIds: z.array(z.string()),
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
  commentIds: z.array(z.string()),
})

export const blogPublicCommentSchema = z.object({
  postSlug: z.string(),
  parentId: z.string().nullable().optional(),
  authorName: z.string(),
  authorEmail: z.string(),
  authorUrl: z.string().optional(),
  authorAvatar: z.string().optional(),
  content: z.string(),
})

export const blogSettingsSchema = z.object({
  siteName: z.string().optional(),
  subtitle: z.string().optional(),
  bio: z.string().optional(),
  authorName: z.string().optional(),
  authorAvatar: z.string().optional(),
  socialLinks: z.object({
    github: z.string().optional(),
    twitter: z.string().optional(),
    email: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
  requireCommentApproval: z.boolean().optional(),
  postsPerPage: z.number().optional(),
  frontendUrl: z.string().optional(),
  appearance: z.object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    accent: z.string().optional(),
    background: z.enum(['paper', 'white']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    language: z.enum(['zh-CN', 'en-US']).optional(),
  }).optional(),
})
