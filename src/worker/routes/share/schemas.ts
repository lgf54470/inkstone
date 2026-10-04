import { z } from 'zod'
import { LIMITS } from '@shared/constants'

export const shareBatchSchema = z.object({
  action: z.enum(['enable', 'disable', 'revoke', 'expire', 'extend', 'move']),
  noteIds: z.array(z.string()).min(1, 'noteIds must be a non-empty array'),
  expiresIn: z.number().nullable().optional(),
  extendDays: z.number().optional(),
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

export const shareVisitWipeSchema = z.object({
  password: z.string().max(LIMITS.passwordMaxLength).optional(),
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
  password: z.string().max(LIMITS.passwordMaxLength).optional(),
  referrer: z.string().max(LIMITS.shareReferrerMaxLength).optional(),
  // Only a size guard, not the marker's validation (that is `storedChannelValue`): a plausible but
  // wrong token is recorded as unrecognized rather than answered with an error, because the
  // visitor must not pay for the owner's typo. This cap, like the referrer's, is for input no
  // honest link could produce.
  ref: z.string().max(LIMITS.shareChannelMaxLength).optional(),
})

// N-34 / ADR-0006: the audience-side position channel. The triple is the presenter's own state, and
// every member is bounded rather than merely an integer: this is a public write path after a token
// check, and a body that can carry `Number.MAX_SAFE_INTEGER` is a body that ends up in a page number.
export const sharePresenceWriteSchema = z.object({
  slide: z.number().int().min(0).max(10_000),
  page: z.number().int().min(0).max(10_000),
  step: z.number().int().min(0).max(10_000),
})

// The token is optional at the schema level on purpose: "no token", "wrong token" and "token from a
// show that is over" all have to answer identically (ADR-0006 section 3), and a validation error would
// answer "this endpoint exists and wants something shorter" instead. The size cap stays, because it is
// a body-size guard like every other cap in this file, not a judgement about the caller.
export const sharePresenceAccessSchema = z.object({
  token: z.string().max(LIMITS.sharePresentTokenMaxLength).optional(),
})
