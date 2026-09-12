import { z } from 'zod'
import { LIMITS } from '@shared/constants'

const trimmed = (max: number) => z.string().trim().max(max)
const optionalTrimmed = (max: number) => trimmed(max).optional()

export const patchTrackSchema = z
  .object({
    title: trimmed(LIMITS.musicTitleMaxLength).min(1).optional(),
    artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
    album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    coverUrl: z.string().max(2048).nullable().optional(),
    coverDataUrl: z.string().max(800_000).nullable().optional(),
    lyric: z.string().max(LIMITS.musicLyricMaxBytes).nullable().optional(),
    isFavorite: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    tagIds: z.array(z.string().max(64)).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchTrackBody = z.infer<typeof patchTrackSchema>

export const coverLookupQuerySchema = z.object({
  title: trimmed(LIMITS.musicTitleMaxLength).min(1),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
})

export const savePlaybackSchema = z.object({
  queue: z.array(z.string().trim().max(64)).max(LIMITS.musicPlaylistItemsMax),
  currentIndex: z.number().int().min(0).max(LIMITS.musicPlaylistItemsMax),
  positionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
})

export type SavePlaybackBody = z.infer<typeof savePlaybackSchema>

export const batchTrackSchema = z.object({
  ids: z.array(z.string().max(64)).min(1).max(500),
  action: z.enum(['favorite', 'unfavorite', 'pin', 'unpin', 'delete']),
})

export type BatchTrackBody = z.infer<typeof batchTrackSchema>

export const createTagSchema = z.object({
  name: trimmed(LIMITS.tagNameMaxLength).min(1),
  color: z.string().max(32).nullable().optional(),
  parentId: z.string().max(64).nullable().optional(),
})

export type CreateTagBody = z.infer<typeof createTagSchema>

export const patchTagSchema = z
  .object({
    name: trimmed(LIMITS.tagNameMaxLength).min(1).optional(),
    color: z.string().max(32).nullable().optional(),
    parentId: z.string().max(64).nullable().optional(),
    isPinned: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchTagBody = z.infer<typeof patchTagSchema>

export const createPlaylistSchema = z.object({
  name: trimmed(LIMITS.musicPlaylistNameMaxLength).min(1),
  description: optionalTrimmed(LIMITS.musicPlaylistDescriptionMaxLength),
})

export type CreatePlaylistBody = z.infer<typeof createPlaylistSchema>

export const patchPlaylistSchema = z
  .object({
    name: trimmed(LIMITS.musicPlaylistNameMaxLength).min(1).optional(),
    description: optionalTrimmed(LIMITS.musicPlaylistDescriptionMaxLength),
    isPinned: z.boolean().optional(),
    isFavorite: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchPlaylistBody = z.infer<typeof patchPlaylistSchema>

export const webdavPathSchema = z.object({
  path: z.string().max(1024).refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: 'Path traversal is not allowed',
  }),
})

export type WebdavPathBody = z.infer<typeof webdavPathSchema>

export const importMusicSchema = z.object({
  path: z.string().min(1).max(1024).refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: 'Path traversal is not allowed',
  }),
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
  album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
})

export type ImportMusicBody = z.infer<typeof importMusicSchema>

export const playlistItemSchema = z.object({ trackId: z.string().max(64) })

export type PlaylistItemBody = z.infer<typeof playlistItemSchema>

export const reorderPlaylistSchema = z.object({
  itemIds: z.array(z.string().max(64)).max(LIMITS.musicPlaylistItemsMax),
})

export type ReorderPlaylistBody = z.infer<typeof reorderPlaylistSchema>
