import { describe, expect, it } from 'vitest'
import {
  CHANNEL_UNMARKED,
  CHANNEL_UNRECOGNIZED,
  isReservedChannelName,
  normalizeChannelToken,
  storedChannelValue,
  withChannelParam,
} from './share-channel'

/**
 * ADR-0004: the marker is a bounded, lowercase token and nothing else. These are the boundaries
 * the privacy argument rests on — everything the character set refuses is something that could
 * have carried a person's text into the visits table.
 */
describe('channel marker tokens', () => {
  it('accepts a 32-char token and refuses 33', () => {
    expect(normalizeChannelToken('a'.repeat(32))).toBe('a'.repeat(32))
    expect(normalizeChannelToken('a'.repeat(33))).toBeNull()
  })

  it('refuses anything that could carry free text', () => {
    for (const rejected of ['Newsletter', 'news letter', 'news.letter', ' newsletter', 'newsletter ', '\u6e20\u9053' /* a non-Latin marker: the charset is ASCII only */, 'news%2Eletter', 'news\u0000letter', '-leading', '_leading', '']) {
      expect(normalizeChannelToken(rejected), rejected).toBeNull()
    }
  })

  it('accepts digits, hyphens and underscores after the first character', () => {
    for (const accepted of ['a', '0', 'newsletter', 'mail-1', 'mail_1', 'q3-2026_news']) {
      expect(normalizeChannelToken(accepted), accepted).toBe(accepted)
    }
  })

  it('keeps the reserved names outside the token space, so a marker cannot squat them', () => {
    // The breakdown tells "no marker" from "refused marker" by name; if a visitor could store
    // either name as a token, the dashboard would report a real channel as one of the misses.
    expect(normalizeChannelToken(CHANNEL_UNMARKED)).toBeNull()
    expect(normalizeChannelToken(CHANNEL_UNRECOGNIZED)).toBeNull()
    expect(isReservedChannelName(CHANNEL_UNMARKED)).toBe(true)
    expect(isReservedChannelName(CHANNEL_UNRECOGNIZED)).toBe(true)
    expect(isReservedChannelName('newsletter')).toBe(false)
  })
})

describe('storedChannelValue', () => {
  it('separates "no marker sent" from "a marker was refused"', () => {
    expect(storedChannelValue(undefined)).toBeNull()
    expect(storedChannelValue(null)).toBeNull()
    expect(storedChannelValue('newsletter')).toBe('newsletter')
    // Present but malformed: the visit is still recorded, and the miss stays countable.
    expect(storedChannelValue('Newsletter')).toBe('')
  })

  it('stores nothing derived from a refused value', () => {
    const raw = 'mailto:someone@example.com?subject=hello'
    const stored = storedChannelValue(raw)
    expect(stored).toBe('')
    expect(JSON.stringify(stored)).not.toContain('example.com')
  })
})

describe('withChannelParam', () => {
  it('appends a well-formed marker to a plain URL', () => {
    expect(withChannelParam('https://x.example/s/abc123', 'newsletter')).toBe('https://x.example/s/abc123?ref=newsletter')
  })

  it('joins an existing query string instead of starting a second one', () => {
    expect(withChannelParam('https://x.example/s/abc123?x=1', 'news')).toBe('https://x.example/s/abc123?x=1&ref=news')
  })

  it('hands out the untouched link when the marker would not survive validation', () => {
    expect(withChannelParam('https://x.example/s/abc123', 'Not A Token')).toBe('https://x.example/s/abc123')
    expect(withChannelParam('https://x.example/s/abc123', undefined)).toBe('https://x.example/s/abc123')
  })
})
