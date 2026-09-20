import { describe, expect, it, vi } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicTrack, MusicWebdavEntry } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      importWebdav: vi.fn(),
      browseWebdav: vi.fn(async () => ({ configured: true, dir: 'music', directory: '', entries: [], truncated: false, reason: null })),
      patchTrack: vi.fn(async (id: string, patch: object) => ({ id, ...patch })),
    },
  },
}))
vi.mock('../music-feedback', () => ({ toastMusic: vi.fn(), toastMusicError: vi.fn() }))
vi.mock('../music-metadata', () => ({ probeTrackDuration: vi.fn(async () => 4500) }))

import { api } from '../../../lib/api'
import { browseWebdav, importWebdavFolder, importWebdavTrack } from './webdav'

function entry(name: string): MusicWebdavEntry {
  return { name, path: `/dav/${name}`, isDirectory: false } as MusicWebdavEntry
}

function imported(id: string): MusicTrack {
  return { id, title: id, artist: '', album: '', durationMs: 0, source: 'webdav', coverUrl: null, lyric: null } as MusicTrack
}

function makeStore(entries: MusicWebdavEntry[]) {
  const loadLibrary = vi.fn(async () => {})
  const store = musicStoreStub({
    tracks: [],
    webdav: { loading: false, configured: true, dir: 'music', directory: '', path: '/dav', entries, truncated: false, error: null, importingPaths: [] },
    loadLibrary,
  })
  return { ...store, loadLibrary }
}

describe('importWebdavFolder', () => {
  it('appends each imported track locally and reloads the library once at the end', async () => {
    vi.mocked(api.music.importWebdav).mockImplementation(async ({ path }) => imported(path.slice(1)))
    const store = makeStore(['a.mp3', 'b.mp3', 'c.mp3', 'd.mp3', 'e.mp3'].map(entry))
    let tracksAtReload = 0
    store.loadLibrary.mockImplementation(async () => { tracksAtReload = store.get().tracks.length })

    await importWebdavFolder(store.set, store.get)

    expect(api.music.importWebdav).toHaveBeenCalledTimes(5)
    expect(store.loadLibrary).toHaveBeenCalledTimes(1)
    expect(tracksAtReload).toBe(5)
  })
  it('keeps importing the rest of the folder when one file fails', async () => {
    vi.mocked(api.music.importWebdav).mockImplementation(async ({ path }) => {
      if (path.endsWith('bad.mp3')) throw new Error('WebDAV fetch failed')
      return imported(path.slice(1))
    })
    const store = makeStore(['ok-1.mp3', 'bad.mp3', 'ok-2.mp3'].map(entry))

    await importWebdavFolder(store.set, store.get)

    expect(store.get().tracks.map((track) => track.id)).toEqual(['dav/ok-1.mp3', 'dav/ok-2.mp3'])
    expect(store.loadLibrary).toHaveBeenCalledTimes(1)
  })
})

describe('importWebdavFolder concurrency', () => {
  it('imports several files at once but never more than the cap', async () => {
    let active = 0
    let maxActive = 0
    vi.mocked(api.music.importWebdav).mockImplementation(async ({ path }) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return imported(path.slice(1))
    })
    const names = Array.from({ length: 8 }, (_, index) => `f${index}.mp3`)
    const store = makeStore(names.map(entry))

    await importWebdavFolder(store.set, store.get)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(store.get().webdav.importingPaths).toEqual([])
    expect(store.loadLibrary).toHaveBeenCalledTimes(1)
  })

  it('marks a row as importing while its file is in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    vi.mocked(api.music.importWebdav).mockImplementation(async ({ path }) => {
      await gate
      return imported(path.slice(1))
    })
    const store = makeStore([entry('gated.mp3')])
    const running = importWebdavFolder(store.set, store.get)
    await Promise.resolve()

    expect(store.get().webdav.importingPaths).toEqual(['/dav/gated.mp3'])
    release()
    await running
    expect(store.get().webdav.importingPaths).toEqual([])
  })
})

describe('importWebdavTrack', () => {
  it('keeps the single-file flow reloading once the import lands', async () => {
    vi.mocked(api.music.importWebdav).mockResolvedValue(imported('solo.mp3'))
    const store = makeStore([entry('solo.mp3')])

    await importWebdavTrack(store.set, store.get, entry('solo.mp3'))

    expect(api.music.importWebdav).toHaveBeenCalledWith({ path: '/dav/solo.mp3', title: 'solo', artist: '' })
    expect(store.loadLibrary).toHaveBeenCalledTimes(1)
    expect(store.get().webdav.importingPaths).toEqual([])
  })
})

describe('browseWebdav truncation', () => {
  it('records that the server truncated a large listing', async () => {
    vi.mocked(api.music.browseWebdav).mockResolvedValueOnce({
      configured: true, dir: 'music', directory: '', entries: [entry('a.mp3')], truncated: true, reason: null,
    })
    const store = makeStore([])

    await browseWebdav(store.set, '/dav')

    expect(store.get().webdav.truncated).toBe(true)
  })

  it('clears the marker when the next listing comes back whole', async () => {
    const store = makeStore([])
    store.set({ webdav: { ...store.get().webdav, truncated: true } })

    await browseWebdav(store.set, '/dav')

    expect(store.get().webdav.truncated).toBe(false)
  })
})
