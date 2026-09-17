/**
 * What happens when a note holds a deck this build did not author: a document in the
 * format's own shape, with the element kinds, slide fields and document tables an export
 * carries. Two things must hold, and neither is visible from the editor's side. The model
 * must carry every field through parse → edit → write (a field it drops is gone from the
 * note the next time anything is edited), and every element must DRAW SOMETHING — a deck
 * whose picture is missing an element looks finished, so the failure has no symptom until
 * the reader compares it with the original.
 */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { parseSlidesBody, serializeSlides } from '../src/client/lib/markdown/slides/body'
import { SlidesCanvas } from '../src/client/lib/markdown/slides/ui'
import { renderElement } from '../src/client/lib/test-render'
import type { BentoDoc } from '../src/client/lib/markdown/slides/types'

const OFFICIAL_DECK = JSON.stringify({
  format: 'bento/slides',
  version: 1,
  docId: 'doc-9a2f',
  modified: '2026-09-16T15:36:50.000Z',
  title: 'Exported deck',
  size: { width: 1600, height: 900 },
  present: { slideNumber: true, progress: true, controls: true, numberHidden: false, morphSeconds: 0.5 },
  meta: { author: 'The Bento authors', subject: 'Interop' },
  assets: { clip: 'data:video/mp4;base64,AAA', photo: 'data:image/png;base64,AAA' },
  fonts: [{ family: 'Fraunces', asset: 'builtin:fraunces-900', weight: '900' }],
  layouts: [{ id: 'layout-blank', name: 'Blank', background: '#FFFFFF', transition: 'fade', elements: [] }],
  theme: {
    background: '#0D1B2E',
    color: '#FFFFFF',
    accent: '#FF9E8A',
    headingFamily: 'Fraunces',
    chartPalette: ['#5E7699', '#FF9E8A'],
    codePalette: { c: '#6B7F8F', k: '#5B8DEF' },
  },
  slides: [
    {
      id: 'slide-1',
      name: 'Opening',
      stateOf: 'slide-0',
      hover: { focusGroup: 'cards' },
      comments: [{ id: 'c-1', text: 'Swap the clip', author: 'Ada', elementId: 'clip-1', resolved: false }],
      elements: [
        {
          id: 'clip-1',
          type: 'media',
          kind: 'video',
          src: 'asset:clip',
          autoplay: false,
          controls: true,
          morphId: 'clip',
          fx: { enter: 'fade-up', order: 1, step: 1 },
          link: 'https://bento.page/slides',
          groupId: 'cards',
        },
        {
          id: 'board-1',
          type: 'embed',
          app: 'bento/dash',
          url: 'https://bento.page/dash/',
          live: false,
        },
        {
          id: 'wave-1',
          type: 'shape',
          shape: 'path',
          d: 'M 0 40 C 20 0, 60 0, 80 40',
          pathBox: { x: 0, y: 0, w: 80, h: 40 },
          fill: 'none',
          stroke: '#FF9E8A',
          strokeWidth: 3,
        },
        {
          id: 'shot-1',
          type: 'image',
          src: 'asset:photo',
          crop: { x: 0.25, y: 0.75, scale: 1.5 },
          radius: 12,
        },
        {
          id: 'snippet-1',
          type: 'code',
          content: 'const deck = load()',
          grammarName: 'typescript',
          fontSize: 15,
        },
        { id: 'newer-1', type: 'timeline', x: 20, y: 20, w: 200, h: 80 },
      ],
    },
  ],
})

function parse(): BentoDoc {
  const result = parseSlidesBody(OFFICIAL_DECK)
  if (!result.ok) throw new Error(`parse failed: ${result.error}`)
  return result.data
}

function draw(doc: BentoDoc) {
  const slide = doc.slides[0]!
  return renderElement(
    createElement(SlidesCanvas, { slide, theme: doc.theme, page: doc.size, assets: doc.assets }),
  )
}

describe('a deck in the format own shape', () => {
  it('parses, and names the fields the writer would otherwise drop', () => {
    const doc = parse()
    expect(doc.docId).toBe('doc-9a2f')
    expect(doc.modified).toBe('2026-09-16T15:36:50.000Z')
    expect(doc.meta?.author).toBe('The Bento authors')
    expect(doc.fonts?.[0]?.asset).toBe('builtin:fraunces-900')
    expect(doc.layouts).toHaveLength(1)
    expect(doc.theme.headingFamily).toBe('Fraunces')
    expect(doc.theme.codePalette?.k).toBe('#5B8DEF')
    expect(doc.present?.morphSeconds).toBe(0.5)
    expect(doc.slides[0]?.name).toBe('Opening')
    expect(doc.slides[0]?.stateOf).toBe('slide-0')
    expect(doc.slides[0]?.hover).toEqual({ focusGroup: 'cards' })
    expect(doc.slides[0]?.comments?.[0]?.text).toBe('Swap the clip')
  })

  it('writes back exactly what it was given, tables and all', () => {
    const doc = parse()
    expect(JSON.parse(serializeSlides(doc, 'json'))).toEqual(JSON.parse(OFFICIAL_DECK))
  })

  it('draws something for every element it understands', () => {
    const view = draw(parse())
    expect(view.container.querySelector('[data-slide-media="video"]')).not.toBeNull()
    expect(view.container.querySelector('[data-slide-embed="link"] a')?.getAttribute('href')).toBe(
      'https://bento.page/dash/',
    )
    expect(view.container.querySelector('svg path')?.getAttribute('d')).toBe('M 0 40 C 20 0, 60 0, 80 40')
    // The picture is bytes the file carries, so what the canvas loads is the asset behind
    // the key rather than the key itself (which would be an image the browser cannot fetch).
    const picture = view.container.querySelector('img')
    expect(picture?.getAttribute('src')).toBe('data:image/png;base64,AAA')
    expect(picture?.style.position).toBe('absolute')
    expect(view.container.querySelector('code')).not.toBeNull()
    view.unmount()
  })

  it('says which element it could not draw rather than leaving a hole', () => {
    const view = draw(parse())
    expect(view.container.querySelector('[data-slide-unsupported="timeline"]')).not.toBeNull()
    view.unmount()
  })
})
