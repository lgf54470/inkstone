import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { duplicateTracks, duplicateWastedBytes, findDuplicateGroups, redundantTrackCount } from './music-duplicates'

function hashedTrack(id: string, contentHash: string | null, sizeBytes = 10, createdAt = 1): MusicTrack {
  return {
    id, title: id, artist: '', album: '', durationMs: 0, source: 'r2', format: 'mp3', webdavPath: null,
    mime: 'audio/mpeg', sizeBytes, coverUrl: null, lyric: null, hasLyric: false, tagIds: [],
    isFavorite: false, isPinned: false, playCount: 0, lastPlayedAt: null, contentHash, createdAt, updatedAt: createdAt,
  }
}

describe('duplicate groups from upload checksums (M-53)', () => {
  it('groups byte-identical tracks and orders each group oldest first', () => {
    const tracks = [
      hashedTrack('new-copy', 'a', 10, 3),
      hashedTrack('original', 'a', 10, 1),
      hashedTrack('middle', 'a', 10, 2),
    ]
    const groups = findDuplicateGroups(tracks)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tracks.map((track) => track.id)).toEqual(['original', 'middle', 'new-copy'])
  })

  it('ignores unique files and unhashed rows', () => {
    const tracks = [
      hashedTrack('solo', 'a'),
      hashedTrack('legacy before hashing', null),
      hashedTrack('other legacy', null),
    ]
    expect(findDuplicateGroups(tracks)).toEqual([])
  })

  it('counts only the extra copies and the bytes they waste', () => {
    const tracks = [
      hashedTrack('keep-1', 'a', 100, 1),
      hashedTrack('extra-1', 'a', 100, 2),
      hashedTrack('extra-2', 'a', 100, 3),
      hashedTrack('keep-2', 'b', 50, 4),
      hashedTrack('extra-3', 'b', 50, 5),
    ]
    expect(redundantTrackCount(tracks)).toBe(3)
    // The oldest copy per group is not wasted; only the extras count.
    expect(duplicateWastedBytes(tracks)).toBe(250)
  })

  it('lists every group member for the duplicates view', () => {
    const tracks = [
      hashedTrack('solo', 'c'),
      hashedTrack('pair-a', 'a', 10, 1),
      hashedTrack('pair-b', 'a', 10, 2),
    ]
    expect(duplicateTracks(tracks).map((track) => track.id)).toEqual(['pair-a', 'pair-b'])
  })

  it('puts the group that wastes the most space first', () => {
    const tracks = [
      hashedTrack('small-keep', 'a', 10, 1),
      hashedTrack('small-extra', 'a', 10, 2),
      hashedTrack('big-keep', 'b', 1000, 3),
      hashedTrack('big-extra', 'b', 1000, 4),
    ]
    const groups = findDuplicateGroups(tracks)
    expect(groups.map((group) => group.key)).toEqual(['b', 'a'])
  })
})

function looseTrack(id: string, options: { title?: string; artist?: string; durationMs?: number; sizeBytes?: number; createdAt?: number } = {}): MusicTrack {
  return {
    ...hashedTrack(id, null, options.sizeBytes ?? 10, options.createdAt ?? 1),
    title: options.title ?? id,
    artist: options.artist ?? '',
    durationMs: options.durationMs ?? 0,
  }
}

// Rows without a checksum get an approximation instead of never grouping: same
// title and artist with a duration that agrees within the tolerance.
describe('approximate groups for unhashed rows (M-53)', () => {
  it('groups WebDAV-style rows that agree on title, artist and duration', () => {
    const tracks = [
      looseTrack('webdav-copy', { title: 'Moonlight', artist: 'Hu Yanbin', durationMs: 100_000, createdAt: 2 }),
      looseTrack('webdav-original', { title: 'Moonlight', artist: 'Hu Yanbin', durationMs: 100_000, createdAt: 1 }),
    ]
    const groups = findDuplicateGroups(tracks)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.kind).toBe('approximate')
    expect(groups[0]!.tracks.map((track) => track.id)).toEqual(['webdav-original', 'webdav-copy'])
    expect(groups[0]!.wastedBytes).toBe(10)
  })

  it('clusters by duration chains and leaves far-apart rows alone', () => {
    const tracks = [
      looseTrack('near', { title: 'Same Song', artist: 'Same Artist', durationMs: 100_000, createdAt: 1 }),
      looseTrack('close', { title: 'Same Song', artist: 'Same Artist', durationMs: 101_500, createdAt: 2 }),
      looseTrack('far', { title: 'Same Song', artist: 'Same Artist', durationMs: 103_000 }),
    ]
    const groups = findDuplicateGroups(tracks)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.tracks.map((track) => track.id)).toEqual(['near', 'close'])
  })

  it('separates rows whose artist or title differs and never mixes checksummed rows in', () => {
    const tracks = [
      looseTrack('live-cut', { title: 'Moonlight', artist: 'Hu Yanbin', durationMs: 100_000 }),
      looseTrack('cover-cut', { title: 'Moonlight', artist: 'A Cover Artist', durationMs: 100_000 }),
      hashedTrack('rip', 'a', 10, 1),
    ]
    const hashed = { ...hashedTrack('rip', 'a'), title: 'Moonlight', artist: 'Hu Yanbin', durationMs: 100_000 }
    const groups = findDuplicateGroups([tracks[0]!, tracks[1]!, hashed])
    expect(groups).toEqual([])
  })

  it('does not guess from unknown durations or blank titles', () => {
    const tracks = [
      looseTrack('mystery-a', { durationMs: 0 }),
      looseTrack('mystery-b', { durationMs: 0 }),
      looseTrack('blank-a', { title: '  ', durationMs: 50_000 }),
      looseTrack('blank-b', { title: '  ', durationMs: 50_000 }),
    ]
    expect(findDuplicateGroups(tracks)).toEqual([])
  })

})

describe('approximate groups in the summary numbers (M-53)', () => {
  it('folds approximate extras into the summary numbers', () => {
    const tracks = [
      looseTrack('a-original', { title: 'Song', artist: 'Artist', durationMs: 60_000, sizeBytes: 100, createdAt: 1 }),
      looseTrack('a-extra', { title: 'Song', artist: 'Artist', durationMs: 60_000, sizeBytes: 100, createdAt: 2 }),
    ]
    expect(redundantTrackCount(tracks)).toBe(1)
    expect(duplicateWastedBytes(tracks)).toBe(100)
    expect(duplicateTracks(tracks).map((track) => track.id)).toEqual(['a-original', 'a-extra'])
  })

  it('ranks exact and approximate groups by the bytes they waste', () => {
    const tracks = [
      looseTrack('small-a', { title: 'Song', artist: 'Artist', durationMs: 60_000, sizeBytes: 10, createdAt: 1 }),
      looseTrack('small-b', { title: 'Song', artist: 'Artist', durationMs: 60_000, sizeBytes: 10, createdAt: 2 }),
      hashedTrack('big-a', 'h', 1000, 1),
      hashedTrack('big-b', 'h', 1000, 2),
    ]
    const groups = findDuplicateGroups(tracks)
    expect(groups.map((group) => group.kind)).toEqual(['exact', 'approximate'])
  })
})
