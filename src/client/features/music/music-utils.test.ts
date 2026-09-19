import { describe, expect, it } from 'vitest'
import type { MusicPlaylistDetail, MusicTag, MusicTrack } from '@shared/types'
import {
  activeLyricIndex, collectTagIds, computeNextIndex, computePrevIndex, flattenTags,
  formatBytes, formatDuration, formatTotalDuration, isArtistSuffixedTitle, nextPlayMode, parseLyric,
  playlistCoverUrl, rangeIds, tagColorValue,
} from './music-utils'

function tag(id: string, parentId: string | null, name = id, isPinned = false): MusicTag {
  return { id, name, color: null, parentId, isPinned, sortOrder: 0, createdAt: 0 }
}

describe('music duration formatting', () => {
  it('formats milliseconds as mm:ss and degrades gracefully', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(Number.NaN)).toBe('00:00')
    expect(formatDuration(59_999)).toBe('00:59')
    expect(formatDuration(60_000)).toBe('01:00')
    expect(formatDuration(3_723_000)).toBe('62:03')
  })

  it('summarizes a library duration in hours and minutes', () => {
    expect(formatTotalDuration(0)).toBe('0')
    expect(formatTotalDuration(30 * 60_000)).toBe('30 min')
    expect(formatTotalDuration(90 * 60_000)).toBe('1 h 30 min')
  })

  it('formats byte sizes across unit boundaries', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB')
  })
})

describe('music play mode cycling', () => {
  it('cycles order -> repeat-all -> repeat-one -> shuffle', () => {
    expect(nextPlayMode('order')).toBe('repeat-all')
    expect(nextPlayMode('repeat-all')).toBe('repeat-one')
    expect(nextPlayMode('repeat-one')).toBe('shuffle')
    expect(nextPlayMode('shuffle')).toBe('order')
  })

  it('advances, wraps and stops according to the mode', () => {
    expect(computeNextIndex(0, 3, 'order')).toBe(1)
    expect(computeNextIndex(2, 3, 'order')).toBe(-1)
    expect(computeNextIndex(2, 3, 'repeat-all')).toBe(0)
    expect(computeNextIndex(1, 3, 'repeat-one')).toBe(1)
    expect(computeNextIndex(0, 0, 'order')).toBe(-1)
  })

  it('walks backwards with the same wrap rules', () => {
    expect(computePrevIndex(1, 3, 'order')).toBe(0)
    expect(computePrevIndex(0, 3, 'order')).toBe(0)
    expect(computePrevIndex(0, 3, 'repeat-all')).toBe(2)
  })

  it('never returns the current slot when shuffling more than one track', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const next = computeNextIndex(2, 5, 'shuffle')
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(5)
      expect(next).not.toBe(2)
    }
    expect(computeNextIndex(0, 1, 'shuffle')).toBe(0)
  })
})

describe('lrc parsing', () => {
  it('parses multi-timestamp lines into a sorted timeline', () => {
    const lines = parseLyric('[00:05.00]second\n[00:01.50][00:03.000]first\nnoise')
    expect(lines.map((line) => line.text)).toEqual(['first', 'first', 'second'])
    expect(lines.map((line) => line.timeMs)).toEqual([1500, 3000, 5000])
  })

  it('returns nothing for empty or timestamp-free input', () => {
    expect(parseLyric(null)).toEqual([])
    expect(parseLyric('just prose')).toEqual([])
  })

  it('finds the active line with a binary search', () => {
    const lines = parseLyric('[00:01.00]a\n[00:02.00]b\n[00:03.00]c')
    expect(activeLyricIndex(lines, 0)).toBe(-1)
    expect(activeLyricIndex(lines, 1000)).toBe(0)
    expect(activeLyricIndex(lines, 2500)).toBe(1)
    expect(activeLyricIndex(lines, 99_000)).toBe(2)
    expect(activeLyricIndex([], 1000)).toBe(-1)
  })
})

describe('rangeIds', () => {
  const order = ['a', 'b', 'c', 'd']

  it('returns the inclusive slice in both directions', () => {
    expect(rangeIds(order, 'a', 'c')).toEqual(['a', 'b', 'c'])
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(order, 'b', 'b')).toEqual(['b'])
  })

  it('falls back to the clicked row when the anchor is gone', () => {
    expect(rangeIds(order, 'missing', 'c')).toEqual(['c'])
    expect(rangeIds(order, 'a', 'missing')).toEqual([])
  })
})

