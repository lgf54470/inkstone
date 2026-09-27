import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/api', () => ({
  api: {
    music: {
      providerSearch: vi.fn(async (source: string) => ({
        results: [{ provider: 'gds', source, sourceId: 'x1', title: `Song ${source}`, artist: '', album: '', durationMs: null }],
      })),
    },
  },
}))

import { api } from '../../../lib/api'
import { searchGds, searchGdsPages } from './gds'

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
