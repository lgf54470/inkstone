import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearApiMemoryCache } from '../../lib/api'
import type { BlogMusicTrack } from '../../lib/types'
import MusicFloatingPlayer from './MusicFloatingPlayer'
import { loadMusicLibrary } from './music-player'

function track(overrides: Partial<BlogMusicTrack> = {}): BlogMusicTrack {
  const id = overrides.id ?? 'a'
  return {
    id,
    title: 'Moonlight',
    artist: 'Hu Yanbin',
    album: 'Album One',
    durationMs: 200_000,
    lyric: null,
    coverUrl: `https://api.test/api/blog/public/music/tracks/${id}/cover`,
    streamUrl: `https://api.test/api/blog/public/music/tracks/${id}/stream`,
    tagIds: [],
    createdAt: 1,
    ...overrides,
  }
}

function stubLibrary(): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    enabled: true,
    tracks: [track({ id: 'a' })],
    tags: [],
    queue: { ids: ['a'], currentId: 'a' },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  clearApiMemoryCache()
})

describe('collapsed badge markup', () => {
  it('keeps the cover from starting a native drag that would swallow pointer events', async () => {
    stubLibrary()
    await loadMusicLibrary(true)
    const html = renderToStaticMarkup(createElement(MusicFloatingPlayer, { locale: 'zh-CN' }))
    expect(html).toContain('aria-label="展开播放器"')
    expect(html).toContain('data-drag-root')
    expect(html).toContain('draggable="false"')
  })
})
