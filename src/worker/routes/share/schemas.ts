import { z } from "zod";

export const shareBatchSchema = z.object({
  action: z.enum(['enable', 'disable', 'revoke', 'expire', 'move']),
  noteIds: z.array(z.string()).min(1, 'noteIds must be a non-empty array'),
  expiresIn: z.number().nullable().optional(),
  folderId: z.string().nullable().optional(),
})

export const shareFolderToggleSchema = z.object({
  folderId: z.string(),
  enabled: z.boolean(),
})

export const shareTagToggleSchema = z.object({
  tag: z.string(),
  enabled: z.boolean(),
})

export const shareCreateSchema = z.object({
  password: z.string().nullable().optional(),
  expiresIn: z.number().nullable().optional(),
  customSlug: z.string().optional(),
  isEnabled: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
})

export const shareAccessSchema = z.object({
  password: z.string().optional(),
  referrer: z.string().optional(),
})
