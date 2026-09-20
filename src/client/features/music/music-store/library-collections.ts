import { LIMITS } from '@shared/constants'
import { chunkIds } from '@shared/chunk'
import type { MusicPlaylistDetail, MusicTag } from '@shared/types'
import { api, uploadMusicToWebdav, uploadMusicTrack, type MusicPlaylistPatch } from '../../../lib/api'
import { mapWithConcurrency, throttledProgress } from '../../../lib/async'
import { toastMusic, toastMusicError, toastMusicNotice, toastUploadError, toastUploadSkip } from '../music-feedback'
import { readFileMetadata } from '../music-metadata'
import { readDurationMs } from '../music-probe'
import { partitionUploadableFiles, TRACK_IO_CONCURRENCY } from '../music-utils'
import { applyTagsLocally, sendBatches } from './library-tracks'
import { summarizeLibrary } from './library-load'
import type { MusicGet, MusicSet, MusicStoreState, MusicTransferTarget, MusicUploadTask } from './types'

// "demo/test" creates the parent path first, matching how note tags nest by name.
export async function createTag(set: MusicSet, get: MusicGet, name: string, color?: string | null): Promise<void> {
  const segments = splitTagPath(name)
  if (!segments.length) return
  const leaf = segments[segments.length - 1]!
  try {
    const parentId = await ensureTagPath(set, get, segments.slice(0, -1))
    // A taken name is a no-op, not a failure: the tag the user asked for is already
    // there, and saying so is the only feedback the click would otherwise get.
    if (get().tags.some((tag) => tag.name === leaf && (tag.parentId ?? null) === parentId)) {
      toastMusicNotice('music.tag_exists', { value0: leaf })
      return
    }
    const created = await api.music.createTag({ name: leaf, color: color ?? null, parentId })
    set((state) => ({ tags: [...state.tags, created].sort(byTagOrder) }))
    toastMusic('music.tag_created')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export function splitTagPath(value: string): string[] {
  return value.split('/').map((segment) => segment.trim()).filter((segment) => segment.length > 0)
}

async function ensureTagPath(set: MusicSet, get: MusicGet, segments: string[]): Promise<string | null> {
  let parentId: string | null = null
  for (const segment of segments) {
    const current: string | null = parentId
    const existing: MusicTag | undefined = get().tags.find((tag) => tag.name === segment && (tag.parentId ?? null) === current)
    if (existing) {
      parentId = existing.id
      continue
    }
    const created = await api.music.createTag({ name: segment, color: null, parentId: current })
    set((state) => ({ tags: [...state.tags, created].sort(byTagOrder) }))
    parentId = created.id
  }
  return parentId
}

export async function patchTag(
  set: MusicSet,
  id: string,
  patch: { name?: string; color?: string | null; isPinned?: boolean },
): Promise<void> {
  try {
    const updated = await api.music.patchTag(id, patch)
    set((state) => ({ tags: state.tags.map((tag) => (tag.id === id ? updated : tag)).sort(byTagOrder) }))
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function deleteTag(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deleteTag(id)
    set((state) => {
      // The server re-parents children of the deleted tag to its parent; mirror that locally.
      const parentId = state.tags.find((tag) => tag.id === id)?.parentId ?? null
      return {
        tags: state.tags.filter((tag) => tag.id !== id).map((tag) => {
          if (tag.parentId !== id) return tag
          const clashing = state.tags.some((other) => other.id !== id
            && other.parentId === parentId
            && other.name === tag.name)
          return clashing ? tag : { ...tag, parentId }
        }),
        tracks: state.tracks.map((track) => ({ ...track, tagIds: track.tagIds.filter((tagId) => tagId !== id) })),
        scope: state.scope.kind === 'tag' && state.scope.tagId === id ? { kind: 'all' } : state.scope,
      }
    })
    toastMusic('music.tag_deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createPlaylist(set: MusicSet, name: string, description?: string): Promise<boolean> {
  try {
    const trimmed = description?.trim()
    const created = await api.music.createPlaylist({ name: name.trim(), description: trimmed || undefined })
    set((state) => resummarizePlaylists(state, [...state.playlists, created]))
    toastMusic('music.playlist_created')
    return true
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
    return false
  }
}

// The dialog keeps its draft open until the write lands; the success flag is how it knows.
export async function renamePlaylist(set: MusicSet, id: string, name: string, description?: string): Promise<boolean> {
  try {
    // An absent description stays untouched: the sidebar rename only edits the name.
    const patch: MusicPlaylistPatch = description === undefined
      ? { name: name.trim() }
      : { name: name.trim(), description: description.trim() }
    const updated = await api.music.patchPlaylist(id, patch)
    set((state) => ({ playlists: state.playlists.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.saved')
    return true
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
    return false
  }
}

// The share endpoint is idempotent, so the slug a visitor already holds keeps working.
export async function sharePlaylist(set: MusicSet, id: string): Promise<string | null> {
  try {
    const updated = await api.music.sharePlaylist(id)
    set((state) => ({ playlists: state.playlists.map((entry) => (entry.id === id ? updated : entry)) }))
    return updated.shareSlug
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
    return null
  }
}

export async function unsharePlaylist(set: MusicSet, id: string): Promise<void> {
  try {
    const updated = await api.music.unsharePlaylist(id)
    set((state) => ({ playlists: state.playlists.map((entry) => (entry.id === id ? updated : entry)) }))
    toastMusic('music.unshared_playlist')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function deletePlaylist(set: MusicSet, id: string): Promise<void> {
  try {
    await api.music.deletePlaylist(id)
    set((state) => {
      const playlists = state.playlists.filter((playlist) => playlist.id !== id)
      return {
        ...resummarizePlaylists(state, playlists),
        scope: state.scope.kind === 'playlist' && state.scope.playlistId === id ? { kind: 'all' } : state.scope,
      }
    })
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.delete_failed')
  }
}

// Multi-select actions: moving replaces the tag set, playlists append. The move travels as one
// batch request per chunk instead of a PATCH per track: on a large library the per-track walk
// burned the hourly write budget and tripped it mid-selection, leaving the batch half applied.
export async function moveSelectionToTag(set: MusicSet, get: MusicGet, tagId: string): Promise<void> {
  const ids = get().selectedIds
  if (!ids.length) return
  const { applied, error } = await sendBatches(ids, 'tag', [tagId])
  if (!applied.length) {
    toastMusicError(error, 'music.action_failed')
    await get().loadLibrary(true)
    return
  }
  const affected = new Set(applied)
  applyTagsLocally(set, affected, [tagId])
  // Rows whose request never landed stay selected, so a retry does not start over.
  set((state) => ({ selectedIds: state.selectedIds.filter((id) => !affected.has(id)) }))
  if (!error) toastMusic('music.moved_to_tag', { value0: applied.length })
  else toastMusicNotice('music.batch_partial', { value0: applied.length, value1: ids.length - applied.length })
}

export async function addSelectionToPlaylist(set: MusicSet, get: MusicGet, playlistId: string): Promise<void> {
  const ids = get().selectedIds
  if (!ids.length) return
  const name = get().playlists.find((entry) => entry.id === playlistId)?.name ?? ''
  const entries: { id: string; trackId: string }[] = []
  const applied: string[] = []
  for (const part of chunkIds(ids, LIMITS.musicBatchItemsMax)) {
    try {
      const result = await api.music.addPlaylistItems(playlistId, part)
      entries.push(...result.items)
      applied.push(...part)
    } catch (error) {
      toastMusicError(error, 'music.action_failed')
      break
    }
  }
  if (!applied.length) return
  if (entries.length) mergePlaylistItems(set, playlistId, entries)
  // The rows that never reached the server stay selected so the user can retry them.
  const added = new Set(applied)
  set((state) => ({ selectedIds: state.selectedIds.filter((id) => !added.has(id)) }))
  if (applied.length === ids.length) toastMusic('music.added_to_playlist', { value0: name })
  else toastMusicNotice('music.batch_partial', { value0: applied.length, value1: ids.length - applied.length })
}

export async function addToPlaylist(set: MusicSet, get: MusicGet, playlistId: string, trackId: string): Promise<void> {
  const name = get().playlists.find((entry) => entry.id === playlistId)?.name ?? ''
  try {
    const result = await api.music.addPlaylistItem(playlistId, trackId)
    if (!result.added) {
      toastMusic('music.already_in_playlist', { value0: name })
      return
    }
    mergePlaylistItems(set, playlistId, [{ id: result.id, trackId }])
    toastMusic('music.added_to_playlist', { value0: name })
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function removeFromPlaylist(set: MusicSet, playlistId: string, itemId: string): Promise<void> {
  try {
    await api.music.removePlaylistItem(playlistId, itemId)
    set((state) => ({
      playlists: state.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist
        const items = playlist.items.filter((item) => item.id !== itemId)
        return { ...playlist, items, trackCount: items.length }
      }),
    }))
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

// The reorder endpoint takes the complete item order, so a move is a local
// swap sent whole; the response replaces the entry like a patch would.
export async function movePlaylistItem(set: MusicSet, get: MusicGet, playlistId: string, itemId: string, delta: number): Promise<void> {
  const ordered = orderedPlaylistItems(get, playlistId)
  if (!ordered) return
  const index = ordered.findIndex((item) => item.id === itemId)
  const neighbour = index + delta
  if (index < 0 || neighbour < 0 || neighbour >= ordered.length) return
  await sendReorderedPlaylistItems(set, playlistId, ordered, index, neighbour)
}

// Drag and drop knows only where the pointer landed, so the index is clamped
// into the stored order rather than dropped like the single-step menu move.
export async function movePlaylistItemToIndex(set: MusicSet, get: MusicGet, playlistId: string, itemId: string, toIndex: number): Promise<void> {
  const ordered = orderedPlaylistItems(get, playlistId)
  if (!ordered) return
  const index = ordered.findIndex((item) => item.id === itemId)
  if (index < 0) return
  const target = Math.max(0, Math.min(toIndex, ordered.length - 1))
  if (target === index) return
  await sendReorderedPlaylistItems(set, playlistId, ordered, index, target)
}

function orderedPlaylistItems(get: MusicGet, playlistId: string): MusicPlaylistDetail['items'] | null {
  const playlist = get().playlists.find((entry) => entry.id === playlistId)
  return playlist ? [...playlist.items].sort((a, b) => a.sortOrder - b.sortOrder) : null
}

async function sendReorderedPlaylistItems(
  set: MusicSet,
  playlistId: string,
  ordered: MusicPlaylistDetail['items'],
  from: number,
  to: number,
): Promise<void> {
  const itemIds = ordered.map((item) => item.id)
  const [moved] = itemIds.splice(from, 1)
  itemIds.splice(to, 0, moved)
  try {
    const updated = await api.music.reorderPlaylist(playlistId, itemIds)
    set((state) => ({ playlists: state.playlists.map((entry) => (entry.id === playlistId ? updated : entry)) }))
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

// addItem answers with the stored item id, so the row can be appended locally
// instead of paying for a whole library reload after one tap.
function mergePlaylistItems(set: MusicSet, playlistId: string, entries: { id: string; trackId: string }[]): void {
  set((state) => ({
    playlists: state.playlists.map((playlist) => {
      if (playlist.id !== playlistId) return playlist
      const known = new Set(playlist.items.map((item) => item.trackId))
      let sortOrder = playlist.items.reduce((max, item) => Math.max(max, item.sortOrder + 1), 0)
      const items = [...playlist.items]
      for (const entry of entries) {
        if (known.has(entry.trackId)) continue
        known.add(entry.trackId)
        items.push({ id: entry.id, playlistId, trackId: entry.trackId, sortOrder })
        sortOrder += 1
      }
      return { ...playlist, items, trackCount: items.length }
    }),
  }))
}

function resummarizePlaylists(state: MusicStoreState, playlists: MusicPlaylistDetail[]): Partial<MusicStoreState> {
  return {
    playlists,
    stats: state.stats ? summarizeLibrary(state.tracks, state.tags, playlists) : null,
  }
}

export async function uploadFiles(set: MusicSet, get: MusicGet, files: File[], target: MusicTransferTarget = 'r2'): Promise<void> {
  const { accepted, unsupported, tooLarge } = partitionUploadableFiles(files)
  if (unsupported) toastUploadSkip('music.upload_unsupported', unsupported)
  if (tooLarge) toastUploadSkip('music.upload_too_large', tooLarge)
  if (!accepted.length) return
  const tasks = accepted.map((file, index) => makeUploadTask(file, index, target))
  set((state) => ({ uploads: [...state.uploads, ...tasks] }))
  const outcomes = await mapWithConcurrency(accepted, TRACK_IO_CONCURRENCY, (file, index) => uploadOne(set, file, tasks[index]!))
  await get().loadLibrary(true)
  set((state) => ({ uploads: state.uploads.filter((task) => task.status !== 'done') }))
  const done = outcomes.filter((outcome) => outcome === 'done').length
  if (done) toastMusic(target === 'webdav' ? 'music.upload_webdav_done' : 'music.upload_done', { value0: done })
  const failure = outcomes.find((outcome) => outcome !== 'done' && outcome !== 'aborted')
  if (failure) toastUploadError(failure)
}

async function uploadOne(set: MusicSet, file: File, task: MusicUploadTask): Promise<string> {
  const [durationMs, tags] = await Promise.all([
    readDurationMs(file).catch(() => 0),
    readFileMetadata(file).catch(() => null),
  ])
  const meta = {
    title: tags?.title || fileTitle(file.name),
    artist: tags?.artist ?? '',
    album: tags?.album ?? '',
    lyric: tags?.lyric ?? null,
    durationMs,
    coverUrl: tags?.coverDataUrl ?? null,
  }
  const progress = throttledProgress((percent) => updateUpload(set, task.id, { percent }))
  const result = task.target === 'webdav'
    ? await uploadMusicToWebdav(file, meta, progress, task.controller.signal)
    : await uploadMusicTrack(file, { ...meta, tagIds: [] }, progress, task.controller.signal)
  if (result.track) {
    updateUpload(set, task.id, { percent: 100, status: 'done' })
    return 'done'
  }
  // A canceled transfer is not a failure: the row is already gone and no toast should follow.
  if (result.error === 'aborted') return 'aborted'
  updateUpload(set, task.id, { status: 'failed', error: result.error })
  return result.error ?? 'unknown'
}

function makeUploadTask(file: File, index: number, target: MusicTransferTarget): MusicUploadTask {
  return {
    id: `${target}-${index}-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    percent: 0,
    status: 'uploading',
    error: null,
    target,
    controller: new AbortController(),
  }
}

function updateUpload(set: MusicSet, id: string, patch: Partial<MusicUploadTask>): void {
  set((state) => ({ uploads: state.uploads.map((task) => (task.id === id ? { ...task, ...patch } : task)) }))
}

export function dismissUpload(set: MusicSet, get: MusicGet, id: string): void {
  // The row's dismiss button is the user's cancel: stop the transfer, not just its display.
  get().uploads.find((task) => task.id === id)?.controller.abort()
  set((state) => ({ uploads: state.uploads.filter((task) => task.id !== id) }))
}

function fileTitle(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim()
}

function byTagOrder(a: MusicTag, b: MusicTag): number {
  return a.name.localeCompare(b.name)
}