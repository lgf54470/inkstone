import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './index'
import { deadReferenceIds, referenceTrackIds, trashDeadReferences } from './health'
import { trashTracks } from './library-tracks'
import { musicStoreStub } from './store.test-helpers'

vi.mock('../../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      music: {
        ...actual.api.music,
        checkReferenceHealth: vi.fn(async (ids: string[]) => ({
          results: ids.map((id) => ({ id, status: id.includes('dead') ? 'dead' : 'ok' })),
        })),
        batchTracks: vi.fn(async (ids: string[]) => ({ ok: true, updated: ids.length })),
        providerSearch: vi.fn(async (source: string) => ({
          results: [{
            provider: 'gds', source, sourceId: `${source}-1`, title: 'Song A', artist: 'Ann',
            album: '', durationMs: null, coverId: null, lyricId: null,
          }],
        })),
        importProviderTrack: vi.fn(async () => ({ id: 'trk-new', title: 'Song A', source: 'provider' })),
      },
    },
  }
})

vi.mock('../music-feedback', () => ({
  toastMusic: vi.fn(),
  toastMusicError: vi.fn(),
  toastMusicNotice: vi.fn(),
}))

import { api } from '../../../lib/api'
import { toastMusic, toastMusicNotice } from '../music-feedback'

function track(id: string, source: MusicTrack['source']): MusicTrack {
  return { id, title: `Song ${id}`, artist: 'Ann', album: '', durationMs: 1000, source } as MusicTrack
}

afterEach(() => {
  useMusic.setState({ tracks: [], queue: [], currentIndex: 0, healthOpen: false, healthScanning: false, healthFailed: false, healthResults: null })
  vi.clearAllMocks()
})

// FB-F9: the scan asks about the rows that point somewhere else — R2 and WebDAV rows are ours and are
// not what goes stale without a word.
describe('which rows a health scan asks about (FB-F9)', () => {
  it('takes the external, alist and online rows and leaves the rest alone', () => {
    const state = { tracks: [track('a', 'r2'), track('b', 'webdav'), track('c', 'external'), track('d', 'alist'), track('e', 'provider')] }
    expect(referenceTrackIds(state as never)).toEqual(['c', 'd', 'e'])
  })

  it('counts only the links that are gone as actionable', () => {
    expect(deadReferenceIds([
      { id: 'a', status: 'dead' },
      { id: 'b', status: 'unreachable' },
      { id: 'c', status: 'ok' },
    ])).toEqual(['a'])
  })
})

describe('the health scan itself (FB-F9)', () => {
  it('splits a library bigger than one batch into several requests', async () => {
    const tracks = Array.from({ length: 51 }, (_, index) => track(`t-${index}`, 'external'))
    useMusic.setState({ tracks })
    await useMusic.getState().scanReferences()
    expect(api.music.checkReferenceHealth).toHaveBeenCalledTimes(2)
    expect((api.music.checkReferenceHealth as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]).toHaveLength(50)
    expect(useMusic.getState().healthResults).toHaveLength(51)
    expect(useMusic.getState().healthFailed).toBe(false)
  })

  it('keeps the verdicts that arrived when a later batch cannot be asked', async () => {
    const tracks = Array.from({ length: 51 }, (_, index) => track(`t-${index}`, 'external'))
    useMusic.setState({ tracks })
    vi.mocked(api.music.checkReferenceHealth).mockResolvedValueOnce({ results: [{ id: 't-0', status: 'ok' }] })
    vi.mocked(api.music.checkReferenceHealth).mockRejectedValueOnce(new Error('no network'))
    await useMusic.getState().scanReferences()
    expect(useMusic.getState().healthResults).toEqual([{ id: 't-0', status: 'ok' }])
    expect(useMusic.getState().healthFailed).toBe(true)
    expect(useMusic.getState().healthScanning).toBe(false)
  })
})

