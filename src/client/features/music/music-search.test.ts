import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { buildSearchIndex, ensureRomanized, needsRomanization, rankTracks } from './music-search'

function track(id: string, title: string, artist = '', album = ''): MusicTrack {
  return {
    id, title, artist, album, durationMs: 0, source: 'r2', objectKey: `music/${id}.mp3`, mime: 'audio/mpeg',
    sizeBytes: 0, coverUrl: null, lyric: null, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, createdAt: 0, updatedAt: 0,
  }
}

const LIBRARY = [
  track('1', 'Moonlight', 'Hu Yanbin', 'Tale'),
  track('2', 'Tian Xing Jiu Ge', 'Huo Zun'),
  track('3', 'Qiu Shui Yi Ren', 'Wei Xiaohan'),
]

describe('music search', () => {
  it('only asks for romanization when the query has latin letters', () => {
    expect(needsRomanization('moon')).toBe(true)
    expect(needsRomanization('MJ')).toBe(true)
    expect(needsRomanization('1234')).toBe(false)
  })

  it('ranks literal matches, including fuzzy subsequences', () => {
    const index = buildSearchIndex(LIBRARY, {})
    expect(rankTracks(index, 'moonlight')[0]).toBe('1')
    expect(rankTracks(index, 'huo')[0]).toBe('2')
    expect(rankTracks(index, 'mgh')).toContain('1')
    expect(rankTracks(index, '')).toHaveLength(3)
    expect(rankTracks(index, 'zzzz')).toEqual([])
  })

  it('finds a track by full pinyin, by initials and by hanzi', async () => {
    const chinese = [
      track('a', '天行九歌', '霍尊'),
      track('b', '月光', '胡彦斌'),
      track('c', '心之逆鳞', '魏小涵'),
    ]
    const romanized = await ensureRomanized(
      Object.fromEntries(chinese.map((entry) => [entry.id, `${entry.title} ${entry.artist}`])),
      {},
    )
    const index = buildSearchIndex(chinese, romanized)

    expect(rankTracks(index, 'tianxingjiuge')[0]).toBe('a')
    expect(rankTracks(index, 'txjg')[0]).toBe('a')
    expect(rankTracks(index, 'yueguang')[0]).toBe('b')
    expect(rankTracks(index, 'xinzhinilin')[0]).toBe('c')
    expect(rankTracks(index, '霍尊')[0]).toBe('a')
  })

  it('reuses already-romanized entries instead of recomputing them', async () => {
    const preset = { cached: 'anything' }
    const result = await ensureRomanized({ cached: '月光' }, preset)
    expect(result).toBe(preset)

    const missing = await ensureRomanized({ fresh: '月光' }, preset)
    expect(missing).not.toBe(preset)
    expect(missing.cached).toBe('anything')
    expect(missing.fresh).toBeTruthy()
  })
})
