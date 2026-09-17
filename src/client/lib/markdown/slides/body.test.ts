import { describe, expect, it } from 'vitest'
import {
  applySlidesBodyAtFence,
  detectSlidesMode,
  parseSlidesBody,
  serializeSlides,
  slidesFenceRange,
} from './body'
import type { BentoDoc } from './types'

describe('detectSlidesMode', () => {
  it('detects json mode when body starts with curly brace', () => {
    expect(detectSlidesMode('{"format":"bento/slides"}')).toBe('json')
    expect(detectSlidesMode('  \n  { "slides": [] }')).toBe('json')
  })

  it('detects outline mode for markdown headings and text', () => {
    expect(detectSlidesMode('# Slide 1\nContent')).toBe('outline')
    expect(detectSlidesMode('Just plain text')).toBe('outline')
    expect(detectSlidesMode('')).toBe('outline')
  })
})

describe('parseSlidesBody', () => {
  it('parses outline mode correctly', () => {
    const markdown = '# Welcome to Bento\nSubtitle text here\n- Feature 1\n- Feature 2\n[bg: #112233]\n---\n# Slide 2\nMore info'
    const result = parseSlidesBody(markdown)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('parse failed')
    expect(result.mode).toBe('outline')
    expect(result.data.slides.length).toBe(2)
    expect(result.data.slides[0]?.title).toBe('Welcome to Bento')
    expect(result.data.slides[0]?.background).toBe('#112233')
    expect(result.data.slides[1]?.title).toBe('Slide 2')
  })

  it('parses valid json mode correctly', () => {
    const jsonStr = JSON.stringify({
      format: 'bento/slides',
      version: 1,
      title: 'Custom Deck',
      size: { width: 1280, height: 720 },
      theme: { background: '#123456', color: '#ffffff', accent: '#3b82f6' },
      slides: [
        {
          id: 's1',
          title: 'First',
          elements: [
            {
              id: 'e1',
              type: 'text',
              html: 'Hello world',
              x: 100,
              y: 100,
              w: 400,
              h: 100,
            },
          ],
        },
      ],
    })

    const result = parseSlidesBody(jsonStr)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('parse failed')
    expect(result.mode).toBe('json')
    expect(result.data.title).toBe('Custom Deck')
    expect(result.data.slides.length).toBe(1)
    expect(result.data.slides[0]?.elements.length).toBe(1)
  })

  it('handles invalid json gracefully with error result', () => {
    const invalidJson = '{ not a valid json'
    const result = parseSlidesBody(invalidJson)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeDefined()
    }
  })
})

describe('serializeSlides', () => {
  it('serializes in outline mode', () => {
    const doc: BentoDoc = {
      format: 'bento/slides',
      version: 1,
      title: 'Test Deck',
      size: { width: 1280, height: 720 },
      theme: { background: '#000000', color: '#ffffff', accent: '#3b82f6' },
      slides: [
        {
          id: 's1',
          title: 'Hello',
          elements: [
            {
              id: 't1',
              type: 'text',
              html: 'Paragraph content',
              x: 50,
              y: 50,
              w: 200,
              h: 100,
              fontSize: 20,
            },
          ],
        },
      ],
    }

    const output = serializeSlides(doc, 'outline')
    expect(output).toContain('# Hello')
    expect(output).toContain('Paragraph content')
  })

  it('serializes in json mode', () => {
    const doc: BentoDoc = {
      format: 'bento/slides',
      version: 1,
      title: 'Json Deck',
      size: { width: 1280, height: 720 },
      theme: { background: '#111111', color: '#ffffff', accent: '#3b82f6' },
      slides: [],
    }

    const output = serializeSlides(doc, 'json')
    const parsed = JSON.parse(output)
    expect(parsed.title).toBe('Json Deck')
    expect(parsed.format).toBe('bento/slides')
  })
})

