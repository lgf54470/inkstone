import { describe, expect, it } from 'vitest'
import type { MusicPlaylistDetail, MusicTag, MusicTrack } from '@shared/types'
import {
  activeLyricIndex, collectTagIds, computeNextIndex, computePrevIndex, flattenTags,
  barMore, defaultViewMode, hubColumnsWide, isArtistSuffixedTitle, listDensity, nextPlayMode, parseLyric, playlistCoverUrl, rangeIds, tagColorValue, toolbarShape,
  MUSIC_HUB_COLUMNS_MIN_WIDTH, MUSIC_LIST_FULL_MIN_WIDTH,
} from './music-utils'

function tag(id: string, parentId: string | null, name = id, isPinned = false): MusicTag {
  return { id, name, color: null, parentId, isPinned, sortOrder: 0, createdAt: 0 }
}

// FB-U2 / FB-R3: one decision serves the width squeeze and the height squeeze, so the two cannot
// disagree about how much of the row folds. The widths below are the content boxes a hub centre
// column really gets, measured in the running app: 686 on a 1440px screen, 662 on a 1280px one, 928
// with the hub maximised, 1408 with it maximised on a 1920px screen.
describe('hub toolbar shape (FB-U2 / FB-R3)', () => {
  it('keeps everything inline on a wide, tall container', () => {
    // A maximised hub gets this much only on a 1920px screen, and the inline row measures 1357px
    // there — the number the old 1040 threshold was unfolding at.
    expect(toolbarShape({ containerWidth: 1408, viewportWide: true, shortViewport: false }))
      .toEqual({ folded: false, compact: false, stacked: false, hoisted: false })
  })

  it('keeps the labels and folds the low-frequency actions on a maximised hub', () => {
    // 928: the labelled actions row measures 883 with the refresh and the "more" menu on it, so it
    // fits with the tail on its own row and the search takes the row above.
    expect(toolbarShape({ containerWidth: 928, viewportWide: true, shortViewport: false }))
      .toEqual({ folded: true, compact: false, stacked: false, hoisted: false })
  })

  it('drops the labels and hoists the tail on the centre column of a desktop hub', () => {
    // FB2-U2: 686px — the hub's own centre column on a 1440px screen (1240 hub − sidebar 224 − now
    // playing 256 − the row's 32px of padding). Neither the labelled row (819) nor the labelled row
    // with the tail (883) fits, so the flows keep their names without their labels and the tail rides
    // the search's row, which the search grows to fill. The layout this replaces wrapped into a third
    // row carrying those two icons and 630px of nothing.
    expect(toolbarShape({ containerWidth: 686, viewportWide: true, shortViewport: false }))
      .toEqual({ folded: true, compact: true, stacked: false, hoisted: true })
  })

  it('stacks the search and compacts the controls on a phone-width container', () => {
    expect(toolbarShape({ containerWidth: 360, viewportWide: false, shortViewport: false }))
      .toEqual({ folded: true, compact: true, stacked: true, hoisted: false })
  })

  it('compacts without stacking when a wide container is short on height', () => {
    // The height squeeze is answered by dropping the controls' labels and the inline sort, not by
    // spending another row: this container has the width to keep its row in one line.
    expect(toolbarShape({ containerWidth: 1180, viewportWide: true, shortViewport: true }))
      .toEqual({ folded: true, compact: true, stacked: false, hoisted: false })
  })

  it('stacks a phone-width container whether or not the viewport is short', () => {
    // Measured the other way round first: not stacking a narrow-and-short container left the search,
    // two dropdowns, six named controls and the refresh to wrap into four lines — the height answer
    // spending the very height it exists to save.
    expect(toolbarShape({ containerWidth: 360, viewportWide: false, shortViewport: true }))
      .toEqual({ folded: true, compact: true, stacked: true, hoisted: false })
  })
})

