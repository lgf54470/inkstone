import { z } from 'zod'
import { LIMITS } from '@shared/constants'
import { isWebdavRelativePath, sanitizeCoverUrl } from './keys'

const trimmed = (max: number) => z.string().trim().max(max)
const optionalTrimmed = (max: number) => trimmed(max).optional()

// An absent field must stay undefined so PATCH keeps the stored cover; anything
// else goes through the same whitelist the upload path uses.
const patchCoverUrl = z.string().max(2048).nullable().optional()
  .transform((value) => (value === undefined ? undefined : sanitizeCoverUrl(value)))

export const patchTrackSchema = z
  .object({
    title: trimmed(LIMITS.musicTitleMaxLength).min(1).optional(),
    artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
    album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
    durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    coverUrl: patchCoverUrl,
    coverDataUrl: z.string().max(800_000).nullable().optional(),
    lyric: z.string().max(LIMITS.musicLyricMaxBytes).nullable().optional(),
    isFavorite: z.boolean().optional(),
    isPinned: z.boolean().optional(),
    tagIds: z.array(z.string().max(64)).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchTrackBody = z.infer<typeof patchTrackSchema>

export const musicPublicSettingsSchema = z.object({ enabled: z.boolean() })

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

export const savePositionSchema = z.object({
  currentIndex: z.number().int().min(0).max(LIMITS.musicPlaylistItemsMax),
  positionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
})

export type SavePositionBody = z.infer<typeof savePositionSchema>

// The cap is shared with the client, which splits a bigger selection into several
// requests rather than sending one this schema must reject.
// `tag` replaces the tags of every listed track with `tagIds`, the same way a single
// PATCH does, so moving a selection onto a tag costs one request instead of one per track.
export const batchTrackSchema = z
  .object({
    ids: z.array(z.string().max(64)).min(1).max(LIMITS.musicBatchItemsMax),
    action: z.enum(['favorite', 'unfavorite', 'pin', 'unpin', 'delete', 'tag']),
    tagIds: z.array(z.string().max(64)).max(50).optional(),
  })
  .refine((value) => value.action !== 'tag' || (value.tagIds?.length ?? 0) > 0, {
    message: 'Provide at least one tag id for the tag action',
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

// A cover patch is either an image data url (stored as an object) or null to clear;
// anything else is rejected rather than silently ignored.
const playlistCoverDataUrl = z.string().max(800_000)
  .regex(/^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/, { message: 'Provide an image data url' })

export const patchPlaylistSchema = z
  .object({
    name: trimmed(LIMITS.musicPlaylistNameMaxLength).min(1).optional(),
    description: optionalTrimmed(LIMITS.musicPlaylistDescriptionMaxLength),
    isPinned: z.boolean().optional(),
    isFavorite: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    coverDataUrl: playlistCoverDataUrl.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchPlaylistBody = z.infer<typeof patchPlaylistSchema>

export const webdavPathSchema = z.object({
  path: z.string().max(1024).refine((value) => !value.split('/').some((segment) => segment === '..'), {
    message: 'Path traversal is not allowed',
  }),
})

export type WebdavPathBody = z.infer<typeof webdavPathSchema>

// WebDAV paths stay relative to the user's music directory: no traversal, no
// absolute paths, no control characters, and never inside the app's own
// storage namespace (those keys would enter the local object lifecycle).
const webdavRelativePath = z.string().refine(isWebdavRelativePath,
  { message: 'Provide a relative WebDAV path outside the app namespace' })

export const importMusicSchema = z.object({
  path: webdavRelativePath,
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
  album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
})

export type ImportMusicBody = z.infer<typeof importMusicSchema>

// FEA-A3-1: an Alist registration names the server and stores its token server-side
// only; the URL is the API origin (no trailing path), rootPath scopes all browsing.
const alistUrl = z.string().max(LIMITS.musicAlistUrlMaxLength).refine((value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}, { message: 'Provide an http(s) URL' })

export const createAlistServerSchema = z.object({
  name: trimmed(LIMITS.musicAlistNameMaxLength).min(1),
  url: alistUrl,
  rootPath: z.string().max(LIMITS.musicAlistRootPathMaxLength).regex(/^\/|^$/, { message: 'Root path must start with /' }).optional(),
  token: z.string().max(LIMITS.musicAlistTokenMaxLength).min(1),
})

export type CreateAlistServerBody = z.infer<typeof createAlistServerSchema>

export const importAlistTrackSchema = z.object({
  path: z.string().max(LIMITS.musicAlistRootPathMaxLength).min(1),
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
  album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
})

export const patchAlistServerSchema = z
  .object({
    name: trimmed(LIMITS.musicAlistNameMaxLength).min(1).optional(),
    url: alistUrl.optional(),
    rootPath: z.string().max(LIMITS.musicAlistRootPathMaxLength).regex(/^\/|^$/, { message: 'Root path must start with /' }).optional(),
    token: z.string().max(LIMITS.musicAlistTokenMaxLength).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchAlistServerBody = z.infer<typeof patchAlistServerSchema>

// FEA-B3: a direct link imports as a reference row — only the URL is stored and
// playback proxies it, so http(s) is the scheme bar and the container must still
// be recognizable from the path's extension.
const externalUrl = z.string().max(2048).refine((value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}, { message: 'Provide an http(s) URL' })

export const importUrlSchema = z.object({
  url: externalUrl,
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
  album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
})

export type ImportUrlBody = z.infer<typeof importUrlSchema>

export const playlistItemSchema = z.object({ trackId: z.string().max(64) })

export type PlaylistItemBody = z.infer<typeof playlistItemSchema>

export const batchPlaylistItemsSchema = z.object({ trackIds: z.array(z.string().max(64)).min(1).max(LIMITS.musicBatchItemsMax) })

export type BatchPlaylistItemsBody = z.infer<typeof batchPlaylistItemsSchema>

export const reorderPlaylistSchema = z.object({
  itemIds: z.array(z.string().max(64)).max(LIMITS.musicPlaylistItemsMax),
})

export type ReorderPlaylistBody = z.infer<typeof reorderPlaylistSchema>

// FEA-A2-1: a podcast subscription is a feed URL plus a display title. The title
// is optional at creation (the host name stands in until the first feed refresh
// replaces it with the channel title).
export const createPodcastFeedSchema = z.object({
  url: externalUrl,
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
})

export type CreatePodcastFeedBody = z.infer<typeof createPodcastFeedSchema>

export const patchPodcastFeedSchema = z
  .object({
    title: trimmed(LIMITS.musicTitleMaxLength).min(1).optional(),
    url: externalUrl.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' })

export type PatchPodcastFeedBody = z.infer<typeof patchPodcastFeedSchema>

// FEA-A2-3: the OPML document travels as text inside the JSON body; the cap is
// generous because real subscription lists run to hundreds of outlines.
export const importPodcastOpmlSchema = z.object({
  opml: z.string().min(1).max(256 * 1024),
})

export type ImportPodcastOpmlBody = z.infer<typeof importPodcastOpmlSchema>

// FEA-A2-4: playing an episode registers it as an external reference row first,
// so the player, queue and progress persistence all see one ordinary track. The
// extension must identify the container, exactly like the URL import.
export const importPodcastEpisodeSchema = z.object({
  audioUrl: externalUrl,
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
})

export type ImportPodcastEpisodeBody = z.infer<typeof importPodcastEpisodeSchema>

// FEA-A1-3: an online hit becomes a provider reference row; the source must be
// one the worker's allowlist recognizes (re-checked there) and the title must
// survive trimming so the library never stores a blank row.
export const importProviderTrackSchema = z.object({
  source: z.string().min(1).max(32),
  sourceId: z.string().min(1).max(128),
  title: trimmed(LIMITS.musicTitleMaxLength).optional(),
  artist: optionalTrimmed(LIMITS.musicArtistMaxLength),
  album: optionalTrimmed(LIMITS.musicAlbumMaxLength),
  durationMs: z.number().int().min(0).max(60 * 60 * 1000).optional(),
})

export type ImportProviderTrackBody = z.infer<typeof importProviderTrackSchema>
