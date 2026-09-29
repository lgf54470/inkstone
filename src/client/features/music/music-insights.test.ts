import { describe, expect, it } from 'vitest'
import type { MusicTag, MusicTrack } from '@shared/types'
import { buildInsights, hasListening, weekStart } from './music-insights'

function track(id: string, overrides: Partial<MusicTrack> = {}): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 60_000, source: 'r2', format: 'mp3',
    webdavPath: null, mime: 'audio/mpeg', sizeBytes: 0, coverUrl: null, lyric: null, hasLyric: false,
    tagIds: [], isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash: null,
    createdAt: 0, updatedAt: 0,
    ...overrides,
  } as MusicTrack
}

function tag(id: string, name: string): MusicTag {
  return { id, name, color: null, parentId: null } as MusicTag
}

// Local time throughout: the bucket edge is the reader's Monday, not UTC's.
const monday = new Date(2026, 8, 21, 9, 0, 0).getTime()
const nextMonday = new Date(2026, 8, 28, 9, 0, 0).getTime()

describe('week buckets follow the reader calendar', () => {
  it('puts a Sunday evening and the next Monday morning in different weeks', () => {
    const sunday = new Date(2026, 8, 27, 23, 30, 0).getTime()
    expect(weekStart(sunday)).not.toBe(weekStart(nextMonday))
    expect(weekStart(sunday)).toBe(weekStart(monday))
  })

  it('gives every moment of one week the same start, at local midnight', () => {
    const start = weekStart(monday)
    const edge = new Date(start)
    expect([edge.getHours(), edge.getMinutes(), edge.getSeconds(), edge.getMilliseconds()]).toEqual([0, 0, 0, 0])
    expect(weekStart(new Date(2026, 8, 21, 23, 59, 59).getTime())).toBe(start)
    expect(weekStart(new Date(2026, 8, 22, 0, 0, 1).getTime())).toBe(start)
  })
})

describe('totals', () => {
  it('counts what has been played apart from what never has, and prices the listening', () => {
    const insights = buildInsights([
      track('a', { playCount: 3, lastPlayedAt: monday }),
      track('b', { playCount: 1, durationMs: 30_000 }),
      track('c'),
    ], [])
    expect(insights.totals).toEqual({
      tracks: 3, played: 2, neverPlayed: 1, plays: 4, listenedMs: 60_000 * 3 + 30_000, libraryMs: 150_000,
    })
  })

  // A track whose length is still unknown contributes to the play count but not to "time listened":
  // multiplying by zero would quietly report a play as silence.
  it('does not price a play of a track whose length is unknown', () => {
    const insights = buildInsights([track('a', { playCount: 2, durationMs: 0 })], [])
    expect(insights.totals.plays).toBe(2)
    expect(insights.totals.listenedMs).toBe(0)
  })

  it('has nothing to say about a library nobody has played', () => {
    expect(hasListening(buildInsights([track('a'), track('b')], []))).toBe(false)
    expect(hasListening(buildInsights([track('a', { playCount: 1 })], []))).toBe(true)
  })
})

describe('rankings', () => {
  it('orders artists by plays and breaks a tie on the name, not on insertion order', () => {
    const insights = buildInsights([
      track('1', { artist: 'Zed', playCount: 2 }),
      track('2', { artist: 'Alpha', playCount: 2 }),
      track('3', { artist: 'Beta', playCount: 5 }),
    ], [])
    expect(insights.artists.map((entry) => entry.label)).toEqual(['Beta', 'Alpha', 'Zed'])
    expect(insights.artists[0]).toEqual({ key: 'artist:Beta', label: 'Beta', trackCount: 1, playCount: 5, listenedMs: 300_000 })
  })

  it('groups by the tags a track carries, and skips an id no tag answers to', () => {
    const insights = buildInsights([
      track('1', { tagIds: ['t1', 'ghost'], playCount: 4 }),
      track('2', { tagIds: ['t1'] }),
      track('3', { tagIds: ['t2'], playCount: 1 }),
    ], [tag('t1', 'rock'), tag('t2', 'jazz')])
    expect(insights.tags.map((entry) => [entry.label, entry.playCount])).toEqual([['rock', 4], ['jazz', 1]])
    expect(insights.tags[0]?.trackCount).toBe(2)
  })

  it('ranks only played tracks, longest-listened first, and keeps the requested length', () => {
    const insights = buildInsights([
      track('a', { playCount: 1 }),
      track('b', { playCount: 9 }),
      track('c', { playCount: 4 }),
      track('never'),
    ], [], { top: 2 })
    expect(insights.tracks.map((entry) => entry.label)).toEqual(['b', 'c'])
    expect(insights.tracks[0]?.listenedMs).toBe(540_000)
  })
})

describe('weekly buckets', () => {
  it('places each track in the week of its last play, newest first, and leaves unplayed ones out', () => {
    const insights = buildInsights([
      track('old', { playCount: 2, lastPlayedAt: monday }),
      track('new', { playCount: 1, lastPlayedAt: nextMonday }),
      track('never'),
    ], [])
    expect(insights.weeks).toHaveLength(2)
    expect(insights.weeks[0]?.at).toBeGreaterThan(insights.weeks[1]?.at ?? 0)
    expect(insights.weeks[0]?.trackCount).toBe(1)
    expect(insights.weeks[1]?.playCount).toBe(2)
  })

  it('keeps only the requested number of weeks', () => {
    const insights = buildInsights([
      track('1', { lastPlayedAt: monday }),
      track('2', { lastPlayedAt: nextMonday }),
      track('3', { lastPlayedAt: new Date(2026, 8, 7, 12).getTime() }),
    ], [], { weeks: 2 })
    expect(insights.weeks).toHaveLength(2)
    expect(insights.weeks[0]?.at).toBe(weekStart(nextMonday))
  })
})
