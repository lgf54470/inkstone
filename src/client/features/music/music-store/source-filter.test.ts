import { describe, expect, it } from 'vitest'
import type { MusicSource, MusicTrack } from '@shared/types'
import { visibleTracks } from './library-load'
import type { MusicSourceFilter, MusicStoreState } from './types'

// FB-F3: the filter used to know only r2 and webdav, so the reference sources the account
// holds today (alist / external / provider) could not be filtered to at all.
function track(id: string, source: MusicSource): MusicTrack {
  return { id, title: id, artist: '', album: '', createdAt: 0, source, sizeBytes: 10 } as MusicTrack
}

function state(filter: MusicSourceFilter): MusicStoreState {
  return {
    scope: { kind: 'all' },
    sourceFilter: filter,
    query: '',
    sort: 'title',
    sortDirection: 'asc',
    tracks: [track('r2-1', 'r2'), track('alist-1', 'alist'), track('provider-1', 'provider')],
  } as unknown as MusicStoreState
}

describe('visibleTracks by source filter (FB-F3)', () => {
  it('keeps only the rows of the source the reader picked', () => {
    expect(visibleTracks(state('alist')).map((entry) => entry.id)).toEqual(['alist-1'])
    expect(visibleTracks(state('provider')).map((entry) => entry.id)).toEqual(['provider-1'])
    expect(visibleTracks(state('external')).map((entry) => entry.id)).toEqual([])
  })

  it('keeps the whole library under the all-sources filter', () => {
    expect(visibleTracks(state('all'))).toHaveLength(3)
  })
})
