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
