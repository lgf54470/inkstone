import { describe, expect, it } from 'vitest'
import type { MusicTrack } from '@shared/types'
import { musicStreamUrl } from '../../../lib/api'
import { providerStreamQuality } from '../music-utils'

// FB-F7: the tier is a query parameter on the stream URL — the worker resolves the upstream
// link per stream, so there is nowhere else for it to travel.
describe('provider stream quality (FB-F7)', () => {
  it('writes the tier into the stream URL', () => {
    expect(musicStreamUrl('trk-1', 128)).toBe('/api/music/tracks/trk-1/stream?quality=128')
    expect(musicStreamUrl('trk-1')).toBe('/api/music/tracks/trk-1/stream')
  })

  it('applies to provider rows only', () => {
    expect(providerStreamQuality({ source: 'provider' } as MusicTrack, 740)).toBe(740)
    expect(providerStreamQuality({ source: 'r2' } as MusicTrack, 740)).toBeUndefined()
    expect(providerStreamQuality({ source: 'alist' } as MusicTrack, 740)).toBeUndefined()
  })
})
