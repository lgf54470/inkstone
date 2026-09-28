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
import { GDS_SOURCES, PROVIDER_SCOPE_ALL, scopeSources, searchGds, searchGdsPages, type MusicProviderScope } from './gds'

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
// reader who usually has one in mind. The scope narrows the fan-out. FB3-S1 is the other half of the
// same rule: the scope is a client-side way to ask fewer catalogues, never a slug that reaches a
// request — anything off the shared list is read as if no scope had been passed at all.
describe('gds search scope (FB3-F1 + FB3-S1)', () => {
  beforeEach(() => {
    vi.mocked(api.music.providerSearch).mockClear()
  })

  it('asks only the chosen catalogue when one source is in scope', async () => {
    const pages = await searchGdsPages('song', 'kuwo')
    expect(pages.map((page) => page.source)).toEqual(['kuwo'])
    expect(api.music.providerSearch).toHaveBeenCalledTimes(1)
    expect(api.music.providerSearch).toHaveBeenCalledWith('kuwo', 'song')
  })

  it('fans out to every catalogue for the aggregate scope', async () => {
    const pages = await searchGdsPages('song', PROVIDER_SCOPE_ALL)
    expect(pages.map((page) => page.source)).toEqual([...GDS_UPSTREAM_SOURCES])
  })

  it('reads a name off the shared list as the aggregate scope rather than as a catalogue', async () => {
    const pages = await searchGdsPages('song', 'spotify' as MusicProviderScope)
    expect(pages.map((page) => page.source)).toEqual([...GDS_UPSTREAM_SOURCES])
  })

  it('never lets an off-list scope reach a request', async () => {
    await searchGdsPages('song', 'https://evil.example/steal' as MusicProviderScope)
    const asked = vi.mocked(api.music.providerSearch).mock.calls.map(([source]) => source)
    expect(asked).toEqual([...GDS_UPSTREAM_SOURCES])
  })

  // The aggregate answer is the shared list itself rather than a copy of it: the identity the
  // catalogue list already rests on (FB-S4) has to hold for the scope's expansion too, or a later
  // edit to the list would quietly apply in one place and not the other.
  it('gives the shared catalogue list itself for anything that is not one of its entries', () => {
    expect(scopeSources(PROVIDER_SCOPE_ALL)).toBe(GDS_SOURCES)
    expect(scopeSources('unknown')).toBe(GDS_SOURCES)
    expect(scopeSources('migu')).toEqual(['migu'])
  })
})
