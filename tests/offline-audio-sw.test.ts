// Runs the ACTUAL generated service worker script (pwa.config.ts) inside a vm
// sandbox with fake caches/fetch so the offline audio protocol — network-first
// stream handling, Range slicing, quota eviction, list/remove/clear — is the
// shipped code being tested, not a re-implementation.
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { serviceWorkerSource } from '../pwa.config'

const ORIGIN = 'https://app.test'
const STREAM_PATH = '/api/music/tracks/a/stream'
const AUDIO_CACHE = 'inkstone-audio-v1'

class FakeCache {
  readonly entries = new Map<string, Response>()

  async match(input: string | Request): Promise<Response | undefined> {
    const path = typeof input === 'string' ? input : new URL(input.url).pathname
    // A real Cache hands out a fresh body per match; cloning keeps that contract
    // so one offline seek does not make the next one read a drained body.
    return this.entries.get(path)?.clone()
  }

  async put(key: string, response: Response): Promise<void> {
    this.entries.set(key, response)
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((path) => new Request(ORIGIN + path))
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key)
  }
}

class FakeCacheStorage {
  readonly map = new Map<string, FakeCache>()

  async open(name: string): Promise<FakeCache> {
    const existing = this.map.get(name)
    if (existing) return existing
    const created = new FakeCache()
    this.map.set(name, created)
    return created
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()]
  }

  async delete(name: string): Promise<boolean> {
    return this.map.delete(name)
  }
}

interface WorkerEventLike {
  request?: Request
  respondWith?: (response: Promise<Response>) => void
  data?: Record<string, unknown>
  source?: { postMessage: (message: Record<string, unknown>) => void }
  waitUntil?: (task: Promise<unknown>) => void
}

function audioBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.fill(7)
  return bytes
}

async function audioBody(response: Response): Promise<Uint8Array> {
  return new Uint8Array(await response.arrayBuffer())
}

function intercepted(response: Response | 'not-intercepted'): Response {
  if (response === 'not-intercepted') throw new Error('the fetch handler never called respondWith')
  return response
}

function startWorker(options: { budgetBytes?: number } = {}) {
  const source = serviceWorkerSource('testbuild', ['/index.html'], ['/index.html'], options.budgetBytes ?? 1024)
  const handlers = new Map<string, ((event: WorkerEventLike) => void)[]>()
  const caches = new FakeCacheStorage()
  let networkHandler: (request: Request) => Promise<Response> = async () => {
    throw new Error('the network is out')
  }
  let clock = 1000
  const sandbox = {
    self: {
      location: { origin: ORIGIN, href: ORIGIN + '/' },
      addEventListener: (type: string, listener: (event: WorkerEventLike) => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), listener])
      },
      clients: { matchAll: async () => [] },
      skipWaiting: () => {},
    },
    caches,
    fetch: (request: Request) => networkHandler(request),
    Response,
    Request,
    Headers,
    Blob,
    URL,
    TextDecoder,
    Date: { now: () => ++clock },
    setTimeout: (_fn: () => void, _ms: number) => 0,
    console,
  }
  vm.runInNewContext(source, sandbox)

  return {
    caches,
    setNetwork(handler: (request: Request) => Promise<Response>): void {
      networkHandler = handler
    },
    async fireStream(path = STREAM_PATH, range?: string): Promise<Response | 'not-intercepted'> {
      const request = new Request(ORIGIN + path, range ? { headers: { Range: range } } : {})
      let respond: Promise<Response> | null = null
      const event: WorkerEventLike = { request, respondWith: (promise) => { respond = promise } }
      for (const listener of handlers.get('fetch') ?? []) listener(event)
      return respond ? await respond : 'not-intercepted'
    },
    async send(data: Record<string, unknown>): Promise<Record<string, unknown>[]> {
      const replies: Record<string, unknown>[] = []
      const tasks: Promise<unknown>[] = []
      const event: WorkerEventLike = {
        data,
        source: { postMessage: (message) => { replies.push(message) } },
        waitUntil: (task) => { tasks.push(task) },
      }
      for (const listener of handlers.get('message') ?? []) listener(event)
      await Promise.all(tasks)
      return replies
    },
  }
}

