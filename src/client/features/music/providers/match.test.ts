import { describe, expect, it } from 'vitest'
import { matchScore } from './match'

describe('provider alternate matching (FEA-A1-4)', () => {
  const song = { title: 'Sunny Day', artist: 'Jay Chou', durationMs: 269_000 }

  it('ranks an exact title and artist highest', () => {
    expect(matchScore({ title: 'Sunny Day', artist: 'Jay Chou', durationMs: null }, song)).toBe(21)
  })

  it('is case and whitespace insensitive', () => {
    expect(matchScore({ title: ' sunny  day ', artist: 'jay chou', durationMs: null }, song)).toBe(21)
  })

  it('a partial title still matches below an exact one', () => {
    const exact = matchScore({ title: 'Sunny Day', artist: 'Jay Chou', durationMs: null }, song)
    const partial = matchScore({ title: 'Sunny Day (Live)', artist: 'Jay Chou', durationMs: null }, song)
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(exact)
  })

  it('rejects a different title outright', () => {
    expect(matchScore({ title: 'Rainbow', artist: 'Jay Chou', durationMs: null }, song)).toBe(0)
  })

  it('rejects a same-title song by a different artist', () => {
    expect(matchScore({ title: 'Sunny Day', artist: 'Cover Band', durationMs: null }, song)).toBe(0)
  })

  it('an unknown artist on either side stays neutral instead of rejecting', () => {
    expect(matchScore({ title: 'Sunny Day', artist: '', durationMs: null }, song)).toBe(20)
    expect(matchScore({ title: 'Sunny Day', artist: 'Jay Chou', durationMs: null }, { ...song, artist: '' })).toBe(20)
  })

  it('rejects a title-length audiobook hiding behind the same name', () => {
    expect(matchScore({ title: 'Sunny Day', artist: 'Jay Chou', durationMs: 3 * 3600_000 }, song)).toBe(0)
  })
})
