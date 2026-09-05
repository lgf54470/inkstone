import { describe, expect, it } from 'vitest'
import { isSvgCoverUrl, stripFrontmatter } from './content'

describe('stripFrontmatter', () => {
  it('strips a leading YAML block', () => {
    expect(stripFrontmatter('---\ntitle: Hello\n---\n# Body')).toBe('# Body')
  })

  it('keeps content without frontmatter', () => {
    expect(stripFrontmatter('# Body')).toBe('# Body')
  })

  it('handles CRLF line endings', () => {
    expect(stripFrontmatter('---\r\ntitle: Hello\r\n---\r\n# Body')).toBe('# Body')
  })

  it('strips frontmatter even when not YAML-shaped', () => {
    expect(stripFrontmatter('---\njust text\n---\nrest')).toBe('rest')
  })
})

describe('isSvgCoverUrl', () => {
  it('detects .svg and .svg?query urls', () => {
    expect(isSvgCoverUrl('https://x.com/a.svg')).toBe(true)
    expect(isSvgCoverUrl('https://x.com/a.svg?w=100')).toBe(true)
    expect(isSvgCoverUrl('https://x.com/A.SVG')).toBe(true)
  })

  it('rejects other urls and empty values', () => {
    expect(isSvgCoverUrl('https://x.com/a.png')).toBe(false)
    expect(isSvgCoverUrl('')).toBe(false)
    expect(isSvgCoverUrl(null)).toBe(false)
    expect(isSvgCoverUrl(undefined)).toBe(false)
  })
})