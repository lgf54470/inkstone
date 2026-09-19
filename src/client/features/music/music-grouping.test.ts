import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { buildGroups, groupMatchesQuery, groupScopeOf, parentGroupKind } from './music-grouping'

function track(id: string, artist: string, album: string, coverUrl: string | null = null, durationMs = 100): MusicTrack {
  return { id, title: id, artist, album, coverUrl, durationMs } as MusicTrack
}

describe('buildGroups', () => {
  it('keeps same-titled albums of different artists apart', () => {
    const groups = buildGroups([track('a', 'Ann', 'Fog'), track('b', 'Zoe', 'Fog')], 'albums')
    expect(groups.map((group) => `${group.artist}/${group.name}`)).toEqual(['Ann/Fog', 'Zoe/Fog'])
    expect(new Set(groups.map((group) => group.key)).size).toBe(2)
  })

  it('accumulates track ids and durations per group', () => {
    const groups = buildGroups([track('a', 'Ann', 'Fog', null, 120), track('b', 'Ann', 'Fog', null, 30)], 'albums')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ trackIds: ['a', 'b'], durationMs: 150 })
  })

  it('takes the first non-null cover of the group', () => {
    const groups = buildGroups(
      [track('a', 'Ann', 'Fog'), track('b', 'Ann', 'Fog', '/c/b.png'), track('c', 'Ann', 'Fog', '/c/c.png')],
      'albums',
    )
    expect(groups[0].coverUrl).toBe('/c/b.png')
  })

  it('sinks unnamed groups below everything named', () => {
    const groups = buildGroups([track('x', '', 'Aardvark'), track('y', 'Zoe', ''), track('z', 'Ann', 'Fog')], 'albums')
    expect(groups.map((group) => group.name)).toEqual(['Aardvark', 'Fog', ''])
    const artists = buildGroups([track('x', '', 'A'), track('z', 'Ann', 'B')], 'artists')
    expect(artists.map((group) => group.name)).toEqual(['Ann', ''])
  })

  it('trims tag whitespace so padded values share one group', () => {
    const groups = buildGroups([track('a', ' Ann ', ' Fog '), track('b', 'Ann', 'Fog')], 'albums')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ name: 'Fog', artist: 'Ann', trackIds: ['a', 'b'] })
  })
})

describe('groupMatchesQuery', () => {
  const group = buildGroups([track('a', 'Ann', 'Fog')], 'albums')[0]

  it('matches the album name or the artist, case-insensitively', () => {
    expect(groupMatchesQuery(group, 'fog')).toBe(true)
    expect(groupMatchesQuery(group, 'ANN')).toBe(true)
    expect(groupMatchesQuery(group, '  ')).toBe(true)
    expect(groupMatchesQuery(group, 'mist')).toBe(false)
  })
})

describe('scope mapping', () => {
  it('opens an album group with its artist, so the filter is unambiguous', () => {
    const group = buildGroups([track('a', 'Ann', 'Fog')], 'albums')[0]
    expect(groupScopeOf('albums', group)).toEqual({ kind: 'album', artist: 'Ann', album: 'Fog' })
    const artistGroup = buildGroups([track('a', 'Ann', 'Fog')], 'artists')[0]
    expect(groupScopeOf('artists', artistGroup)).toEqual({ kind: 'artist', artist: 'Ann' })
  })

  it('knows which grid a drilled-down scope came from', () => {
    expect(parentGroupKind({ kind: 'album', artist: 'Ann', album: 'Fog' })).toBe('albums')
    expect(parentGroupKind({ kind: 'artist', artist: 'Ann' })).toBe('artists')
    expect(parentGroupKind({ kind: 'all' })).toBeNull()
  })
})
