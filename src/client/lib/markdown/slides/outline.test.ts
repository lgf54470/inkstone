import { describe, expect, it } from 'vitest'
import { outlineRoundTrips, parseSlidesOutline, serializeSlidesOutline } from './outline'
import type { BentoDoc, SlideElement } from './types'

describe('parseSlidesOutline', () => {
  it('parses basic slides split by horizontal rule', () => {
    const markdown = `# Title 1
Content for slide 1

---

# Title 2
Content for slide 2`

    const doc = parseSlidesOutline(markdown)
    expect(doc.slides.length).toBe(2)
    expect(doc.slides[0]?.title).toBe('Title 1')
    expect(doc.slides[1]?.title).toBe('Title 2')
  })

  it('parses bullet items into card elements', () => {
    const markdown = `# Features Deck
- Fast and reliable
- Local-first architecture
- Beautiful themes`

    const doc = parseSlidesOutline(markdown)
    expect(doc.slides.length).toBe(1)
    const elements = doc.slides[0]?.elements ?? []
    expect(elements.some((e) => e.type === 'text' && e.html.includes('Fast and reliable'))).toBe(true)
    expect(elements.some((e) => e.type === 'text' && e.html.includes('Local-first architecture'))).toBe(true)
  })

  it('parses images, code blocks, and markdown tables', () => {
    const markdown = `# Media and Code
![Diagram](https://example.com/photo.png)

\`\`\`typescript
const greeting = "hello";
\`\`\`

| Header A | Header B |
| --- | --- |
| Cell 1 | Cell 2 |`

    const doc = parseSlidesOutline(markdown)
    const elements = doc.slides[0]?.elements ?? []
    expect(elements.some((e) => e.type === 'image')).toBe(true)
    expect(elements.some((e) => e.type === 'code')).toBe(true)
    expect(elements.some((e) => e.type === 'table')).toBe(true)
  })

  it('extracts metadata tags [bg: ...], [transition: ...], and [notes: ...]', () => {
    const markdown = `# Styled Slide
Slide text
[bg: #09122c] [transition: morph] [notes: Speaker notes for this slide]`

    const doc = parseSlidesOutline(markdown)
    const slide = doc.slides[0]
    expect(slide?.background).toBe('#09122c')
    expect(slide?.transition).toBe('morph')
    expect(slide?.notes).toBe('Speaker notes for this slide')
  })
})

const SHAPE_ELEMENT: SlideElement = {
  id: 'shape-1',
  type: 'shape',
  shape: 'rect',
  fill: '#FF9E8A',
  x: 100,
  y: 300,
  w: 200,
  h: 120,
}

/** Every edit that leaves the dialect behind: it is the list write.ts must refuse to flatten. */
function editsBeyondTheDialect(doc: BentoDoc): BentoDoc[] {
  const slide = doc.slides[0]
  if (!slide) throw new Error('missing slide')
  return [
    { ...doc, slides: [{ ...slide, elements: [...slide.elements, SHAPE_ELEMENT] }] },
    {
      ...doc,
      slides: [{ ...slide, elements: slide.elements.map((el) => (el.id === 'title-1' ? { ...el, x: 300 } : el)) }],
    },
    { ...doc, assets: { logo: 'data:image/png;base64,AAA' } },
    { ...doc, theme: { ...doc.theme, accent: '#00FF00' } },
  ]
}

describe('outlineRoundTrips', () => {
  it('accepts a deck that still fits the dialect', () => {
    expect(outlineRoundTrips(parseSlidesOutline('# Title\n- one\n- two\n\n---\n\n# Second\nBody'))).toBe(true)
  })

  it('accepts an edited paragraph the serializer still writes verbatim', () => {
    const doc = parseSlidesOutline('# Title\nBody text')
    const slide = doc.slides[0]
    if (!slide) throw new Error('missing slide')
    const edited: BentoDoc = {
      ...doc,
      slides: [
        {
          ...slide,
          elements: slide.elements.map((el) =>
            el.id === 'body-1' && el.type === 'text' ? { ...el, html: '<p>Edited</p>' } : el,
          ),
        },
      ],
    }
    expect(outlineRoundTrips(edited)).toBe(true)
  })

  it('rejects a shape, a moved element, an embedded asset and a custom theme', () => {
    const candidates = editsBeyondTheDialect(parseSlidesOutline('# Title\nBody text'))
    expect(candidates.map((candidate) => outlineRoundTrips(candidate))).toEqual([
      false,
      false,
      false,
      false,
    ])
  })
})

describe('serializeSlidesOutline', () => {
  it('round-trips document to outline markdown text', () => {
    const doc: BentoDoc = {
      format: 'bento/slides',
      version: 1,
      title: 'Presentation',
      size: { width: 1280, height: 720 },
      theme: { background: '#000000', color: '#ffffff', accent: '#3b82f6' },
      slides: [
        {
          id: 'slide-1',
          title: 'Opening Slide',
          background: '#0a0a0a',
          transition: 'fade',
          notes: 'Welcome everyone',
          elements: [
            {
              id: 'el-1',
              type: 'text',
              html: 'Welcome message',
              x: 100,
              y: 200,
              w: 600,
              h: 80,
              fontSize: 20,
            },
          ],
        },
        {
          id: 'slide-2',
          title: 'Second Slide',
          elements: [],
        },
      ],
    }

    const outline = serializeSlidesOutline(doc)
    expect(outline).toContain('# Opening Slide')
    expect(outline).toContain('Welcome message')
    expect(outline).toContain('[bg: #0a0a0a]')
    expect(outline).toContain('[transition: fade]')
    expect(outline).toContain('[notes: Welcome everyone]')
    expect(outline).toContain('---')
    expect(outline).toContain('# Second Slide')
  })
})
