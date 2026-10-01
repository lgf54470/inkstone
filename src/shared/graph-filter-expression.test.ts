import { describe, expect, it } from 'vitest'
import {
  GRAPH_FILTER_TERM_LIMIT,
  graphFilterMatches,
  parseGraphFilter,
} from './graph-filter-expression'

function terms(raw: string) {
  return parseGraphFilter(raw).terms.map((term) => `${term.isExcluded ? '-' : ''}${term.kind}:${term.value}`)
}

describe('graph filter expression parsing', () => {
  it('keeps a plain filter as title text and reads no terms from it', () => {
    expect(parseGraphFilter(' monthly review ')).toEqual({ text: 'monthly review', terms: [] })
    expect(parseGraphFilter('')).toEqual({ text: '', terms: [] })
  })

  it('reads tag and folder terms, each positive or negated', () => {
    expect(terms('tag:work -tag:archive path:Templates -path:inbox')).toEqual([
      'tag:work',
      '-tag:archive',
      'folder:Templates',
      '-folder:inbox',
    ])
  })

  it('unwraps quoted values so a term may contain a space', () => {
    expect(terms('-tag:"monthly review"')).toEqual(['-tag:monthly review'])
  })

  it('leaves an unqualified or empty term in the title text instead of dropping it', () => {
    expect(terms('tag: -path:')).toEqual([])
    expect(parseGraphFilter('tag: -path:').text).toBe('tag: -path:')
    expect(parseGraphFilter('verbatim:keep').text).toBe('verbatim:keep')
  })

  it('caps qualified terms so the filter cannot outgrow the query variable budget', () => {
    const overflow = Array.from({ length: GRAPH_FILTER_TERM_LIMIT + 2 }, (_, index) => `tag:t${index}`).join(' ')
    const parsed = parseGraphFilter(overflow)
    expect(parsed.terms).toHaveLength(GRAPH_FILTER_TERM_LIMIT)
    expect(parsed.text).toBe(`tag:t${GRAPH_FILTER_TERM_LIMIT} tag:t${GRAPH_FILTER_TERM_LIMIT + 1}`)
  })
})

describe('graph filter expression matching', () => {
  const note = { title: 'Sprint plan', folderName: 'Work', tags: [{ name: 'urgent' }] }

  it('matches title text case-insensitively and folder terms as substrings', () => {
    expect(graphFilterMatches(note, parseGraphFilter('sprint'))).toBe(true)
    expect(graphFilterMatches(note, parseGraphFilter('roadmap'))).toBe(false)
    expect(graphFilterMatches(note, parseGraphFilter('path:wor'))).toBe(true)
    expect(graphFilterMatches(note, parseGraphFilter('path:home'))).toBe(false)
  })

  it('requires an exact tag name and honours the negation', () => {
    expect(graphFilterMatches(note, parseGraphFilter('tag:URGENT'))).toBe(true)
    expect(graphFilterMatches(note, parseGraphFilter('tag:urgent -tag:later'))).toBe(true)
    expect(graphFilterMatches(note, parseGraphFilter('tag:urgent -tag:URGENT'))).toBe(false)
    expect(graphFilterMatches(note, parseGraphFilter('-path:Work'))).toBe(false)
  })

  it('keeps a note without a folder when only folder exclusions are asked for', () => {
    const loose = { title: 'Sprint plan', folderName: null, tags: [] }
    expect(graphFilterMatches(loose, parseGraphFilter('-path:Work -tag:urgent'))).toBe(true)
    expect(graphFilterMatches(loose, parseGraphFilter('path:Work'))).toBe(false)
  })
})
