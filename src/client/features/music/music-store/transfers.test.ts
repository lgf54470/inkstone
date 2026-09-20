import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicTrack } from '@shared/types'
import { saveBlob } from '../music-export'
import { toastMusicError } from '../music-feedback'
import { downloadFileName } from '../music-utils'
import { downloadTracks, streamToBlob } from './transfers'
import type { MusicSet } from './types'

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
    format: 'flac',
    webdavPath: 'Music/Moonlight.flac',
    mime: 'audio/flac',
    sizeBytes: 300,
    coverUrl: null,
    lyric: null,
    hasLyric: false,
    tagIds: [],
    isFavorite: false,
    isPinned: false,
    playCount: 0,
    lastPlayedAt: null, contentHash: null,
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
  const store = musicStoreStub({ tracks, downloads: [], transfersOpen: false })
  return { ...store, state: store.read }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('downloadFileName', () => {
  it('keeps the artist, title and the file extension of the stored object', () => {
    expect(downloadFileName(track())).toBe('Hu Yanbin - Moonlight.flac')
    expect(downloadFileName(track({ artist: '' }))).toBe('Moonlight.flac')
  })

  it('falls back to the content type and strips characters a file system rejects', () => {
    expect(downloadFileName(track({ format: null, mime: 'audio/mp4' }))).toBe('Hu Yanbin - Moonlight.m4a')
    expect(downloadFileName(track({ title: 'A/B: "C"', format: null, mime: 'audio/flac' }))).toBe('Hu Yanbin - A_B_ _C_.flac')
  })
})

describe('streamToBlob', () => {
  it('reports progress against the announced length and keeps every byte', async () => {
    const percents: number[] = []
    const blob = await streamToBlob({ body: readerOf(chunks(100, 100, 100)), totalBytes: 300, mime: 'audio/flac', onProgress: (percent) => percents.push(percent) })
    expect(blob.size).toBe(300)
    expect(blob.type).toBe('audio/flac')
    expect(percents).toEqual([33, 67, 99])
  })

  it('skips progress when the length is unknown and tolerates an empty body', async () => {
    const percents: number[] = []
    expect((await streamToBlob({ body: readerOf(chunks(50)), totalBytes: 0, mime: '', onProgress: (percent) => percents.push(percent) })).size).toBe(50)
    expect(percents).toEqual([])
    expect((await streamToBlob({ body: null, totalBytes: 100, mime: '', onProgress: (percent) => percents.push(percent) })).size).toBe(0)
  })
})

describe('downloadTracks', () => {
  it('saves the fetched file and drops the finished task', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(120, 180), 300)))
    await downloadTracks(store.set, store.get, ['track-1'])
    expect(saveBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = (saveBlob as unknown as Mock).mock.calls[0]!
    expect(filename).toBe('Hu Yanbin - Moonlight.flac')
    expect((blob as Blob).size).toBe(300)
    expect(store.state().downloads).toEqual([])
  })

  it('keeps a failed task and reports it', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }))
    await downloadTracks(store.set, store.get, ['track-1'])
    expect(saveBlob).not.toHaveBeenCalled()
    expect(toastMusicError).toHaveBeenCalledTimes(1)
    expect(store.state().downloads).toHaveLength(1)
    expect(store.state().downloads[0]?.status).toBe('failed')
  })

  it('fails the task when the body turns out empty', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve(respond([], 0)))
    await downloadTracks(store.set, store.get, ['track-1'])
    expect(saveBlob).not.toHaveBeenCalled()
    expect(String(vi.mocked(toastMusicError).mock.calls[0]![0])).toBe('Error: The downloaded file is empty')
    expect(store.state().downloads[0]?.status).toBe('failed')
  })

  it('opens the transfer dialog and ignores unknown ids', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(300), 300)))
    await downloadTracks(store.set, store.get, ['missing'])
    expect(store.state().transfersOpen).toBe(false)
    await downloadTracks(store.set, store.get, ['track-1'])
    expect(store.state().transfersOpen).toBe(true)
  })
})

function readerOf(parts: Uint8Array[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  let index = 0
  return {
    getReader: () => ({
      read: () => Promise.resolve(index < parts.length ? { done: false, value: parts[index++]! } : { done: true, value: undefined }),
    }),
  } as unknown as ReadableStream<Uint8Array<ArrayBuffer>>
}

describe('download progress writes', () => {
  it('collapses a burst of chunk callbacks into one store write', async () => {
    vi.useFakeTimers()
    const store = makeStore([track()])
    const percents: number[] = []
    const record: MusicSet = (patch) => {
      store.set(patch)
      percents.push(store.state().downloads[0]?.percent ?? -1)
    }
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(...Array.from({ length: 40 }, () => 10)), 400)))
    await downloadTracks(record, store.get, ['track-1'])
    const interim = percents.filter((percent) => percent > 0 && percent < 100)
    expect(interim.length).toBeGreaterThan(0)
    expect(interim.length).toBeLessThanOrEqual(2)
    expect(store.state().downloads).toEqual([])
    vi.useRealTimers()
  })

  it('keeps reporting while bytes trickle in slower than the throttle', async () => {
    vi.useFakeTimers()
    const store = makeStore([track()])
    const percents: number[] = []
    const record: MusicSet = (patch) => {
      store.set(patch)
      percents.push(store.state().downloads[0]?.percent ?? -1)
    }
    const parts = chunks(20, 20, 20, 20, 20)
    let index = 0
    const response = {
      ok: true,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? '100' : null) },
      body: {
        getReader: () => ({
          read: () => {
            vi.advanceTimersByTime(250)
            return Promise.resolve(index < parts.length ? { done: false, value: parts[index++] } : { done: true, value: undefined })
          },
        }),
      },
    }
    vi.stubGlobal('fetch', () => Promise.resolve(response))
    await downloadTracks(record, store.get, ['track-1'])
    expect(percents.filter((percent) => percent > 0 && percent < 100)).toEqual([20, 40, 60, 80, 99])
    vi.useRealTimers()
  })
})