const FOREIGN_FIELDS_BODY = JSON.stringify({
  format: 'bento/slides',
  version: 1,
  docId: 'doc-7f1c',
  modified: '2026-09-17T08:00:00.000Z',
  title: 'Ported deck',
  size: { width: 1600, height: 900, unit: 'px' },
  present: { slideNumber: false, progress: false, controls: true, numberHidden: true },
  assets: { grain: 'data:image/svg+xml;base64,PHN2Zy8+', logo: 'data:image/png;base64,AAA' },
  fonts: [{ family: 'Fraunces', asset: 'builtin:fraunces-900', weight: '900' }],
  layouts: [
    { id: 'layout-two-col', name: 'Two columns', background: '#FFFFFF', transition: 'fade', notes: '', elements: [] },
  ],
  theme: {
    background: '#0D1B2E',
    color: '#FFFFFF',
    accent: '#FF9E8A',
    fontFamily: "'Instrument Sans', sans-serif",
    chartPalette: ['#5E7699', '#FF9E8A'],
    codePalette: { c: '#6B7F8F', k: '#5B8DEF' },
  },
  slides: [
    {
      id: 'slide-1',
      name: 'Opening',
      background: '#0D1B2E',
      transition: 'morph',
      notes: 'Welcome',
      themeRefs: { background: 'accent' },
      elements: [
        {
          id: 'sd-glow',
          type: 'svg',
          asset: 'grain',
          x: 0,
          y: 0,
          w: 1600,
          h: 900,
          morphId: 'glow',
          fx: { enter: 'fade-up', step: 1 },
        },
      ],
    },
  ],
})

describe('lossless round trip', () => {
  it('keeps the fields the model does not name', () => {
    const result = parseSlidesBody(FOREIGN_FIELDS_BODY)
    if (!result.ok) throw new Error(`parse failed: ${result.error}`)
    expect(result.data.present).toEqual({
      slideNumber: false,
      progress: false,
      controls: true,
      numberHidden: true,
    })
    expect(result.data.assets).toEqual({
      grain: 'data:image/svg+xml;base64,PHN2Zy8+',
      logo: 'data:image/png;base64,AAA',
    })
    expect(result.data.theme.codePalette).toEqual({ c: '#6B7F8F', k: '#5B8DEF' })
    expect(result.data.theme.chartPalette).toEqual(['#5E7699', '#FF9E8A'])
  })

  it('writes back exactly what it was given, adding nothing and dropping nothing', () => {
    const result = parseSlidesBody(FOREIGN_FIELDS_BODY)
    if (!result.ok) throw new Error(`parse failed: ${result.error}`)
    expect(JSON.parse(serializeSlides(result.data, 'json'))).toEqual(JSON.parse(FOREIGN_FIELDS_BODY))
  })

  it('round-trips an asset reference so an edited deck keeps its pictures', () => {
    const result = parseSlidesBody(FOREIGN_FIELDS_BODY)
    if (!result.ok) throw new Error(`parse failed: ${result.error}`)
    const elements = result.data.slides[0]?.elements ?? []
    expect(elements[0]).toMatchObject({ type: 'svg', asset: 'grain' })
    expect(result.data.assets?.grain).toBe('data:image/svg+xml;base64,PHN2Zy8+')
  })

  it('seeds a starter slide when the body carries none', () => {
    const result = parseSlidesBody(JSON.stringify({ title: 'Empty' }))
    if (!result.ok) throw new Error(`parse failed: ${result.error}`)
    expect(result.data.slides).toHaveLength(1)
    expect(result.data.slides[0]?.elements[0]).toMatchObject({ type: 'text', html: 'Empty' })
  })
})

describe('applySlidesBodyAtFence & slidesFenceRange', () => {
  it('locates and updates slides fence content', () => {
    const doc = 'Intro text\n\n```bento-slides\n# Old Slide\n```\n\nOutro text'
    const target = { line: 2, body: '# Old Slide' }
    const range = slidesFenceRange(doc, target)
    expect(range).not.toBeNull()

    const updated = applySlidesBodyAtFence(doc, target, '# New Slide Content')
    expect(updated).toBe('Intro text\n\n```bento-slides\n# New Slide Content\n```\n\nOutro text')
  })

  it('works with ppt fence language', () => {
    const doc = '```ppt\n# Slide A\n```'
    const target = { line: 0, body: '# Slide A' }
    const updated = applySlidesBodyAtFence(doc, target, '# Slide B')
    expect(updated).toBe('```ppt\n# Slide B\n```')
  })
})
