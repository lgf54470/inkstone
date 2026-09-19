import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api', () => ({
  musicStreamUrl: (id: string) => `/api/music/tracks/${encodeURIComponent(id)}/stream`,
}))

import {
  clearOfflineAudioTracks, listOfflineAudioTracks, removeTrackOffline, saveTrackOffline,
  trackIdFromOfflinePath,
} from './offline-audio'

interface FakeWorker {
  posted: Record<string, unknown>[]
  postMessage: (message: Record<string, unknown>) => void
  addEventListener: (type: string, fn: (event: MessageEvent) => void) => void
  removeEventListener: (type: string, fn: (event: MessageEvent) => void) => void
}

let listeners: ((event: MessageEvent) => void)[] = []
let worker: FakeWorker | null = null

function makeWorker(): FakeWorker {
  const created: FakeWorker = {
    posted: [],
    postMessage: (message) => { created.posted.push(message) },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return created
}

function deliver(data: Record<string, unknown>): void {
  for (const listener of [...listeners]) listener({ data } as MessageEvent)
}

function installNavigator(withWorker: boolean): void {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    get: () => withWorker ? {
      controller: worker,
      addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
      removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => {
        listeners = listeners.filter((entry) => entry !== fn)
      },
    } : undefined,
  })
}

function lastPostedRequestId(): number {
  const message = worker?.posted.at(-1) as { requestId: number } | undefined
  return message?.requestId ?? -1
}

beforeEach(() => {
  listeners = []
  worker = makeWorker()
  installNavigator(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  installNavigator(false)
})

describe('offline-audio save flow', () => {
  it('reports no tracks when no worker controls the page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
    installNavigator(false)
    await expect(listOfflineAudioTracks()).resolves.toBeNull()
    await expect(saveTrackOffline('a', 'audio/mpeg')).resolves.toBe('failed')
  })

  it('sends the blob and mime when saving a track', async () => {
    const bytes = new TextEncoder().encode('audio-bytes')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes, { status: 200 })))
    const pending = saveTrackOffline('t1', 'audio/mpeg')
    await vi.waitFor(() => expect(worker?.posted).toHaveLength(1))
    deliver({ type: 'OFFLINE_AUDIO_STORED', requestId: lastPostedRequestId(), ok: true, reason: null })
    expect(await pending).toBe('saved')
    const message = worker?.posted[0] as Record<string, unknown>
    expect(message).toMatchObject({ type: 'STORE_OFFLINE_AUDIO', path: '/api/music/tracks/t1/stream', mime: 'audio/mpeg' })
    expect((message.blob as Blob).size).toBe(bytes.byteLength)
  })

  it('maps the worker quota refusal to a quota result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['x']))))
    const pending = saveTrackOffline('t1', 'audio/mpeg')
    await vi.waitFor(() => expect(worker?.posted).toHaveLength(1))
    deliver({ type: 'OFFLINE_AUDIO_STORED', requestId: lastPostedRequestId(), ok: false, reason: 'quota' })
    expect(await pending).toBe('quota')
  })

  it('fails a save when the stream fetch is not ok', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveTrackOffline('gone', 'audio/mpeg')).resolves.toBe('failed')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(worker?.posted).toHaveLength(0)
  })
})

describe('offline-audio request/reply round-trip', () => {
  it('lists tracks matched by reply type and request id only', async () => {
    const pending = listOfflineAudioTracks()
    deliver({ type: 'OFFLINE_AUDIO_LIST', requestId: lastPostedRequestId() - 1, tracks: [{ path: 'stale', sizeBytes: 1 }] })
    deliver({ type: 'OFFLINE_AUDIO_LIST', requestId: lastPostedRequestId(), tracks: [{ path: '/api/music/tracks/a/stream', sizeBytes: 5 }] })
    expect(await pending).toEqual([{ path: '/api/music/tracks/a/stream', sizeBytes: 5 }])
    expect(listeners).toHaveLength(0)
  })

  it('times out a worker that never answers', async () => {
    vi.useFakeTimers()
    const pending = removeTrackOffline('t1')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await pending).toBe(false)
    expect(listeners).toHaveLength(0)
    vi.useRealTimers()
  })

  it('clears the whole cache only on an explicit ok reply', async () => {
    const pending = clearOfflineAudioTracks()
    deliver({ type: 'OFFLINE_AUDIO_CLEARED', requestId: lastPostedRequestId(), ok: true })
    expect(await pending).toBe(true)
  })
})

describe('offline path round-trip', () => {
  it('decodes an encoded track id back from the stream path', () => {
    expect(trackIdFromOfflinePath('/api/music/tracks/a%2Fb/stream')).toBe('a/b')
  })

  it('returns null for paths that are not a stream and for undecodable ids', () => {
    expect(trackIdFromOfflinePath('/api/music/tracks/a/download')).toBeNull()
    expect(trackIdFromOfflinePath('/api/music/tracks/%ZZ/stream')).toBeNull()
  })
})