async function storedList(worker: ReturnType<typeof startWorker>): Promise<string[]> {
  const [reply] = await worker.send({ type: 'LIST_OFFLINE_AUDIO', requestId: 1 })
  const tracks = (reply?.tracks ?? []) as { path: string }[]
  return tracks.map((track) => track.path).sort()
}

describe('service worker offline audio stream handling', () => {
  it('serves a stream from the network while online and leaves other API paths alone', async () => {
    const worker = startWorker()
    worker.setNetwork(async () => new Response('from-server', { status: 200 }))
    const response = intercepted(await worker.fireStream())
    expect(await response.text()).toBe('from-server')
    expect(await worker.fireStream('/api/music/playlists')).toBe('not-intercepted')
  })

  it('plays a cached track without a Range request when the network is gone', async () => {
    const worker = startWorker()
    const cache = await worker.caches.open(AUDIO_CACHE)
    cache.entries.set(STREAM_PATH, new Response(audioBytes(300), { headers: { 'Content-Type': 'audio/mpeg' } }))
    const response = intercepted(await worker.fireStream())
    expect(response.status).toBe(200)
    expect(await audioBody(response)).toHaveLength(300)
  })

  it('answers an offline Range request with a 206 slice of the cached body', async () => {
    const worker = startWorker()
    const cache = await worker.caches.open(AUDIO_CACHE)
    cache.entries.set(STREAM_PATH, new Response(audioBytes(300), { headers: { 'Content-Type': 'audio/mpeg' } }))
    const response = intercepted(await worker.fireStream(STREAM_PATH, 'bytes=0-49'))
    expect(response.status).toBe(206)
    expect(response.headers.get('Content-Range')).toBe('bytes 0-49/300')
    expect(await audioBody(response)).toHaveLength(50)
  })

  it('serves the tail for a suffix range and clamps an open-ended one', async () => {
    const worker = startWorker()
    const cache = await worker.caches.open(AUDIO_CACHE)
    cache.entries.set(STREAM_PATH, new Response(audioBytes(300), { headers: { 'Content-Type': 'audio/mpeg' } }))
    const suffix = intercepted(await worker.fireStream(STREAM_PATH, 'bytes=-10'))
    expect(suffix.headers.get('Content-Range')).toBe('bytes 290-299/300')
    expect(await audioBody(suffix)).toHaveLength(10)
    const open = intercepted(await worker.fireStream(STREAM_PATH, 'bytes=250-'))
    expect(open.headers.get('Content-Range')).toBe('bytes 250-299/300')
  })

  it('rejects an out-of-range offline seek with 416', async () => {
    const worker = startWorker()
    const cache = await worker.caches.open(AUDIO_CACHE)
    cache.entries.set(STREAM_PATH, new Response(audioBytes(300), { headers: { 'Content-Type': 'audio/mpeg' } }))
    const response = intercepted(await worker.fireStream(STREAM_PATH, 'bytes=500-600'))
    expect(response.status).toBe(416)
    expect(response.headers.get('Content-Range')).toBe('bytes */300')
  })

  it('still fails an offline stream that was never saved', async () => {
    const worker = startWorker()
    expect(intercepted(await worker.fireStream()).type).toBe('error')
  })
})

