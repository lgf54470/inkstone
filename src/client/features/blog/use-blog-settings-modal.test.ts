import { describe, expect, it } from 'vitest'
import { parseBlogCleanDays, parseSpamKeywords } from './use-blog-settings-modal'

describe('parseBlogCleanDays (SH-43)', () => {
  it('accepts positive integer retention days', () => {
    expect(parseBlogCleanDays('30')).toBe(30)
    expect(parseBlogCleanDays('1')).toBe(1)
  })

  it('rejects Keep Forever (0) so older_than cleanup cannot wipe every log', () => {
    expect(parseBlogCleanDays('0')).toBeNull()
  })

  it('rejects negative and unparseable values', () => {
    expect(parseBlogCleanDays('-5')).toBeNull()
    expect(parseBlogCleanDays('abc')).toBeNull()
    expect(parseBlogCleanDays('')).toBeNull()
  })
})

// FEA-06: the blacklist box is one string and the worker's rules take a list, so both sides have to
// agree on exactly one shape — trimmed, blanks dropped, duplicates collapsed, capped like the schema.
describe('parseSpamKeywords', () => {
  it('splits on commas and newlines and drops blanks', () => {
    expect(parseSpamKeywords('casino, cheap loans\n  viagra  ')).toEqual(['casino', 'cheap loans', 'viagra'])
    expect(parseSpamKeywords('')).toEqual([])
    expect(parseSpamKeywords(', ,')).toEqual([])
  })

  it('collapses duplicates and caps the list at the request schema limit', () => {
    expect(parseSpamKeywords('casino, casino')).toEqual(['casino'])
    const many = Array.from({ length: 60 }, (_, index) => `word-${index}`).join(',')
    expect(parseSpamKeywords(many)).toHaveLength(50)
  })
})
