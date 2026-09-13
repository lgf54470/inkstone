import { describe, expect, it } from 'vitest'
import { splitIntoSlides } from './slides'

describe('splitIntoSlides — separators and code fences', () => {
  it('returns the whole note as a single slide when there is no separator', () => {
    expect(splitIntoSlides('# Title\n\nbody')).toEqual(['# Title\n\nbody'])
  })

  it('splits on blank-line-surrounded --- separators and drops the separator line', () => {
    expect(splitIntoSlides('# First\n\n---\n\n# Second')).toEqual(['# First', '# Second'])
  })

  it('keeps a --- glued to the line above as a setext heading inside one slide', () => {
    const source = 'Title\n---\n\nbody'
    expect(splitIntoSlides(source)).toEqual([source])
  })

  it('does not split on --- inside fenced code blocks', () => {
    const slide = '```yaml\nkey: value\n---\nstill: code\n```'
    expect(splitIntoSlides(`${slide}\n\n---\n\n# Next`)).toEqual([slide, '# Next'])
  })

  it('does not split on --- inside tilde fenced code blocks', () => {
    const slide = '~~~\n---\n~~~'
    expect(splitIntoSlides(`${slide}\n\n---\n\n# Next`)).toEqual([slide, '# Next'])
  })

  it('does not split on a 4-space indented ---- code block line', () => {
    const source = 'text\n\n    ----\n\nmore'
    expect(splitIntoSlides(source)).toEqual([source])
  })

  it('splits on --- with trailing spaces or extra hyphens', () => {
    expect(splitIntoSlides('# A\n\n----  \n\n# B')).toEqual(['# A', '# B'])
  })
})

describe('splitIntoSlides — front matter and deck edges', () => {
  it('strips leading front matter so properties never become a slide', () => {
    expect(splitIntoSlides('---\ntitle: Deck\n---\n\n# Cover\n\n---\n\n# Page 2')).toEqual(['# Cover', '# Page 2'])
  })

  it('keeps a malformed front matter block as regular content without a blank first slide', () => {
    expect(splitIntoSlides('---\ntitle: never closed\n\n# Body')).toEqual(['title: never closed\n\n# Body'])
  })

  it('supports CRLF line endings', () => {
    expect(splitIntoSlides('# A\r\n\r\n---\r\n\r\n# B')).toEqual(['# A', '# B'])
  })

  it('keeps a blank slide between two consecutive separators but drops blank edge slides', () => {
    expect(splitIntoSlides('# A\n\n---\n\n---\n\n# B')).toEqual(['# A', '', '# B'])
  })

  it('produces one empty slide for an empty note instead of zero slides', () => {
    expect(splitIntoSlides('')).toEqual([''])
  })
})