describe('isArtistSuffixedTitle', () => {
  it('accepts a file name that only adds the artist to the tag title', () => {
    expect(isArtistSuffixedTitle('Moonlight - Hu Yanbin', 'Moonlight', 'Hu Yanbin')).toBe(true)
    expect(isArtistSuffixedTitle('Moonlight-Hu Yanbin', 'Moonlight', 'Hu Yanbin')).toBe(true)
    expect(isArtistSuffixedTitle('Moonlight - Hu Yanbin', 'Moonlight', '')).toBe(true)
  })

  it('leaves manually edited names and unrelated files alone', () => {
    expect(isArtistSuffixedTitle('Moonlight', 'Moonlight', 'Hu Yanbin')).toBe(false)
    expect(isArtistSuffixedTitle('Moonlight (Live)', 'Moonlight', 'Hu Yanbin')).toBe(false)
    expect(isArtistSuffixedTitle('Moonlight - Someone Else', 'Moonlight', 'Hu Yanbin')).toBe(false)
    expect(isArtistSuffixedTitle('Other Song - Hu Yanbin', 'Moonlight', 'Hu Yanbin')).toBe(false)
  })
})

describe('tag tree helpers', () => {
  it('collects a tag together with every descendant', () => {
    const tags = [tag('a', null), tag('b', 'a'), tag('c', 'b'), tag('d', null)]
    expect([...collectTagIds('a', tags)].sort()).toEqual(['a', 'b', 'c'])
    expect([...collectTagIds('d', tags)]).toEqual(['d'])
  })

  it('flattens the forest depth-first with pinned siblings first', () => {
    const flat = flattenTags([tag('b', null, 'beta'), tag('a', null, 'alpha', true), tag('c', 'b', 'child')])
    expect(flat.map((row) => `${row.depth}:${row.tag.id}`)).toEqual(['0:a', '0:b', '1:c'])
    expect(flat[1]!.hasChildren).toBe(true)
    expect(flat[2]!.hasChildren).toBe(false)
  })

  it('treats a tag whose parent disappeared as a root', () => {
    expect(flattenTags([tag('x', 'missing')])).toEqual([{ tag: expect.objectContaining({ id: 'x' }), depth: 0, hasChildren: false }])
  })

  it('maps a stored colour name onto the shared accent palette', () => {
    expect(tagColorValue('indigo')).toMatch(/^oklch/)
    expect(tagColorValue('not-a-colour')).toBe('var(--text-quaternary)')
    expect(tagColorValue(null)).toBe('var(--text-quaternary)')
  })

  it('passes colour literals from the shared palette through unchanged', () => {
    expect(tagColorValue('#ef4444')).toBe('#ef4444')
    expect(tagColorValue('oklch(0.6 0.2 20)')).toBe('oklch(0.6 0.2 20)')
    expect(tagColorValue('#ef4444', 'var(--accent)')).toBe('#ef4444')
  })
})

describe('playlistCoverUrl (M-51)', () => {
  function coverTrack(id: string, coverUrl: string | null): MusicTrack {
    return { id, title: id, coverUrl } as unknown as MusicTrack
  }
  function playlistWith(trackIds: string[]): MusicPlaylistDetail {
    return { items: trackIds.map((trackId, index) => ({ id: `i${index}`, playlistId: 'p', trackId, sortOrder: index })) } as unknown as MusicPlaylistDetail
  }

  it('takes the first item in the manual order that carries a cover', () => {
    const tracks = [coverTrack('a', '/c/a.png'), coverTrack('b', null), coverTrack('c', '/c/c.png')]
    expect(playlistCoverUrl(playlistWith(['b', 'c', 'a']), tracks)).toBe('/c/c.png')
    expect(playlistCoverUrl(playlistWith(['a', 'c']), tracks)).toBe('/c/a.png')
  })

  it('returns null when nothing in the playlist has a cover', () => {
    expect(playlistCoverUrl(playlistWith(['b']), [coverTrack('b', null)])).toBeNull()
    expect(playlistCoverUrl(playlistWith([]), [coverTrack('a', '/c/a.png')])).toBeNull()
  })

  it('ignores item ids that left the library', () => {
    expect(playlistCoverUrl(playlistWith(['gone', 'a']), [coverTrack('a', '/c/a.png')])).toBe('/c/a.png')
    expect(playlistCoverUrl(playlistWith(['gone']), [])).toBeNull()
  })
})
