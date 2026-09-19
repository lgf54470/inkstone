import { describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { downloadM3u } from './music-export'

function track(overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id: 'track-1', title: 'Moonlight', artist: 'Hu Yanbin', album: '', durationMs: 200_000,
    source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg', sizeBytes: 1, coverUrl: null,
    lyric: null, hasLyric: false, tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 1, updatedAt: 1,
    ...overrides,
  }
}

describe('downloadM3u', () => {
  it('lists playable file names instead of internal storage keys', async () => {
    let captured: Blob | null = null
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        captured = blob
        return 'blob:fake'
      },
      revokeObjectURL: vi.fn(),
    })
    downloadM3u([track({ format: 'flac' }), track({ id: 't2', title: 'Only', artist: '' })], 'playlist')
    const text = await captured!.text()
    expect(text.split('\n')).toEqual([
      '#EXTM3U',
      '#EXTINF:200,Hu Yanbin - Moonlight',
      'Hu Yanbin - Moonlight.flac',
      '#EXTINF:200,Only',
      'Only.mp3',
    ])
    expect(text).not.toContain('music/')
    vi.unstubAllGlobals()
  })
})
