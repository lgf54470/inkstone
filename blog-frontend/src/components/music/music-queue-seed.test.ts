import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'
import { loadMusicLibrary, musicSnapshot, playTrack } from './music-player'

function track(overrides: Partial<BlogMusicTrack> = {}): BlogMusicTrack {
  const id = overrides.id ?? 'a'
  return {
    id,
    title: 'Moonlight',
    artist: 'Hu Yanbin',
    album: 'Album One',
    durationMs: 200_000,
    lyric: null,
    coverUrl: null,
    streamUrl: `https://api.test/api/blog/public/music/tracks/${id}/stream`,
    tagIds: [],
    createdAt: 1,
    ...overrides,
  }
}

function stubLibrary(tracks: BlogMusicTrack[], queue: { ids: string[]; currentId: string | null }): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ enabled: true, tracks, tags: [], queue }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearApiMemoryCache()
})

describe('seeding from the app queue', () => {
  it('opens with the queue the notes app holds and keeps it while playing from it', async () => {
    stubLibrary(
      [track({ id: 'a' }), track({ id: 'b', title: 'Sakura' }), track({ id: 'c', title: 'Sunrise' })],
      { ids: ['b', 'a', 'ghost'], currentId: 'b' },
    )
    await loadMusicLibrary(true)
    const seeded = musicSnapshot()
    expect(seeded.status).toBe('ready')
    expect(seeded.queue).toEqual(['b', 'a'])
    expect(seeded.currentId).toBe('b')
    expect(seeded.durationMs).toBe(200_000)
    expect(seeded.playing).toBe(false)

    playTrack('a')
    expect(musicSnapshot().queue).toEqual(['b', 'a'])
    playTrack('c')
    expect(musicSnapshot().queue).toEqual(['a', 'b', 'c'])
    playTrack('a')
    expect(musicSnapshot().queue).toEqual(['a', 'b', 'c'])
  })
})
