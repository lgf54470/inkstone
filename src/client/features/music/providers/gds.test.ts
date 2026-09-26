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
    expect(pages.map((page) => page[0]?.source)).toEqual(['netease', 'kuwo', 'migu', 'qq', 'bilibili'])
  })

  it('merges the surviving pages when one source fails', async () => {
    vi.mocked(api.music.providerSearch).mockImplementationOnce(async () => {
      throw new Error('source down')
    })
    const merged = await searchGds('song')
    expect(merged).toHaveLength(4)
  })
})
