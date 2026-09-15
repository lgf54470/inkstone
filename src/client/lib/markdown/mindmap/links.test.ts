import { describe, expect, it } from 'vitest'
import { parseMindmapNodeLink, splitMindmapTopicLinks } from './links'

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

describe('splitMindmapTopicLinks', () => {
  it('keeps plain text around links embedded in a topic', () => {
    expect(splitMindmapTopicLinks('Community [[AGENTS.md]] rocks')).toEqual([
      { text: 'Community ' },
      { text: 'AGENTS.md', target: 'AGENTS.md' },
      { text: ' rocks' },
    ])
  })

  it('splits every link in the topic in reading order', () => {
    expect(splitMindmapTopicLinks('[[A]] then [[B|bee]]')).toEqual([
      { text: 'A', target: 'A' },
      { text: ' then ' },
      { text: 'B|bee', target: 'B|bee' },
    ])
  })

  it('keeps an empty link as literal text', () => {
    expect(splitMindmapTopicLinks('a [[]] b')).toEqual([{ text: 'a [[]] b' }])
  })

  it('returns one plain segment when the topic has no link', () => {
    expect(splitMindmapTopicLinks('plain topic')).toEqual([{ text: 'plain topic' }])
  })
})
