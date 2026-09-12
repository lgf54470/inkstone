import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { saveBlob } from '../music-export'
import { toastMusicError } from '../music-feedback'
import { collectStream, downloadFileName, downloadTracks } from './transfers'
import type { MusicDownloadTask, MusicStoreState } from './types'

vi.mock('../music-export', () => ({ saveBlob: vi.fn() }))
vi.mock('../music-feedback', () => ({ toastMusic: vi.fn(), toastMusicError: vi.fn(), toastMusicNotice: vi.fn() }))

function track(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 'track-1',
    title: 'Moonlight',
    artist: 'Hu Yanbin',
    album: '',
    durationMs: 200_000,
    source: 'webdav',
    objectKey: 'Music/Moonlight.flac',
    mime: 'audio/flac',
    sizeBytes: 300,
    coverUrl: null,
    lyric: null,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function chunks(...sizes: number[]): Uint8Array[] {
  return sizes.map((size) => new Uint8Array(size).fill(7))
}

function respond(body: unknown[], totalBytes?: number): unknown {
  let index = 0
  return {
    ok: true,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-length' && totalBytes ? String(totalBytes) : null) },
    body: {
      getReader: () => ({
        read: () => Promise.resolve(index < body.length ? { done: false, value: body[index++] } : { done: true, value: undefined }),
      }),
    },
  }
}

function makeStore(tracks: MusicTrack[]) {
  let state = { tracks, downloads: [] as MusicDownloadTask[], transfersOpen: false } as unknown as MusicStoreState
  return {
    get: () => state,
    set: (patch: unknown) => {
      const next = typeof patch === 'function' ? (patch as (current: MusicStoreState) => Partial<MusicStoreState>)(state) : (patch as Partial<MusicStoreState>)
      state = { ...state, ...next }
    },
    state: () => state,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('downloadFileName', () => {
  it('keeps the artist, title and the file extension of the stored object', () => {
    expect(downloadFileName(track())).toBe('Hu Yanbin - Moonlight.flac')
    expect(downloadFileName(track({ artist: '', objectKey: 'Music/Only.flac' }))).toBe('Moonlight.flac')
  })

  it('falls back to the content type and strips characters a file system rejects', () => {
    expect(downloadFileName(track({ objectKey: '01m29y9s48zs8cf9x7798pytmx', mime: 'audio/mp4' }))).toBe('Hu Yanbin - Moonlight.m4a')
    expect(downloadFileName(track({ title: 'A/B: "C"', objectKey: 'broken' }))).toBe('Hu Yanbin - A_B_ _C_.flac')
  })
})

describe('collectStream', () => {
  it('reports progress against the announced length and keeps every byte', async () => {
    const percents: number[] = []
    const bytes = await collectStream(readerOf(chunks(100, 100, 100)), 300, (percent) => percents.push(percent))
    expect(bytes.byteLength).toBe(300)
    expect(percents).toEqual([33, 67, 99])
  })

  it('skips progress when the length is unknown and tolerates an empty body', async () => {
    const percents: number[] = []
    expect((await collectStream(readerOf(chunks(50)), 0, (percent) => percents.push(percent))).byteLength).toBe(50)
    expect(percents).toEqual([])
    expect((await collectStream(null, 100, (percent) => percents.push(percent))).byteLength).toBe(0)
  })
})

describe('downloadTracks', () => {
  it('saves the fetched file and drops the finished task', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(120, 180), 300)))
    await downloadTracks(store.set as never, store.get as never, ['track-1'])
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = (saveBlob as unknown as Mock).mock.calls[0]!
    expect(filename).toBe('Hu Yanbin - Moonlight.flac')
    expect((blob as Blob).size).toBe(300)
    expect(store.state().downloads).toEqual([])
  })

  it('keeps a failed task and reports it', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }))
    await downloadTracks(store.set as never, store.get as never, ['track-1'])
    expect(saveBlob).not.toHaveBeenCalled()
    expect(toastMusicError).toHaveBeenCalledTimes(1)
    expect(store.state().downloads).toHaveLength(1)
    expect(store.state().downloads[0]?.status).toBe('failed')
  })

  it('opens the transfer dialog and ignores unknown ids', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(300), 300)))
    await downloadTracks(store.set as never, store.get as never, ['missing'])
    expect(store.state().transfersOpen).toBe(false)
    await downloadTracks(store.set as never, store.get as never, ['track-1'])
    expect(store.state().transfersOpen).toBe(true)
  })
})

function readerOf(parts: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return {
    getReader: () => ({
      read: () => Promise.resolve(index < parts.length ? { done: false, value: parts[index++]! } : { done: true, value: undefined }),
    }),
  } as unknown as ReadableStream<Uint8Array>
}
