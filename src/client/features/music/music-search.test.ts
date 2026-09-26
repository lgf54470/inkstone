import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { buildSearchIndex, ensureRomanized, needsRomanization, rankTracks, ROMANIZATION_BATCH, searchTracks } from './music-search'

function track(id: string, title: string, artist = '', album = ''): MusicTrack {
  return {
    id, title, artist, album, durationMs: 0, source: 'r2', format: 'mp3', webdavPath: null, mime: 'audio/mpeg',
    sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false, tagIds: [], isFavorite: false, isPinned: false,
    playCount: 0, lastPlayedAt: null, contentHash: null, createdAt: 0, updatedAt: 0,
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

// A track whose title read is counted, because reading the title is exactly the work the index
// does: if a fresh query pays for it again, the haystack was rebuilt from the library.
function countedTrack(id: string, title: string, onRead: () => void): MusicTrack {
  const base = track(id, title)
  return {
    ...base,
    get title() {
      onRead()
      return title
    },
  }
}

describe('search index reuse', () => {
  it('builds the haystacks once per library instead of once per keystroke', () => {
    const reads: string[] = []
    const tracks = [countedTrack('1', 'Moonlight', () => reads.push('title'))]
    const romanized = {}

    expect(searchTracks(tracks, romanized, 'moon')).toEqual(['1'])
    expect(searchTracks(tracks, romanized, 'moonl')).toEqual(['1'])

    expect(reads).toHaveLength(1)
  })

  it('answers the same query again without ranking it twice', () => {
    const tracks = [countedTrack('2', 'Tian Xing', () => {})]
    const romanized = {}

    const first = searchTracks(tracks, romanized, 'tian')
    const second = searchTracks(tracks, romanized, 'tian')

    expect(second).toBe(first)
  })

  it('rebuilds once the romanization for the library arrives', () => {
    const reads: string[] = []
    const tracks = [countedTrack('3', '月光', () => reads.push('title'))]

    searchTracks(tracks, {}, 'yueguang')
    searchTracks(tracks, { '3': 'yueguang yuegg' }, 'yueguang')

    expect(reads).toHaveLength(2)
  })
})

describe('ensureRomanized batching', () => {
  it('publishes each bounded batch to the caller as it completes', async () => {
    const total = ROMANIZATION_BATCH * 2 + 50
    const texts = Object.fromEntries(
      Array.from({ length: total }, (_, index) => [`t${index}`, '月光'])
    )
    const sizes: number[] = []

    const result = await ensureRomanized(texts, {}, (partial) => { sizes.push(Object.keys(partial).length) })

    expect(sizes).toEqual([ROMANIZATION_BATCH, ROMANIZATION_BATCH * 2, total])
    expect(Object.keys(result)).toHaveLength(total)
  })

  it('yields the event loop between romanization batches', async () => {
    let yielded = false
    setTimeout(() => { yielded = true }, 0)
    const texts = Object.fromEntries(
      Array.from({ length: ROMANIZATION_BATCH * 2 }, (_, index) => [`t${index}`, '月光'])
    )

    await ensureRomanized(texts, {})

    expect(yielded).toBe(true)
  })
})

describe('search beyond the name (F-10)', () => {
  function taggedTrack(id: string, title: string, tagIds: string[], lyric: string | null = null): MusicTrack {
    return { ...track(id, title), tagIds, lyric, hasLyric: Boolean(lyric) }
  }

  const TAGS = [
    { id: 'tg1', name: 'rock', color: null, parentId: null, isPinned: false, sortOrder: 0, createdAt: 0 },
    { id: 'tg2', name: 'live', color: null, parentId: 'tg1', isPinned: false, sortOrder: 1, createdAt: 0 },
  ]

  const TAGGED = [
    taggedTrack('a', 'Alpha', ['tg1']),
    taggedTrack('b', 'Beta', ['tg2']),
    taggedTrack('c', 'Gamma', [], 'walking in the rain tonight'),
  ]

  it('finds a track by the tag shown on its pill, path included', () => {
    expect(searchTracks(TAGGED, {}, 'rock', TAGS)).toEqual(['a', 'b'])
    expect(searchTracks(TAGGED, {}, 'rock/live', TAGS)).toEqual(['b'])
  })

  it('finds a track by a phrase in its lyric', () => {
    expect(searchTracks(TAGGED, {}, 'in the rain', TAGS)).toEqual(['c'])
  })

  it('keeps lyric hits behind every name hit', () => {
    const rows = [
      { ...taggedTrack('rain-song', 'Rain Song', [], 'nothing here') },
      { ...taggedTrack('other', 'Other', [], 'singing in the rain') },
    ]
    expect(searchTracks(rows, {}, 'rain', [])).toEqual(['rain-song', 'other'])
  })

  it('does not walk whole lyrics for a query that short', () => {
    expect(searchTracks(TAGGED, {}, 'ra', TAGS)).toEqual([])
  })

  it('never leaks a track whose tags are unknown', () => {
    expect(searchTracks([taggedTrack('x', 'Solo', ['missing'])], {}, 'rock', TAGS)).toEqual([])
  })
})