// FB2-U2: the same planner read as thresholds — each step is taken at the width the row it spends
// really needs, so no shape asks for room its own plan has already refused, and the width answer is
// never guessed when nothing can be measured.
describe('hub toolbar shape thresholds (FB2-U2)', () => {
  it('drops the labels before it leaves a row with nothing room for them', () => {
    // 819 measured for the five labelled flows plus the sort segments in the wider locale: the row
    // they need of their own, rounded up to 840.
    expect(toolbarShape({ containerWidth: 839, viewportWide: true, shortViewport: false }).compact).toBe(true)
    expect(toolbarShape({ containerWidth: 840, viewportWide: true, shortViewport: false }).compact).toBe(false)
  })

  it('stops hoisting once the actions row has the room to carry its own tail', () => {
    // 883 measured for that row: five labelled flows, the sort segments, the refresh and the menu.
    expect(toolbarShape({ containerWidth: 899, viewportWide: true, shortViewport: false }).hoisted).toBe(true)
    expect(toolbarShape({ containerWidth: 900, viewportWide: true, shortViewport: false }).hoisted).toBe(false)
  })

  it('keeps the low-frequency actions inline only once their whole row fits', () => {
    // 1357 measured for that row with the six import / metadata / health controls back on it, so a
    // fold that ended at 1040 was unfolding into a row that then wrapped into a third one.
    expect(toolbarShape({ containerWidth: 1399, viewportWide: true, shortViewport: false }).folded).toBe(true)
    expect(toolbarShape({ containerWidth: 1400, viewportWide: true, shortViewport: false }).folded).toBe(false)
  })

  it('never stacks without compacting, nor compacts without folding', () => {
    // Each step is a row this planner is allowed to spend, and spending a later one without the
    // earlier one would mean a shape asking for room its own plan has already refused.
    for (const width of [240, 360, 559, 560, 686, 839, 840, 899, 900, 928, 1399, 1408, 1600]) {
      const shape = toolbarShape({ containerWidth: width, viewportWide: true, shortViewport: false })
      expect([width, shape.stacked && !shape.compact, shape.compact && !shape.folded]).toEqual([width, false, false])
    }
  })

  it('falls back to the viewport only when nothing can be measured', () => {
    // No ResizeObserver (jsdom, SSR): the viewport read is the sole width there is, and it is read
    // as the *narrow* answer rather than as a wide one — the fallback must not guess a row that fits.
    expect(toolbarShape({ containerWidth: null, viewportWide: true, shortViewport: false })).toEqual({ folded: false, compact: false, stacked: false, hoisted: false })
    expect(toolbarShape({ containerWidth: null, viewportWide: false, shortViewport: false })).toEqual({ folded: true, compact: true, stacked: true, hoisted: false })
  })
})

// FB-U3: the bar hides the pin below xl and the equalizer below lg, and hidden by CSS is unreachable,
// not degraded. The entry that answers for them carries exactly what is hidden at the width it is
// drawn at — and nothing at all when nothing is, because an entry onto an empty panel is worse than
// no entry.
describe('status bar more entry (FB-U3)', () => {
  it('carries both controls at a width that hides both', () => {
    expect(barMore({ eqInline: false, pinInline: false })).toEqual({ pin: true, eq: true })
  })

  it('carries only the pin once the equalizer is inline again', () => {
    expect(barMore({ eqInline: true, pinInline: false })).toEqual({ pin: true, eq: false })
  })

  it('is not drawn at all where nothing is hidden', () => {
    expect(barMore({ eqInline: true, pinInline: true })).toBeNull()
  })
})

