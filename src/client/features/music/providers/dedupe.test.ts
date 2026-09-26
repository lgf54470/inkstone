import { describe, expect, it } from 'vitest'
import { mergeProviderResults } from './dedupe'
import type { MusicProviderTrack } from './types'

function hit(source: string, title: string, artist: string): MusicProviderTrack {
  return { provider: 'gds', source, sourceId: `${source}-${title}`, title, artist, album: '', durationMs: null }
}

describe('provider result merge (FEA-A1-3)', () => {
  it('merges per-source pages in rank order and drops normalized duplicates', () => {
    const merged = mergeProviderResults([
      [hit('netease', 'Sunny', 'Jay Chou'), hit('netease', 'Nightcall', 'Kavinsky')],
      [hit('kuwo', 'Sunny ', 'Jay Chou'), hit('kuwo', 'Only Song', 'Who')],
      [hit('migu', 'Sunny', 'Jay Chou'), hit('migu', 'Nightcall', 'Kavinsky')],
    ])
    expect(merged.map((entry) => `${entry.source}:${entry.title}`)).toEqual([
      'netease:Sunny',
      'netease:Nightcall',
      'kuwo:Only Song',
    ])
  })

  it('keeps same-title hits whose artists differ', () => {
    const merged = mergeProviderResults([
      [hit('netease', 'Run', 'A'), hit('netease', 'Run', 'B')],
    ])
    expect(merged).toHaveLength(2)
  })
})
