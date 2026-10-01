import { describe, expect, it } from 'vitest'
import { findSlideIndexByOffset, splitIntoSlides } from './slides'

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

  it('splits on a separator that follows another separator with no blank line between', () => {
    expect(splitIntoSlides('# A\n\n---\n---\n\n# B')).toEqual(['# A', '', '# B'])
  })

  it('produces one empty slide for an empty note instead of zero slides', () => {
    expect(splitIntoSlides('')).toEqual([''])
  })
})

describe('splitIntoSlides — smart heading split', () => {
  it('splits a heading-only note at each top-level heading', () => {
    expect(splitIntoSlides('# Why\n\nbecause\n\n# How\n\nlike this')).toEqual(['# Why\n\nbecause', '# How\n\nlike this'])
  })

  it('drops down to the section level when a lone title heading cannot divide the note', () => {
    const source = '# Weekly\n\n## Done\n\nshipped\n\n## Next\n\nplanned'
    expect(splitIntoSlides(source)).toEqual(['# Weekly', '## Done\n\nshipped', '## Next\n\nplanned'])
  })

  it('leaves a note with one heading and no sections as a single slide', () => {
    expect(splitIntoSlides('# Title\n\nbody')).toEqual(['# Title\n\nbody'])
  })

  it('starts the deck with the prose above the first heading instead of a blank slide', () => {
    expect(splitIntoSlides('cold open\n\n# Act I\n\nscene\n\n# Act II\n\nscene')).toEqual(['cold open', '# Act I\n\nscene', '# Act II\n\nscene'])
  })

  it('keeps authored separators in charge and ignores heading structure', () => {
    const source = '# A\n\n---\n\n# B\n\n## C\n\n## D'
    expect(splitIntoSlides(source)).toEqual(['# A', '# B\n\n## C\n\n## D'])
  })

  it('does not split on a heading inside a fenced code block', () => {
    const source = '## Real\n\n```\n# fake\n## fake\n```\n\n## Another'
    expect(splitIntoSlides(source)).toEqual(['## Real\n\n```\n# fake\n## fake\n```', '## Another'])
  })

  it('splits CRLF notes the same way', () => {
    expect(splitIntoSlides('# A\r\n\r\nbody\r\n\r\n# B\r\n\r\nbody')).toEqual(['# A\n\nbody', '# B\n\nbody'])
  })

  it('ignores an indented hash run, which markdown reads as a code block not a heading', () => {
    const source = '# A\n\ntext\n\n    # indented\n\n# B'
    expect(splitIntoSlides(source)).toEqual(['# A\n\ntext\n\n    # indented', '# B'])
  })
})

describe('splitIntoSlides — the declared slide-level property', () => {
  it('honours a declared slide-level property over the detected one', () => {
    const source = '---\nslide-level: 1\n---\n\n# A\n\n## B\n\n# C\n\n## D'
    expect(splitIntoSlides(source)).toEqual(['# A\n\n## B', '# C\n\n## D'])
  })

  it('splits at the declared deeper level, headings above it included', () => {
    const source = '---\nslide-level: 2\n---\n\n# A\n\n## B\n\n# C\n\n## D'
    expect(splitIntoSlides(source)).toEqual(['# A', '## B', '# C', '## D'])
  })

  it('accepts the declared level quoted, and falls back to detection when it is unusable', () => {
    const quoted = '---\nslide-level: "2"\n---\n\n# A\n\n## B\n\n## C'
    expect(splitIntoSlides(quoted)).toEqual(['# A', '## B', '## C'])
    const unusable = '---\nslide-level: sometimes\n---\n\n# A\n\n## B\n\n## C'
    expect(splitIntoSlides(unusable)).toEqual(['# A', '## B', '## C'])
  })

  it('reads the level from front matter only, never from a `slide-level` line in the body', () => {
    const source = 'slide-level: 2\n\n# A\n\nbody'
    expect(splitIntoSlides(source)).toEqual([source])
  })
})

describe('findSlideIndexByOffset', () => {
  it('returns 0 for negative or zero offset or single-slide note', () => {
    expect(findSlideIndexByOffset('# Single\n\nSlide', 0)).toBe(0)
    expect(findSlideIndexByOffset('# Single\n\nSlide', -5)).toBe(0)
    expect(findSlideIndexByOffset('# Single\n\nSlide', 10)).toBe(0)
  })

  it('locates current slide based on character offset', () => {
    const doc = '# First\n\n---\n\n# Second\n\n---\n\n# Third'
    expect(findSlideIndexByOffset(doc, 4)).toBe(0)
    expect(findSlideIndexByOffset(doc, 10)).toBe(1)
    expect(findSlideIndexByOffset(doc, 18)).toBe(1)
    expect(findSlideIndexByOffset(doc, 30)).toBe(2)
    expect(findSlideIndexByOffset(doc, 999)).toBe(2)
  })

  it('skips front matter and handles code fences properly', () => {
    const doc = '---\ntitle: test\n---\n\n# Slide 1\n\n```yaml\n---\n```\n\n---\n\n# Slide 2'
    const slide1Pos = doc.indexOf('# Slide 1')
    const yamlSepPos = doc.indexOf('---\n```')
    const slide2Pos = doc.indexOf('# Slide 2')

    expect(findSlideIndexByOffset(doc, 5)).toBe(0)
    expect(findSlideIndexByOffset(doc, slide1Pos)).toBe(0)
    expect(findSlideIndexByOffset(doc, yamlSepPos)).toBe(0)
    expect(findSlideIndexByOffset(doc, slide2Pos)).toBe(1)
  })

  it('keeps a caret before a separator on the slide above it', () => {
    const doc = '# A\n\n---\n\n# B'
    const rule = doc.indexOf('---')
    expect(findSlideIndexByOffset(doc, rule)).toBe(0)
    expect(findSlideIndexByOffset(doc, rule + 1)).toBe(1)
  })
})

describe('findSlideIndexByOffset — heading decks', () => {
  it('maps a caret on a heading onto the slide that heading opens', () => {
    const doc = '# Weekly\n\ntopline\n\n## Done\n\ndone\n\n## Next\n\nnext'
    expect(findSlideIndexByOffset(doc, doc.indexOf('## Done'))).toBe(1)
    expect(findSlideIndexByOffset(doc, doc.indexOf('done'))).toBe(1)
    expect(findSlideIndexByOffset(doc, doc.indexOf('## Next'))).toBe(2)
    expect(findSlideIndexByOffset(doc, doc.indexOf('next'))).toBe(2)
  })

  it('agrees with the deck it indexes, slide for slide', () => {
    const docs = ['# A\n\nx\n\n# B\n\ny', 'cold open\n\n## A\n\nx\n\n## B\n\ny', '---\nslide-level: 2\n---\n\n# A\n\n## B\n\n## C']
    for (const doc of docs) {
      const slides = splitIntoSlides(doc)
      expect(slides.length).toBeGreaterThan(1)
      slides.forEach((slide, index) => {
        expect(findSlideIndexByOffset(doc, doc.indexOf(slide))).toBe(index)
      })
    }
  })
})
