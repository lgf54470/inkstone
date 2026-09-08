import { describe, expect, it } from 'vitest'
import { buildPageItems, getPageUrl, parsePositiveInt } from './pagination'

describe('buildPageItems', () => {
  it('returns all pages when totalPages is 7 or less', () => {
    expect(buildPageItems(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageItems(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('keeps first, last and current±1 with ellipsis gaps in the middle', () => {
    expect(buildPageItems(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10])
  })

  it('clips the window at the first and last page', () => {
    expect(buildPageItems(1, 10)).toEqual([1, 2, '...', 10])
    expect(buildPageItems(2, 10)).toEqual([1, 2, 3, '...', 10])
    expect(buildPageItems(9, 10)).toEqual([1, '...', 8, 9, 10])
    expect(buildPageItems(10, 10)).toEqual([1, '...', 9, 10])
  })

  it('handles a single page and the last page', () => {
    expect(buildPageItems(1, 1)).toEqual([1])
    expect(buildPageItems(1, 8)).toEqual([1, 2, '...', 8])
  })
})

describe('getPageUrl', () => {
  it('omits page param for page 1', () => {
    expect(getPageUrl(1)).toBe('/')
    expect(getPageUrl(1, '/categories/tech')).toBe('/categories/tech')
    expect(getPageUrl(1, '')).toBe('/')
  })

  it('appends ?page= for plain base urls', () => {
    expect(getPageUrl(2, '/categories/tech')).toBe('/categories/tech?page=2')
  })

  it('appends &page= for base urls that already carry a query', () => {
    expect(getPageUrl(3, '/search?q=x')).toBe('/search?q=x&page=3')
  })
})

describe('parsePositiveInt', () => {
  it('parses valid positive integers', () => {
    expect(parsePositiveInt('3', 1)).toBe(3)
  })

  it('treats zero and below as invalid', () => {
    expect(parsePositiveInt('0', 5)).toBe(5)
  })

  it('falls back to the default for invalid or missing input', () => {
    expect(parsePositiveInt('abc', 1)).toBe(1)
    expect(parsePositiveInt('-5', 1)).toBe(1)
    expect(parsePositiveInt(null, 7)).toBe(7)
    expect(parsePositiveInt(undefined, 7)).toBe(7)
    expect(parsePositiveInt('', 7)).toBe(7)
  })
})