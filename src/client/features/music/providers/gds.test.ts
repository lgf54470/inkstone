import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      providerSearch: vi.fn(async (source: string) => ({
        results: [{ provider: 'gds', source, sourceId: 'x1', title: `Song ${source}`, artist: '', album: '', durationMs: null }],
      })),
    },
  },
}))

import { GDS_UPSTREAM_SOURCES } from '@shared/constants'
import { api } from '../../../lib/api'
import { GDS_SOURCES, searchGds, searchGdsPages } from './gds'

// FB-S4: the catalogues the search box offers and the catalogues the proxy forwards were two
// hand-kept lists. Drift is quiet in both directions: a name the client offers and the worker
// refuses shows up as one catalogue that always answers 400, and a catalogue the worker knows but
// the client never asks for is simply never reached. The client hands the shared list straight on,
// so a copy — equal values or not — is what this pins.
describe('the GDS catalogue list has one source (FB-S4)', () => {
  it('is the shared list itself rather than a copy of it', () => {
    expect(GDS_SOURCES).toBe(GDS_UPSTREAM_SOURCES)
  })
})

describe('gds search pages (FEA-A1-4)', () => {
  it('keeps every source page so a dead link can fail over to a lower-ranked copy', async () => {
    const pages = await searchGdsPages('song')
    expect(pages.map((page) => page.source)).toEqual(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])
    expect(pages.map((page) => page.results[0]?.source)).toEqual(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])
  })
})

// FB-F6: a catalogue that did not answer is a fact the caller needs, not an empty page.
describe('gds source status (FB-F6)', () => {
  it('marks the sources that answered and the ones that did not', async () => {
    vi.mocked(api.music.providerSearch).mockImplementationOnce(async () => {
      throw new Error('source down')
    })
    const pages = await searchGdsPages('song')
    expect(pages.filter((page) => page.status === 'error').map((page) => page.source)).toEqual(['netease'])
    expect(pages.filter((page) => page.status === 'ok')).toHaveLength(4)
  })

  it('names the failed sources next to the merged hits of the rest', async () => {
    vi.mocked(api.music.providerSearch).mockImplementationOnce(async () => {
      throw new Error('source down')
    })
    const merged = await searchGds('song')
    expect(merged.results).toHaveLength(4)
    expect(merged.failedSources).toEqual(['netease'])
  })

  it('separates a source that answered with nothing from one that failed', async () => {
    vi.mocked(api.music.providerSearch).mockImplementationOnce(async () => ({ results: [] }))
    const pages = await searchGdsPages('song')
    expect(pages.find((page) => page.source === 'netease')?.status).toBe('empty')
    expect((await searchGds('song')).failedSources).toEqual([])
  })
})

// FB3-F1: five catalogues per query is five requests and five slots of the proxy's budget for a
// reader who usually has one in mind. Which catalogues a search asks is the caller's decision (see
// `selection.ts`: the scope, and FB3-F2's per-catalogue table); this is the boundary that decision
// arrives at, and FB3-S1 is the half that has to hold here — nothing off the shared list is sent,
// whatever the caller computed.
describe('gds search fan-out (FB3-F1 + FB3-S1)', () => {
  beforeEach(() => {
    vi.mocked(api.music.providerSearch).mockClear()
  })

  it('asks only the catalogues it was handed', async () => {
    const pages = await searchGdsPages('song', ['kuwo'])
    expect(pages.map((page) => page.source)).toEqual(['kuwo'])
    expect(api.music.providerSearch).toHaveBeenCalledTimes(1)
    expect(api.music.providerSearch).toHaveBeenCalledWith('kuwo', 'song')
  })

  it('asks every catalogue when no list was named', async () => {
    const pages = await searchGdsPages('song')
    expect(pages.map((page) => page.source)).toEqual([...GDS_UPSTREAM_SOURCES])
  })

  it('never lets a name off the shared list reach a request', async () => {
    await searchGdsPages('song', ['kuwo', 'spotify', 'https://evil.example/steal'])
    expect(vi.mocked(api.music.providerSearch).mock.calls.map(([source]) => source)).toEqual(['kuwo'])
  })

  it('asks nothing when the reader has switched every catalogue off', async () => {
    const pages = await searchGdsPages('song', [])
    expect(pages).toEqual([])
    expect(api.music.providerSearch).not.toHaveBeenCalled()
  })
})
