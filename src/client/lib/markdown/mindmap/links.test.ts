import { describe, expect, it } from 'vitest'
import { parseMindmapNodeLink } from './links'

describe('parseMindmapNodeLink', () => {
  it('reads a topic that is one wiki link', () => {
    expect(parseMindmapNodeLink('[[Target note]]')).toBe('Target note')
  })

  it('keeps the alias for the wiki parser to split', () => {
    expect(parseMindmapNodeLink('[[Target note|Short]]')).toBe('Target note|Short')
  })

  it('ignores a topic that only mentions a note', () => {
    expect(parseMindmapNodeLink('see [[Target note]] for more')).toBeNull()
    expect(parseMindmapNodeLink('[[Target note]] and text')).toBeNull()
    expect(parseMindmapNodeLink('plain topic')).toBeNull()
  })

  it('ignores empty and malformed targets', () => {
    expect(parseMindmapNodeLink('')).toBeNull()
    expect(parseMindmapNodeLink('[[]]')).toBeNull()
    expect(parseMindmapNodeLink('[[   ]]')).toBeNull()
    expect(parseMindmapNodeLink('[[a\nb]]')).toBeNull()
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseMindmapNodeLink('  [[Target]]  ')).toBe('Target')
  })
})
