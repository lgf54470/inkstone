import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchCoverArtwork } from './music-cover-lookup'

const PICTURE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(76).fill(0)])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchCoverArtwork', () => {
  it('asks the worker for the matched artwork', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(String(url))
      return Promise.resolve({ ok: true, headers: { get: () => 'image/png; charset=binary' }, arrayBuffer: () => Promise.resolve(PICTURE.buffer) })
    })
    const artwork = await searchCoverArtwork('Moonlight', 'Hu Yanbin')
    expect(calls[0]).toBe('/api/music/cover-lookup?title=Moonlight&artist=Hu%20Yanbin')
    expect(artwork?.mime).toBe('image/png')
    expect(artwork?.bytes).toEqual(PICTURE)
  })

  it('reports no artwork when the worker finds none', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false }))
    expect(await searchCoverArtwork('Unknown', '')).toBeNull()
  })

  it('degrades to null when the request fails', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    expect(await searchCoverArtwork('Unknown', '')).toBeNull()
  })
})
