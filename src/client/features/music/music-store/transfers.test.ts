import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { musicStoreStub } from './store.test-helpers'
import type { MusicTrack } from '@shared/types'
import { saveBlob } from '../music-export'
import { toastMusicError } from '../music-feedback'
import { downloadFileName } from '../music-utils'
import { cancelDownloads, dismissDownload, downloadTracks, retryDownload, retryFailedDownloads, streamToBlob } from './transfers'
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
  const store = musicStoreStub({
    tracks, downloads: [], transfersOpen: false, providerQuality: 128, downloadQuality: 740,
  })
  return { ...store, state: store.read }
}

// A transfer that answers only when its signal aborts: the test drives the cancel button
// instead of waiting for a timeout nobody wants to reach.
function hangingFetch(): (url: string, init?: { signal?: AbortSignal }) => Promise<never> {
  return (_url, init) => new Promise((_resolve, reject) => {
    const fail = (): void => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    if (init?.signal?.aborted) fail()
    else init?.signal?.addEventListener('abort', fail, { once: true })
  })
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

  // FB3-F4: the tier a stream is auditioned at and the tier a file is kept at stopped being the
  // same question the moment the reader could answer it twice.
  it('fetches the bytes at the download tier, not the playback tier', async () => {
    const store = makeStore([track({ source: 'provider', format: 'mp3', mime: 'audio/mpeg', webdavPath: null })])
    const fetchMock = vi.fn((_url: string) => Promise.resolve(respond(chunks(300), 300)))
    vi.stubGlobal('fetch', fetchMock)
    await downloadTracks(store.set, store.get, ['track-1'])
    expect(String(fetchMock.mock.calls[0]![0])).toContain('quality=740')
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

describe('download quality (FB-F7)', () => {
  it('asks the proxy for the chosen tier on online rows only', async () => {
    const urls: string[] = []
    const store = makeStore([track(), track({ id: 'track-2', source: 'provider' })])
    // FB3-F4: the tier a download asks for is its own preference, so this case pins the one it
    // is about instead of inheriting whatever the shared fixture happens to ship.
    store.set({ providerQuality: 128, downloadQuality: 128 })
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(respond(chunks(300), 300))
    })
    await downloadTracks(store.set, store.get, ['track-1', 'track-2'])
    expect(urls).toEqual(['/api/music/tracks/track-1/stream', '/api/music/tracks/track-2/stream?quality=128'])
  })
})

describe('download cancel (FB-F11)', () => {
  it('stops a running download when its row is dismissed, saving nothing and reporting nothing', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', hangingFetch())
    const run = downloadTracks(store.set, store.get, ['track-1'])
    await Promise.resolve()
    const task = store.state().downloads[0]!
    expect(task.status).toBe('downloading')
    dismissDownload(store.set, store.get, task.id)
    await run
    expect(store.state().downloads).toEqual([])
    expect(saveBlob).not.toHaveBeenCalled()
    expect(toastMusicError).not.toHaveBeenCalled()
  })

  it('stops every running download at once and keeps the rows that already answered', async () => {
    const store = makeStore([track(), track({ id: 'track-2' }), track({ id: 'track-3' })])
    vi.stubGlobal('fetch', hangingFetch())
    const run = downloadTracks(store.set, store.get, ['track-1', 'track-2', 'track-3'])
    await Promise.resolve()
    store.set({ downloads: [...store.state().downloads, { id: 'gone', trackId: 'track-1', name: 'x.flac', percent: 0, status: 'failed', controller: new AbortController() }] })
    cancelDownloads(store.set, store.get)
    expect(store.state().downloads.map((task) => task.id)).toEqual(['gone'])
    await run
    expect(saveBlob).not.toHaveBeenCalled()
    expect(toastMusicError).not.toHaveBeenCalled()
  })
})

describe('download retry (FB-F11)', () => {
  it('retries one failed task in place, and its earlier failure no longer reports twice', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 500 }))
    await downloadTracks(store.set, store.get, ['track-1'])
    const failed = store.state().downloads[0]!
    vi.mocked(toastMusicError).mockClear()
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(120, 180), 300)))
    await retryDownload(store.set, store.get, failed.id)
    expect(saveBlob).toHaveBeenCalledTimes(1)
    expect(store.state().downloads).toEqual([])
    expect(toastMusicError).not.toHaveBeenCalled()
  })

  it('retries every failed task and leaves the rows that never failed alone', async () => {
    const store = makeStore([track(), track({ id: 'track-2' })])
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 500 }))
    await downloadTracks(store.set, store.get, ['track-1', 'track-2'])
    expect(store.state().downloads).toHaveLength(2)
    vi.stubGlobal('fetch', () => Promise.resolve(respond(chunks(300), 300)))
    await retryFailedDownloads(store.set, store.get)
    expect(saveBlob).toHaveBeenCalledTimes(2)
    expect(store.state().downloads).toEqual([])
  })

  it('ignores a retry for a row that is not there or still running', async () => {
    const store = makeStore([track()])
    vi.stubGlobal('fetch', hangingFetch())
    const run = downloadTracks(store.set, store.get, ['track-1'])
    await Promise.resolve()
    const running = store.state().downloads[0]!
    await retryDownload(store.set, store.get, running.id)
    await retryDownload(store.set, store.get, 'gone')
    expect(store.state().downloads).toHaveLength(1)
    expect(store.state().downloads[0]?.status).toBe('downloading')
    cancelDownloads(store.set, store.get)
    await run
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
