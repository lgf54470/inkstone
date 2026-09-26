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

describe('demo video upload', () => {
  async function uploadNamed(backend: DemoBackend, name: string, type: string): Promise<Response> {
    const form = new FormData()
    form.append('file', new File([AUDIO], name, { type }))
    form.append('title', 'Demo clip')
    return call(backend, '/api/music/tracks', { method: 'POST', body: form })
  }

  it('accepts a video container and serves it back with its own type', async () => {
    const backend = await authedBackend()
    const created = await uploadNamed(backend, 'concert.mov', '')
    expect(created.status).toBe(201)
    const track = await created.json()
    expect(track.mime).toBe('video/quicktime')
    expect(track.format).toBe('mov')

    const streamed = await call(backend, `/api/music/tracks/${track.id}/stream`)
    expect(streamed.headers.get('Content-Type')).toBe('video/quicktime')
  })

  it('rejects a video container no browser decodes instead of filing it as audio', async () => {
    const backend = await authedBackend()
    const rejected = await uploadNamed(backend, 'clip.avi', 'video/x-msvideo')
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error.message).toBe('Unsupported media format')
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

  it('mirrors the worker share contract: stable slug, public view, revocation', async () => {
    const backend = await authedBackend()
    const track = await uploadTrack(backend)
    const playlist = await call(backend, '/api/music/playlists', jsonInit({ name: 'Shared' }))
    const playlistId = (await playlist.json()).id as string
    await call(backend, `/api/music/playlists/${playlistId}/items`, jsonInit({ trackId: track.id }))

    const first = await (await call(backend, `/api/music/playlists/${playlistId}/share`, { method: 'POST' })).json()
    const second = await (await call(backend, `/api/music/playlists/${playlistId}/share`, { method: 'POST' })).json()
    expect(first.shareSlug).toBeTruthy()
    expect(second.shareSlug).toBe(first.shareSlug)

    const page = await call(backend, `/api/blog/public/music/playlists/${first.shareSlug}`)
    expect(page.status).toBe(200)
    const body = await page.json()
    expect(body.name).toBe('Shared')
    expect(body.tracks.map((entry: { id: string }) => entry.id)).toEqual([track.id])
    expect(body.tracks[0].mime).toBe('audio/mpeg')

    const revoked = await call(backend, `/api/music/playlists/${playlistId}/share`, { method: 'DELETE' })
    expect((await revoked.json()).shareSlug).toBeNull()
    expect((await call(backend, `/api/blog/public/music/playlists/${first.shareSlug}`)).status).toBe(404)
  })
})

describe('demo music batch endpoints', () => {
  it('bulk-adds playlist items and reports what it skipped', async () => {
    const backend = await authedBackend()
    const first = await uploadTrack(backend)
    const second = await uploadTrack(backend)
    const playlist = await call(backend, '/api/music/playlists', jsonInit({ name: 'Bulk' }))
    const playlistId = (await playlist.json()).id as string
    await call(backend, `/api/music/playlists/${playlistId}/items`, jsonInit({ trackId: first.id }))

    const bulk = await call(backend, `/api/music/playlists/${playlistId}/items/batch`,
      jsonInit({ trackIds: [second.id, first.id, 'ghost'] }))
    expect(bulk.status).toBe(200)
    const body = await bulk.json()
    expect(body.items.map((item: { trackId: string }) => item.trackId)).toEqual([second.id])
    expect(body.added).toBe(1)
    expect(body.skipped).toBe(2)

    const stored = (await (await call(backend, '/api/music/library')).json()).playlists[0]
    expect(stored.items.map((item: { trackId: string }) => item.trackId)).toEqual([first.id, second.id])
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

  it('tags a whole selection, dropping ids the demo does not know', async () => {
    const backend = await authedBackend()
    const first = await uploadTrack(backend)
    const second = await uploadTrack(backend)
    const tag = await call(backend, '/api/music/tags', jsonInit({ name: 'Bulk' }))
    const tagId = (await tag.json()).id as string

    const missing = await call(backend, '/api/music/tracks/batch', jsonInit({ ids: [first.id], action: 'tag' }))
    expect(missing.status).toBe(400)

    const batch = await call(backend, '/api/music/tracks/batch',
      jsonInit({ ids: [first.id, second.id], action: 'tag', tagIds: [tagId, 'ghost'] }))
    expect((await batch.json()).updated).toBe(2)
    const library = await (await call(backend, '/api/music/library')).json()
    expect(library.tracks.every((entry: { tagIds: string[] }) => entry.tagIds.join() === tagId)).toBe(true)
  })
})

describe('demo music URL import (FEA-B3)', () => {
  it('registers an external reference row and rejects unsupported input', async () => {
    const backend = await authedBackend()
    const res = await call(backend, '/api/music/tracks/import-url', jsonInit({ url: 'https://cdn.example.com/audio/demo song.mp3' }))
    expect(res.status).toBe(201)
    const track = (await res.json()) as Record<string, unknown>
    expect(track.source).toBe('external')
    expect(track.title).toBe('demo song')
    expect(track.webdavPath).toBeNull()

    const bad = await call(backend, '/api/music/tracks/import-url', jsonInit({ url: 'ftp://cdn.example.com/a.mp3' }))
    expect(bad.status).toBe(400)

    const library = await (await call(backend, '/api/music/library')).json()
    expect(library.stats.trackCount).toBe(1)
  })
})

describe('demo playlist cover (FEA-D2 / IMP-10)', () => {
  it('stores a data-url cover through the patch contract', async () => {
    const backend = await authedBackend()
    const playlist = (await (await call(backend, '/api/music/playlists', jsonInit({ name: 'Demo cover' }))).json()) as { id: string }
    const patched = (await (await call(backend, `/api/music/playlists/${playlist.id}`, jsonInit(
      { coverDataUrl: 'data:image/png;base64,iVBORw0KGgo=' },
      'PATCH',
    ))).json()) as { coverUrl: string | null }
    expect(patched.coverUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
  })
})

describe('demo music trash (FEA-B1)', () => {
  it('moves deleted tracks to trash, restores them and purges them', async () => {
    const backend = await authedBackend()
    const track = await uploadTrack(backend)

    expect((await call(backend, `/api/music/tracks/${track.id}`, { method: 'DELETE' })).status).toBe(200)
    let trash = (await (await call(backend, '/api/music/trash')).json()) as unknown as { entries: Array<{ id: string; kind: string }> }
    expect(trash.entries).toEqual([expect.objectContaining({ id: track.id, kind: 'track' })])

    expect((await call(backend, `/api/music/trash/${track.id}/restore`, { method: 'POST' })).status).toBe(200)
    const library = (await (await call(backend, '/api/music/library')).json()) as { tracks: Array<{ id: string }> }
    expect(library.tracks.map((entry) => entry.id)).toContain(track.id)

    await call(backend, `/api/music/tracks/${track.id}`, { method: 'DELETE' })
    expect((await call(backend, `/api/music/trash/${track.id}`, { method: 'DELETE' })).status).toBe(200)
    trash = (await (await call(backend, '/api/music/trash')).json()) as unknown as { entries: Array<{ id: string; kind: string }> }
    expect(trash.entries).toEqual([])
  })
})

describe('demo alist (FEA-A3)', () => {
  it('manages servers, browses and imports outside the quota', async () => {
    const backend = await authedBackend()
    const created = (await (await call(backend, '/api/music/alist', jsonInit({
      name: 'NAS', url: 'https://alist.example.com', token: 'tok', rootPath: '/media',
    }))).json()) as Record<string, unknown>
    expect(created.id).toBeTruthy()
    expect(JSON.stringify(created)).not.toContain('tok')

    const listing = (await (await call(backend, `/api/music/alist/${created.id}/list?path=%2F`)).json()) as { entries: Array<{ name: string; isDir: boolean }> }
    expect(listing.entries.some((entry) => entry.name === 'ambient-one.mp3')).toBe(true)

    const imported = (await (await call(backend, `/api/music/alist/${created.id}/import`, jsonInit({ path: '/ambient-one.mp3' }))).json()) as { source: string; id: string }
    expect(imported.source).toBe('alist')
    const library = (await (await call(backend, '/api/music/library')).json()) as { stats: { totalBytes: number } }
    expect(library.stats.totalBytes).toBe(0)
  })
})
