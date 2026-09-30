import { describe, expect, it } from 'vitest'
import { extractSlideHeading } from './slide-rail'

describe('extractSlideHeading', () => {
  it('extracts H1 heading as the slide title', () => {
    const source = '# Welcome to Inkstone\n\nThis is a presentation slide.'
    expect(extractSlideHeading(source)).toBe('Welcome to Inkstone')
  })

  it('extracts lower-level headings (H2-H6)', () => {
    expect(extractSlideHeading('## Section Two\nSome content')).toBe('Section Two')
    expect(extractSlideHeading('### Deep Topic\nDetails')).toBe('Deep Topic')
    expect(extractSlideHeading('#### Level 4\nDetails')).toBe('Level 4')
  })

  it('falls back to the first non-empty prose line if no heading exists', () => {
    const source = 'Just plain text describing the architecture.\nSecond line.'
    expect(extractSlideHeading(source)).toBe('Just plain text describing the')
  })

  it('ignores HTML comments and code block markers when falling back', () => {
    const source = '<!-- note: private notes -->\n```ts\nconst x = 1\n```\nReal text content here'
    expect(extractSlideHeading(source)).toBe('Real text content here')
  })

  it('returns empty string for empty or comment-only slides', () => {
    expect(extractSlideHeading('')).toBe('')
    expect(extractSlideHeading('   \n\n  ')).toBe('')
    expect(extractSlideHeading('<!-- note: speaker notes only -->')).toBe('')
  })
})
