import { describe, expect, it } from 'vitest'
import { canFuzzyMatch, fuzzyMatch } from './fuzzy'

const SAMPLES = [
  'Inkstone',
  'incremental sync engine',
  '设定面板的打开速度',
  'WebDAV 备份',
  'react-hooks-performance.md',
  'Meeting Notes 2026-09-01',
  'short',
  'a b c d e f g',
]

const QUERIES = ['ink', 'ync', 'face', 'webdav', 'r-h-p', 'meeti', 'b f', 'abc', 'x', 'zz', '', 'en', '备份']

describe('canFuzzyMatch', () => {
  it('accepts exactly the inputs fuzzyMatch accepts', () => {
    for (const sample of SAMPLES) {
      const lowerText = sample.toLowerCase()
      for (const query of QUERIES) {
        const expected = fuzzyMatch(sample, query) !== null
        const actual = canFuzzyMatch(lowerText, query.toLowerCase())
        expect(actual, `query "${query}" on "${sample}"`).toBe(expected)
      }
    }
  })

  it('matches boundary characters like fuzzyMatch', () => {
    expect(canFuzzyMatch('a-b c', 'bc')).toBe(true)
    expect(canFuzzyMatch('a-b c', 'b-c')).toBe(true)
    expect(canFuzzyMatch('a-b c', 'a c')).toBe(true)
    expect(canFuzzyMatch('a-b c', 'ca')).toBe(false)
  })
})