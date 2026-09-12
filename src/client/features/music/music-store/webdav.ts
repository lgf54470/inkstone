import type { MusicTrack, MusicWebdavEntry } from '@shared/types'
import { api } from '../../../lib/api'
import { toastMusic, toastMusicError } from '../music-feedback'
import { probeTrackDuration } from '../music-metadata'
import type { MusicGet, MusicSet, MusicWebdavState } from './types'

const EMPTY_WEBDAV: MusicWebdavState = {
  loading: false,
  configured: true,
  dir: '',
  directory: '',
  path: '',
  entries: [],
  error: null,
  importingPath: null,
}

export function initialWebdavState(): MusicWebdavState {
  return { ...EMPTY_WEBDAV }
}

export async function browseWebdav(set: MusicSet, path: string): Promise<void> {
  set((state) => ({ webdav: { ...state.webdav, loading: true, error: null, path } }))
  try {
    const listing = await api.music.browseWebdav(path)
    set({
      webdav: {
        loading: false,
        configured: listing.configured,
        dir: listing.dir,
        directory: listing.directory ?? '',
        path,
        entries: listing.entries,
        error: listing.configured ? null : listing.reason,
        importingPath: null,
      },
    })
  } catch (error) {
    set((state) => ({
      webdav: { ...state.webdav, loading: false, error: error instanceof Error ? error.message : 'error' },
    }))
  }
}

export async function deleteWebdavObjects(paths: string[]): Promise<void> {
  for (const path of paths) {
    try {
      await api.music.deleteWebdavObject(path)
    } catch (error) {
      toastMusicError(error, 'music.action_failed')
      return
    }
  }
}

export async function importWebdavTrack(set: MusicSet, get: MusicGet, entry: MusicWebdavEntry): Promise<void> {
  if (entry.isDirectory) {
    await browseWebdav(set, entry.path)
    return
  }
  set((state) => ({ webdav: { ...state.webdav, importingPath: entry.path } }))
  try {
    const base = entry.name.replace(/\.[^.]+$/, '')
    const [title, artist] = splitName(base)
    const track = await api.music.importWebdav({ path: entry.path, title, artist })
    await patchImportedDuration(track)
    await get().loadLibrary()
    toastMusic('music.imported')
  } catch (error) {
    toastMusicError(error, 'music.import_failed')
  } finally {
    set((state) => ({ webdav: { ...state.webdav, importingPath: null } }))
  }
}

export async function importWebdavFolder(set: MusicSet, get: MusicGet): Promise<void> {
  const files = get().webdav.entries.filter((entry) => !entry.isDirectory)
  if (!files.length) return
  for (const entry of files) await importWebdavTrack(set, get, entry)
}

async function patchImportedDuration(track: MusicTrack): Promise<void> {
  const durationMs = await probeTrackDuration(track)
  if (durationMs > 0) await api.music.patchTrack(track.id, { durationMs }).catch(ignoreDurationPatch)
}

// The saved duration only labels the list; a failed patch must not undo an import.
function ignoreDurationPatch(error: unknown): void {
  console.warn('[inkstone] music duration probe patch failed:', error)
}

function splitName(base: string): [string, string] {
  const parts = /^(.*?) - (.*)$/.exec(base)
  return parts ? [parts[1]!.trim(), parts[2]!.trim()] : [base.trim(), '']
}