describe('acting on what the scan found (FB-F9)', () => {
  it('moves the dead rows to the trash and drops them from the panel', async () => {
    // The cleanup path reads the whole library state it touches — queue, playlists, selection — so
    // the fixture carries those fields rather than only the ones the action under test names.
    const stub = musicStoreStub({
      tracks: [], playlists: [], tags: [], selectedIds: [], queue: [], currentIndex: 0, offlineTrackIds: [],
      healthResults: [{ id: 'a', status: 'dead' }, { id: 'b', status: 'unreachable' }],
      trashTracks: (ids: string[]) => trashTracks(stub.set, stub.get, ids),
    })
    await trashDeadReferences(stub.set, stub.get, ['a'])
    expect(api.music.batchTracks).toHaveBeenCalledWith(['a'], 'delete', undefined)
    expect(stub.read().healthResults).toEqual([{ id: 'b', status: 'unreachable' }])
  })

  it('re-points a dead online row at another catalogue and clears the broken row out', async () => {
    useMusic.setState({
      // Same name, so the ranking has something to match: this is the song the catalogue knows.
      tracks: [{ ...track('dead-row', 'provider'), title: 'Song A', providerSource: 'netease', providerSongId: 'a1' } as MusicTrack],
      providerEnabled: { gds: true },
      healthResults: [{ id: 'dead-row', status: 'dead' }],
      queue: ['dead-row'],
      currentIndex: 0,
    })
    await useMusic.getState().repairDeadReference('dead-row')
    // The catalogue was asked, the new row took the queue slot, and the dead row went to the trash.
    expect(api.music.providerSearch).toHaveBeenCalled()
    expect(useMusic.getState().queue).toEqual(['trk-new'])
    expect(api.music.batchTracks).toHaveBeenCalledWith(['dead-row'], 'delete', undefined)
    expect(useMusic.getState().healthResults).toEqual([])
  })

  // FB3-F7: the panel already knew which rows are dead and how to re-point one of them; what it
  // lacked was the gesture for the list — a scan that finds five broken links asked the reader to
  // press five times.
  it('re-points every dead online row in one gesture and says how many landed', async () => {
    const rows = ['dead-1', 'dead-2'].map((id) => ({
      ...track(id, 'provider'), title: 'Song A', providerSource: 'netease', providerSongId: 'a1',
    } as MusicTrack))
    useMusic.setState({
      tracks: rows,
      providerEnabled: { gds: true },
      healthResults: [{ id: 'dead-1', status: 'dead' }, { id: 'dead-2', status: 'dead' }],
      queue: ['dead-1', 'dead-2'],
      currentIndex: 0,
    })
    await useMusic.getState().repairDeadReferences(['dead-1', 'dead-2'])
    expect(api.music.providerSearch).toHaveBeenCalled()
    expect((api.music.batchTracks as unknown as { mock: { calls: [string[], string][] } }).mock.calls.map(([ids]) => ids))
      .toEqual([['dead-1'], ['dead-2']])
    expect(useMusic.getState().healthResults).toEqual([])
    expect(toastMusic).toHaveBeenCalledWith('music.health_repaired', { value0: 2 })
  })

  it('keeps the rows nothing else knows about and says so once', async () => {
    vi.mocked(api.music.providerSearch).mockResolvedValue({ results: [] })
    useMusic.setState({
      tracks: [track('dead-1', 'provider')],
      providerEnabled: { gds: true },
      healthResults: [{ id: 'dead-1', status: 'dead' }],
    })
    await useMusic.getState().repairDeadReferences(['dead-1'])
    expect(api.music.batchTracks).not.toHaveBeenCalled()
    expect(useMusic.getState().healthResults).toEqual([{ id: 'dead-1', status: 'dead' }])
    expect(toastMusicNotice).toHaveBeenCalledTimes(1)
    expect(toastMusic).not.toHaveBeenCalled()
  })

  it('leaves a row with no catalogue of its own alone', async () => {
    useMusic.setState({
      tracks: [track('local-row', 'external')],
      healthResults: [{ id: 'local-row', status: 'dead' }],
    })
    await useMusic.getState().repairDeadReferences(['local-row'])
    expect(api.music.providerSearch).not.toHaveBeenCalled()
    expect(api.music.batchTracks).not.toHaveBeenCalled()
    expect(toastMusicNotice).toHaveBeenCalledWith('music.source_switch_none')
  })

  it('leaves the row listed when no other catalogue has the song', async () => {
    useMusic.setState({
      tracks: [{ ...track('dead-row', 'provider'), providerSource: 'netease', providerSongId: 'a1' } as MusicTrack],
      providerEnabled: { gds: true },
      healthResults: [{ id: 'dead-row', status: 'dead' }],
    })
    vi.mocked(api.music.providerSearch).mockResolvedValue({ results: [] })
    await useMusic.getState().repairDeadReference('dead-row')
    expect(api.music.batchTracks).not.toHaveBeenCalled()
    expect(useMusic.getState().healthResults).toEqual([{ id: 'dead-row', status: 'dead' }])
  })
})