// FB-R2: the hub's side columns are 480px of fixed width, and whether they fit is a fact about the
// box the hub was given rather than about the screen behind it. The hub can be dragged narrow on a
// wide screen — the viewport never changes while it is, and the columns kept squeezing the list.
// The viewport read stays only for environments that cannot measure a box at all (jsdom, SSR).
describe('hub side columns (FB-R2)', () => {
  it('answers the width of the hub, not the width of the viewport', () => {
    expect(hubColumnsWide({ containerWidth: 700, viewportWide: true })).toBe(false)
    expect(hubColumnsWide({ containerWidth: 1200, viewportWide: false })).toBe(true)
  })

  it('folds exactly below the breakpoint the immersive player folds at', () => {
    expect(hubColumnsWide({ containerWidth: MUSIC_HUB_COLUMNS_MIN_WIDTH - 1, viewportWide: true })).toBe(false)
    expect(hubColumnsWide({ containerWidth: MUSIC_HUB_COLUMNS_MIN_WIDTH, viewportWide: false })).toBe(true)
  })

  it('reads the viewport only where nothing can be measured', () => {
    expect(hubColumnsWide({ containerWidth: null, viewportWide: true })).toBe(true)
    expect(hubColumnsWide({ containerWidth: null, viewportWide: false })).toBe(false)
  })
})

// FB-U4: the table's artist / album / source columns were CSS media queries read against the
// viewport, so a maximised hub and a windowed one on the same screen disagreed about a column whose
// room is decided by the centre column they both live in. The density is that column's own answer,
// and the viewport is only the pre-measurement guess (and all jsdom has).
describe('list density (FB-U4)', () => {
  it('answers the centre column, not the screen behind it', () => {
    expect(listDensity({ containerWidth: 700, viewportWide: true })).toBe('compact')
    expect(listDensity({ containerWidth: 1200, viewportWide: false })).toBe('full')
  })

  it('draws the full row exactly from the shared breakpoint up', () => {
    expect(listDensity({ containerWidth: MUSIC_LIST_FULL_MIN_WIDTH - 1, viewportWide: true })).toBe('compact')
    expect(listDensity({ containerWidth: MUSIC_LIST_FULL_MIN_WIDTH, viewportWide: false })).toBe('full')
  })

  it('falls back to the viewport where nothing can be measured', () => {
    expect(listDensity({ containerWidth: null, viewportWide: true })).toBe('full')
    expect(listDensity({ containerWidth: null, viewportWide: false })).toBe('compact')
  })
})

// FB-R1: the narrow default is a policy about a list that has not been asked yet — covers where the
// columns would fold, rows where they fit. It is the inverse of the density, and the hub stops
// applying it the moment the reader picks a view for themselves.
describe('narrow default view (FB-R1)', () => {
  it('answers a narrow list with covers', () => {
    expect(defaultViewMode('compact')).toBe('grid')
  })

  it('keeps rows where the columns fit', () => {
    expect(defaultViewMode('full')).toBe('list')
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

describe('lyric translation merging (FEA-C3)', () => {
  it('merges a same-timestamp follower as the translation', () => {
    const lines = parseLyric('[00:10.000]Hello\n[00:10.000]Bonjour')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('Hello')
    expect(lines[0]?.translation).toBe('Bonjour')
  })

  it('merges near-timestamp pairs but keeps lines a beat apart separate', () => {
    const near = parseLyric('[00:10.000]Hello\n[00:10.400]Bonjour')
    expect(near).toHaveLength(1)
    expect(near[0]?.translation).toBe('Bonjour')
    const apart = parseLyric('[00:10.000]Hello\n[00:11.200]Bonjour')
    expect(apart.map((line) => line.text)).toEqual(['Hello', 'Bonjour'])
    expect(apart[0]?.translation).toBeUndefined()
  })

  it('absorbs an identical repeat without making it a translation', () => {
    const lines = parseLyric('[00:10.000]La\n[00:10.200]La')
    expect(lines).toHaveLength(1)
    expect(lines[0]?.text).toBe('La')
    expect(lines[0]?.translation).toBeUndefined()
  })

  it('only absorbs one follower per line', () => {
    const lines = parseLyric('[00:10.000]A\n[00:10.100]A2\n[00:10.200]B')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ text: 'A', translation: 'A2' })
    expect(lines[1]?.text).toBe('B')
    expect(lines[1]?.translation).toBeUndefined()
  })
})