describe('service worker offline audio store protocol', () => {
  it('stores a posted blob and lists it back with its size', async () => {
    const worker = startWorker()
    const stored = await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 1, path: STREAM_PATH, blob: new Blob([audioBytes(100)]), mime: 'audio/mpeg' })
    expect(stored).toEqual([{ type: 'OFFLINE_AUDIO_STORED', requestId: 1, ok: true, reason: null }])
    expect(await storedList(worker)).toEqual([STREAM_PATH])
    const cache = await worker.caches.open(AUDIO_CACHE)
    expect((await cache.match(STREAM_PATH))?.headers.get('content-type')).toBe('audio/mpeg')
  })

  it('refuses to cache anything that is not a music stream path', async () => {
    const worker = startWorker()
    const stored = await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 2, path: '/index.html', blob: new Blob([audioBytes(10)]) })
    expect(stored[0]).toMatchObject({ type: 'OFFLINE_AUDIO_STORED', ok: false, reason: 'invalid' })
    expect(await storedList(worker)).toEqual([])
  })

  it('evicts the oldest saved track when a new save crosses the budget', async () => {
    const worker = startWorker({ budgetBytes: 250 })
    for (const id of ['a', 'b']) {
      await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 3, path: `/api/music/tracks/${id}/stream`, blob: new Blob([audioBytes(100)]) })
    }
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 4, path: '/api/music/tracks/c/stream', blob: new Blob([audioBytes(100)]) })
    expect(await storedList(worker)).toEqual([
      '/api/music/tracks/b/stream',
      '/api/music/tracks/c/stream',
    ])
  })

  it('refuses a track that cannot fit even an emptied cache and keeps what it has', async () => {
    const worker = startWorker({ budgetBytes: 250 })
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 5, path: STREAM_PATH, blob: new Blob([audioBytes(100)]) })
    const stored = await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 6, path: '/api/music/tracks/big/stream', blob: new Blob([audioBytes(400)]) })
    expect(stored[0]).toMatchObject({ ok: false, reason: 'quota' })
    expect(await storedList(worker)).toEqual([STREAM_PATH])
  })

  it('re-saving a track replaces it instead of counting it twice', async () => {
    const worker = startWorker({ budgetBytes: 250 })
    const path = '/api/music/tracks/a/stream'
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 7, path, blob: new Blob([audioBytes(100)]) })
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 8, path, blob: new Blob([audioBytes(200)]) })
    const cache = await worker.caches.open(AUDIO_CACHE)
    const [reply] = await worker.send({ type: 'LIST_OFFLINE_AUDIO', requestId: 9 })
    expect(reply?.tracks).toEqual([{ path, sizeBytes: 200 }])
    expect(cache.entries.size).toBe(1)
  })

  it('removes one track and reports whether the entry was there', async () => {
    const worker = startWorker()
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 10, path: STREAM_PATH, blob: new Blob([audioBytes(10)]) })
    const removed = await worker.send({ type: 'REMOVE_OFFLINE_AUDIO', requestId: 11, path: STREAM_PATH })
    expect(removed[0]).toMatchObject({ type: 'OFFLINE_AUDIO_REMOVED', ok: true })
    const again = await worker.send({ type: 'REMOVE_OFFLINE_AUDIO', requestId: 12, path: STREAM_PATH })
    expect(again[0]).toMatchObject({ ok: false })
    expect(await storedList(worker)).toEqual([])
  })

  it('clears the whole offline audio cache on logout', async () => {
    const worker = startWorker()
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 13, path: STREAM_PATH, blob: new Blob([audioBytes(10)]) })
    const cleared = await worker.send({ type: 'CLEAR_OFFLINE_AUDIO', requestId: 14 })
    expect(cleared[0]).toMatchObject({ type: 'OFFLINE_AUDIO_CLEARED', ok: true })
    expect(worker.caches.map.has(AUDIO_CACHE)).toBe(false)
    expect(await storedList(worker)).toEqual([])
  })
})

