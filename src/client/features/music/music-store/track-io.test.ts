import { describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'

vi.mock('../../../lib/api', () => ({
  api: { music: {} },
  musicStreamUrl: (id: string) => `/api/music/tracks/${id}/stream`,
  uploadMusicTrack: vi.fn(),
  uploadMusicToWebdav: vi.fn(),
}))
vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
  toastUploadError: vi.fn(),
}))
vi.mock('../music-metadata', () => ({
  readFileMetadata: vi.fn(async () => null),
  scanTrackMetadata: vi.fn(),
  probeTrackDuration: vi.fn(async () => 0),
}))
vi.mock('../music-probe', () => ({ readDurationMs: vi.fn(async () => 0) }))
vi.mock('../music-export', () => ({ saveBlob: vi.fn() }))

import { uploadMusicTrack } from '../../../lib/api'
import { saveBlob } from '../music-export'
import { uploadFiles } from './library-collections'
import { downloadTracks } from './transfers'
import type { MusicStoreState } from './types'

function makeStore() {
  const loadLibrary = vi.fn(async () => {})
  let state = { tracks: [], uploads: [], downloads: [], loadLibrary } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
  }
}

function audioFile(name: string): File {
  return new File(['some bytes'], name, { type: 'audio/mpeg' })
}

function track(id: string): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 0, sizeBytes: 4, source: 'r2',
    coverUrl: null, lyric: null, mime: 'audio/mpeg',
  } as MusicTrack
}

describe('uploadFiles', () => {
  it('uploads several files at once but never more than the cap', async () => {
    let active = 0
    let maxActive = 0
    vi.mocked(uploadMusicTrack).mockImplementation(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      return { track: track('uploaded'), error: null }
    })
    const store = makeStore()
    const files = Array.from({ length: 6 }, (_, index) => audioFile(`s${index}.mp3`))

    await uploadFiles(store.set as never, store.get as never, files)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(uploadMusicTrack).toHaveBeenCalledTimes(6)
  })

  it('reloads the library once for the whole batch', async () => {
    vi.mocked(uploadMusicTrack).mockResolvedValue({ track: track('uploaded'), error: null })
    const store = makeStore()

    await uploadFiles(store.set as never, store.get as never, [audioFile('a.mp3'), audioFile('b.mp3')])

    expect(store.get().loadLibrary).toHaveBeenCalledTimes(1)
  })
})

describe('downloadTracks', () => {
  it('fetches several tracks at once and saves each when its own download completes', async () => {
    let active = 0
    let maxActive = 0
    const fetchMock = vi.fn(async (url: string) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 0))
      active -= 1
      const id = url.split('/').at(-2)
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(id ?? ''))
          controller.close()
        },
      })
      return { ok: true, headers: new Headers({ 'content-length': '4' }), body }
    })
    vi.stubGlobal('fetch', fetchMock)
    const store = makeStore()
    const ids = ['t1', 't2', 't3', 't4', 't5']
    store.set({ tracks: ids.map(track) })

    await downloadTracks(store.set as never, store.get as never, ids)

    expect(maxActive).toBeGreaterThan(1)
    expect(maxActive).toBeLessThanOrEqual(4)
    expect(saveBlob).toHaveBeenCalledTimes(ids.length)
    vi.unstubAllGlobals()
  })
})
