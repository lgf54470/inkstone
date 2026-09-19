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
    expect(groups.map((group) => group.hash)).toEqual(['b', 'a'])
  })
})
