import { describe, expect, it } from 'vitest'
import { canFuzzyMatch, fuzzyMatch } from './fuzzy'

const SAMPLES = [
  'Inkstone',
  'incremental sync engine',
  '\u8bbe\u5b9a\u9762\u677f\u7684\u6253\u5f00\u901f\u5ea6',
  'WebDAV \u5907\u4efd',
  'react-hooks-performance.md',
  'Meeting Notes 2026-09-01',
  'short',
  'a b c d e f g',
]

const QUERIES = ['ink', 'ync', 'face', 'webdav', 'r-h-p', 'meeti', 'b f', 'abc', 'x', 'zz', '', 'en', '\u5907\u4efd']

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

  it('shares fuzzyMatch acceptance on boundary cases', () => {
    const text = 'a-b c'
    for (const query of ['bc', 'b-c', 'a c', 'ca', '-c', 'c-', 'c ']) {
      expect(canFuzzyMatch(text, query)).toBe(fuzzyMatch(text, query) !== null)
    }
  })
})