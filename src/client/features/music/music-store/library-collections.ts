import type { MusicTag } from '@shared/types'
import { api, uploadMusicToWebdav, uploadMusicTrack } from '../../../lib/api'
import { toastMusic, toastMusicError, toastUploadError } from '../music-feedback'
import { extractCoverDataUrl } from '../music-cover'
import { readDurationMs } from '../music-probe'
import type { MusicGet, MusicSet, MusicTransferTarget, MusicUploadTask } from './types'

// "demo/test" creates the parent path first, matching how note tags nest by name.
export async function createTag(set: MusicSet, get: MusicGet, name: string, color?: string | null): Promise<void> {
  const segments = splitTagPath(name)
  if (!segments.length) return
  try {
    const parentId = await ensureTagPath(set, get, segments.slice(0, -1))
    const leaf = segments[segments.length - 1]!
    if (get().tags.some((tag) => tag.name === leaf && (tag.parentId ?? null) === parentId)) return
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
    set((state) => ({
      tags: state.tags.filter((tag) => tag.id !== id),
      tracks: state.tracks.map((track) => ({ ...track, tagIds: track.tagIds.filter((tagId) => tagId !== id) })),
      scope: state.scope.kind === 'tag' && state.scope.tagId === id ? { kind: 'all' } : state.scope,
    }))
    toastMusic('music.tag_deleted')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function createPlaylist(set: MusicSet, get: MusicGet, name: string): Promise<void> {
  try {
    const created = await api.music.createPlaylist({ name: name.trim() })
    set((state) => ({ playlists: [...state.playlists, created] }))
    await get().loadLibrary()
    toastMusic('music.playlist_created')
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function renamePlaylist(set: MusicSet, get: MusicGet, id: string, name: string): Promise<void> {
  try {
    const updated = await api.music.patchPlaylist(id, { name: name.trim() })
    set((state) => ({ playlists: state.playlists.map((entry) => (entry.id === id ? updated : entry)) }))
    await get().loadLibrary()
    toastMusic('music.saved')
  } catch (error) {
    toastMusicError(error, 'music.save_failed')
  }
}

export async function deletePlaylist(set: MusicSet, get: MusicGet, id: string): Promise<void> {
  try {
    await api.music.deletePlaylist(id)
    set((state) => ({
      playlists: state.playlists.filter((playlist) => playlist.id !== id),
      scope: state.scope.kind === 'playlist' && state.scope.playlistId === id ? { kind: 'all' } : state.scope,
    }))
    await get().loadLibrary()
    toastMusic('music.deleted')
  } catch (error) {
    toastMusicError(error, 'music.delete_failed')
  }
}

export async function addToPlaylist(get: MusicGet, playlistId: string, trackId: string): Promise<void> {
  const name = get().playlists.find((entry) => entry.id === playlistId)?.name ?? ''
  try {
    const result = await api.music.addPlaylistItem(playlistId, trackId)
    if (!result.added) {
      toastMusic('music.already_in_playlist', { value0: name })
      return
    }
    await get().loadLibrary()
    toastMusic('music.added_to_playlist', { value0: name })
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function removeFromPlaylist(get: MusicGet, playlistId: string, itemId: string): Promise<void> {
  try {
    await api.music.removePlaylistItem(playlistId, itemId)
    await get().loadLibrary()
  } catch (error) {
    toastMusicError(error, 'music.action_failed')
  }
}

export async function uploadFiles(set: MusicSet, get: MusicGet, files: File[], target: MusicTransferTarget = 'r2'): Promise<void> {
  const accepted = files.filter((file) => file.size > 0)
  if (!accepted.length) return
  const tasks = accepted.map((file, index) => makeUploadTask(file, index, target))
  set((state) => ({ uploads: [...state.uploads, ...tasks] }))
  for (let index = 0; index < accepted.length; index += 1) {
    await uploadOne(set, accepted[index]!, tasks[index]!)
  }
  await get().loadLibrary()
  set((state) => ({ uploads: state.uploads.filter((task) => task.status !== 'done') }))
}

async function uploadOne(set: MusicSet, file: File, task: MusicUploadTask): Promise<void> {
  const durationMs = await readDurationMs(file).catch(() => 0)
  const coverUrl = await extractCoverDataUrl(file)
  const progress = (percent: number): void => updateUpload(set, task.id, { percent })
  const result = task.target === 'webdav'
    ? await uploadMusicToWebdav(file, {
      title: fileTitle(file.name), artist: '', album: '', durationMs, coverUrl,
    }, progress)
    : await uploadMusicTrack(file, {
      title: fileTitle(file.name), artist: '', album: '', durationMs, tagIds: [], coverUrl,
    }, progress)
  if (result.track) {
    updateUpload(set, task.id, { percent: 100, status: 'done' })
    toastMusic(task.target === 'webdav' ? 'music.upload_webdav_done' : 'music.upload_done', { value0: 1 })
    return
  }
  updateUpload(set, task.id, { status: 'failed', error: result.error })
  toastUploadError(result.error)
}

function makeUploadTask(file: File, index: number, target: MusicTransferTarget): MusicUploadTask {
  return {
    id: `${target}-${index}-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    percent: 0,
    status: 'uploading',
    error: null,
    target,
  }
}

function updateUpload(set: MusicSet, id: string, patch: Partial<MusicUploadTask>): void {
  set((state) => ({ uploads: state.uploads.map((task) => (task.id === id ? { ...task, ...patch } : task)) }))
}

export function dismissUpload(set: MusicSet, id: string): void {
  set((state) => ({ uploads: state.uploads.filter((task) => task.id !== id) }))
}

function fileTitle(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).trim()
}

function byTagOrder(a: MusicTag, b: MusicTag): number {
  return a.name.localeCompare(b.name)
}