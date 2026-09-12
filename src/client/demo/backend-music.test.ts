import { describe, expect, it } from 'vitest'
import { DEMO_CREDENTIALS } from '../lib/runtime'
import { createDemoBackend } from './backend'

type DemoBackend = ReturnType<typeof createDemoBackend>

function call(backend: DemoBackend, path: string, init?: RequestInit): Promise<Response> {
  return backend.fetch(new Request(`http://demo.local${path}`, init))
}

async function authedBackend(): Promise<DemoBackend> {
  const backend = createDemoBackend()
  await call(backend, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(DEMO_CREDENTIALS),
  })
  return backend
}

const AUDIO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])

async function uploadTrack(backend: DemoBackend): Promise<Record<string, unknown>> {
  const form = new FormData()
  form.append('file', new File([AUDIO], 'demo.mp3', { type: 'audio/mpeg' }))
  form.append('title', 'Demo song')
  form.append('artist', 'Demo artist')
  const res = await call(backend, '/api/music/tracks', { method: 'POST', body: form })
  expect(res.status).toBe(201)
  return res.json() as Promise<Record<string, unknown>>
}

function jsonInit(body: unknown, method = 'POST'): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

describe('demo music backend', () => {
  it('requires authentication', async () => {
    const backend = createDemoBackend()
    expect((await call(backend, '/api/music/library')).status).toBe(401)
  })

  it('starts empty and accepts an upload', async () => {
    const backend = await authedBackend()
    const empty = await call(backend, '/api/music/library')
    expect(empty.status).toBe(200)
    expect((await empty.json()).tracks).toEqual([])

    const track = await uploadTrack(backend)
    expect(track.title).toBe('Demo song')
    expect(track.artist).toBe('Demo artist')
    expect(track.sizeBytes).toBe(AUDIO.byteLength)

    const library = await (await call(backend, '/api/music/library')).json()
    expect(library.stats.trackCount).toBe(1)
  })
})

describe('demo music streaming', () => {
  it('serves whole objects and byte ranges', async () => {
    const backend = await authedBackend()
    const track = await uploadTrack(backend)
    const id = String(track.id)

    const full = await call(backend, `/api/music/tracks/${id}/stream`)
    expect(full.status).toBe(200)
    expect(full.headers.get('Accept-Ranges')).toBe('bytes')
    expect((await full.arrayBuffer()).byteLength).toBe(AUDIO.byteLength)
  })

  it('honours a byte range and rejects an unsatisfiable one', async () => {
    const backend = await authedBackend()
    const id = String((await uploadTrack(backend)).id)

    const ranged = await call(backend, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=2-5' } })
    expect(ranged.status).toBe(206)
    expect(ranged.headers.get('Content-Range')).toBe('bytes 2-5/8')
    expect([...new Uint8Array(await ranged.arrayBuffer())]).toEqual([3, 4, 5, 6])

    const suffix = await call(backend, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=-3' } })
    expect([...new Uint8Array(await suffix.arrayBuffer())]).toEqual([6, 7, 8])

    const invalid = await call(backend, `/api/music/tracks/${id}/stream`, { headers: { Range: 'bytes=99-' } })
    expect(invalid.status).toBe(416)
  })
})

describe('demo music metadata', () => {
  it('patches flags and metadata', async () => {
    const backend = await authedBackend()
    const id = String((await uploadTrack(backend)).id)
    const patched = await call(backend, `/api/music/tracks/${id}`, jsonInit({ isFavorite: true, isPinned: true, title: 'Renamed' }, 'PATCH'))
    const updated = await patched.json()
    expect(updated.isFavorite).toBe(true)
    expect(updated.isPinned).toBe(true)
    expect(updated.title).toBe('Renamed')

    const library = await (await call(backend, '/api/music/library')).json()
    expect(library.stats.favoriteCount).toBe(1)
    expect(library.stats.pinnedCount).toBe(1)
  })

  it('assigns tags and rejects duplicates', async () => {
    const backend = await authedBackend()
    const id = String((await uploadTrack(backend)).id)

    const tag = await call(backend, '/api/music/tags', jsonInit({ name: 'Demo tag', color: 'indigo' }))
    expect(tag.status).toBe(201)
    const tagBody = await tag.json()

    const tagged = await call(backend, `/api/music/tracks/${id}`, jsonInit({ tagIds: [tagBody.id] }, 'PATCH'))
    expect((await tagged.json()).tagIds).toEqual([tagBody.id])

    const duplicate = await call(backend, '/api/music/tags', jsonInit({ name: 'Demo tag' }))
    expect(duplicate.status).toBe(409)
  })
})

describe('demo music playlists', () => {
  it('adds an item once and cascades it away with the track', async () => {
    const backend = await authedBackend()
    const track = await uploadTrack(backend)

    const playlist = await call(backend, '/api/music/playlists', jsonInit({ name: 'Demo playlist' }))
    expect(playlist.status).toBe(201)
    const playlistId = (await playlist.json()).id as string

    const added = await call(backend, `/api/music/playlists/${playlistId}/items`, jsonInit({ trackId: track.id }))
    expect((await added.json()).added).toBe(true)
    const again = await call(backend, `/api/music/playlists/${playlistId}/items`, jsonInit({ trackId: track.id }))
    expect((await again.json()).added).toBe(false)

    expect((await (await call(backend, '/api/music/library')).json()).playlists[0].items).toHaveLength(1)
    expect((await call(backend, `/api/music/tracks/${track.id}`, { method: 'DELETE' })).status).toBe(200)

    const after = await (await call(backend, '/api/music/library')).json()
    expect(after.tracks).toEqual([])
    expect(after.playlists[0].items).toEqual([])
  })

  it('batch-updates favourites across the selection', async () => {
    const backend = await authedBackend()
    const first = await uploadTrack(backend)
    const second = await uploadTrack(backend)
    const batch = await call(backend, '/api/music/tracks/batch', jsonInit({ ids: [first.id, second.id], action: 'favorite' }))
    expect((await batch.json()).updated).toBe(2)
    const library = await (await call(backend, '/api/music/library')).json()
    expect(library.tracks.every((entry: { isFavorite: boolean }) => entry.isFavorite)).toBe(true)
  })
})