// FB3-F4: an offline copy is meant to be read with no network at all, so the cover and the lyric
// travel with the audio and are served from the same cache when the network is gone.
describe('service worker offline media (FB3-F4)', () => {
  const COVER_PATH = '/api/music/tracks/a/cover'
  const LYRIC_PATH = '/api/music/tracks/a/lyric'

  function extras(): { path: string; blob: Blob; mime: string }[] {
    return [
      { path: COVER_PATH, blob: new Blob([audioBytes(60)]), mime: 'image/png' },
      { path: LYRIC_PATH, blob: new Blob([audioBytes(20)]), mime: 'application/json' },
    ]
  }

  it('serves a stored cover and lyric from the cache once the network is gone', async () => {
    const worker = startWorker()
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 20, path: STREAM_PATH, blob: new Blob([audioBytes(10)]), extra: extras() })
    worker.setNetwork(async () => { throw new Error('the network is out') })
    const cover = intercepted(await worker.fireStream(COVER_PATH))
    expect(cover.headers.get('content-type')).toBe('image/png')
    expect(await audioBody(cover)).toHaveLength(60)
    const lyric = intercepted(await worker.fireStream(LYRIC_PATH))
    expect(lyric.headers.get('content-type')).toBe('application/json')
    expect(await audioBody(lyric)).toHaveLength(20)
  })

  it('leaves the track list alone and keeps the media out of it', async () => {
    const worker = startWorker()
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 21, path: STREAM_PATH, blob: new Blob([audioBytes(10)]), extra: extras() })
    expect(await storedList(worker)).toEqual([STREAM_PATH])
  })

  it('goes to the network for a cover that was never stored', async () => {
    const worker = startWorker()
    worker.setNetwork(async () => new Response(audioBytes(30), { headers: { 'Content-Type': 'image/png' } }))
    expect(await audioBody(intercepted(await worker.fireStream(COVER_PATH)))).toHaveLength(30)
    worker.setNetwork(async () => { throw new Error('the network is out') })
    expect(intercepted(await worker.fireStream(COVER_PATH)).type).toBe('error')
  })

  // The senders are ours, so an extra that names another track — or a path that is not a track
  // medium at all — is a bug; dropping it keeps the cache and the audio intact.
  it('drops an extra that is not this track\'s own medium', async () => {
    const worker = startWorker()
    const stored = await worker.send({
      type: 'STORE_OFFLINE_AUDIO', requestId: 22, path: STREAM_PATH, blob: new Blob([audioBytes(10)]),
      extra: [
        { path: '/api/music/tracks/b/cover', blob: new Blob([audioBytes(5)]), mime: 'image/png' },
        { path: '/index.html', blob: new Blob([audioBytes(5)]), mime: 'text/html' },
      ],
    })
    expect(stored[0]).toMatchObject({ ok: true })
    expect(await storedList(worker)).toEqual([STREAM_PATH])
    const cache = await worker.caches.open(AUDIO_CACHE)
    expect(cache.entries.size).toBe(1)
  })

  it('counts the extras against the budget when it evicts', async () => {
    const worker = startWorker({ budgetBytes: 250 })
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 23, path: STREAM_PATH, blob: new Blob([audioBytes(100)]), extra: extras() })
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 24, path: '/api/music/tracks/b/stream', blob: new Blob([audioBytes(100)]) })
    expect(await storedList(worker)).toEqual(['/api/music/tracks/b/stream'])
    const cache = await worker.caches.open(AUDIO_CACHE)
    expect(cache.entries.has(COVER_PATH)).toBe(false)
    expect(cache.entries.has(LYRIC_PATH)).toBe(false)
  })

  it('removes the extras with the track they belong to', async () => {
    const worker = startWorker()
    await worker.send({ type: 'STORE_OFFLINE_AUDIO', requestId: 25, path: STREAM_PATH, blob: new Blob([audioBytes(10)]), extra: extras() })
    const removed = await worker.send({ type: 'REMOVE_OFFLINE_AUDIO', requestId: 26, path: STREAM_PATH })
    expect(removed[0]).toMatchObject({ ok: true })
    const cache = await worker.caches.open(AUDIO_CACHE)
    expect(cache.entries.size).toBe(0)
  })
})
