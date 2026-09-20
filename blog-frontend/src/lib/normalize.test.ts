import { describe, expect, it } from 'vitest'
import { normalizeMusicLibrary } from './normalize'

function body(track: Record<string, unknown>): unknown {
  return {
    enabled: true,
    tracks: [{ id: 'a', title: 'Clip', artist: '', album: '', durationMs: 1000, streamUrl: '/api/stream/a', createdAt: 1, ...track }],
    tags: [],
    queue: { ids: [], currentId: null },
  }
}

describe('normalizeMusicLibrary mime', () => {
  it('keeps the stored mime so a clip reads as a clip', () => {
    const library = normalizeMusicLibrary(body({ mime: 'video/mp4' }))
    expect(library.tracks[0]?.mime).toBe('video/mp4')
  })

  it('reads a missing mime as empty instead of dropping the track', () => {
    const library = normalizeMusicLibrary(body({}))
    expect(library.tracks).toHaveLength(1)
    expect(library.tracks[0]?.mime).toBe('')
  })

  it('reads a non-string mime as empty', () => {
    expect(normalizeMusicLibrary(body({ mime: 42 })).tracks[0]?.mime).toBe('')
  })
})
