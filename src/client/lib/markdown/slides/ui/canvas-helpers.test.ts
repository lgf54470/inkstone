import { describe, expect, it } from 'vitest'
import {
  elementIdsInRect,
  elementPointerEvents,
  getElementBoxStyle,
  getShapeStyle,
  getTableStyle,
  getTextStyle,
  isBackgroundLayer,
  rectFromPoints,
} from './canvas-helpers'
import { DEFAULT_PAGE_SIZE } from '../page'
import type {
  MediaElement,
  ShapeElement,
  TableElement,
  TextElement,
} from '../types'

const DEFAULT_PAGE = DEFAULT_PAGE_SIZE

function clip(): MediaElement {
  return { id: 'm1', type: 'media', kind: 'video', src: 'https://example.com/a.mp4', x: 0, y: 0, w: 100, h: 100 }
}

describe('the rubber band', () => {
  const page = DEFAULT_PAGE
  const backdrop: ShapeElement = { id: 'backdrop', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1280, h: 720, fill: '#FFF' }
  const one: TextElement = { id: 'one', type: 'text', html: 'x', fontSize: 20, x: 100, y: 100, w: 100, h: 50 }
  const two: TextElement = { id: 'two', type: 'text', html: 'y', fontSize: 20, x: 400, y: 400, w: 100, h: 50 }

  it('describes the same rectangle whichever way the band was drawn', () => {
    expect(rectFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({ x: 10, y: 20, w: 30, h: 40 })
    expect(rectFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 30, h: 40 })
  })

  it('catches what the band overlaps, in the page order, and never the backdrop', () => {
    const band = rectFromPoints({ x: 80, y: 80 }, { x: 450, y: 450 })
    expect(elementIdsInRect([backdrop, one, two], band, page)).toEqual(['one', 'two'])
  })

  it('touches only what the band reaches, and reports nothing for a band over empty page', () => {
    const around = rectFromPoints({ x: 90, y: 90 }, { x: 210, y: 200 })
    expect(elementIdsInRect([backdrop, one, two], around, page)).toEqual(['one'])

    const empty = rectFromPoints({ x: 800, y: 80 }, { x: 900, y: 200 })
    expect(elementIdsInRect([backdrop, one, two], empty, page)).toEqual([])
  })
})

describe('pointer input', () => {
  it('keeps the background layer inert on the canvas until it is selected', () => {
    const state = { editable: true, isBackground: true }
    expect(elementPointerEvents(clip(), { ...state, isSelected: false })).toBe('none')
    expect(elementPointerEvents(clip(), { ...state, isSelected: true })).toBe('auto')
  })

  it('gives the show only the clips, which are the elements with something to press', () => {
    const state = { editable: false, isBackground: false, isSelected: false }
    expect(elementPointerEvents(clip(), state)).toBe('auto')
    expect(elementPointerEvents({ ...clip(), type: 'text', html: 'x', fontSize: 20 } as TextElement, state)).toBe('none')
  })
})

describe('canvas dimensions & layout', () => {
  it('computes box position, size and transformation', () => {
    const el: TextElement = {
      id: 't1',
      type: 'text',
      x: 100,
      y: 150,
      w: 400,
      h: 200,
      rotation: 45,
      opacity: 0.8,
      html: 'Sample',
      fontSize: 24,
    }
    const style = getElementBoxStyle(el)
    expect(style.left).toBe('100px')
    expect(style.top).toBe('150px')
    expect(style.width).toBe('400px')
    expect(style.height).toBe('200px')
    expect(style.transform).toBe('rotate(45deg)')
    expect(style.opacity).toBe(0.8)
  })
})

describe('text styling', () => {
  it('uses serif display font and tight line height for headlines', () => {
    const headline: TextElement = {
      id: 'h1',
      type: 'text',
      x: 0,
      y: 0,
      w: 500,
      h: 100,
      html: 'Big Title',
      fontSize: 48,
    }
    const style = getTextStyle(headline)
    expect(style.fontSize).toBe('48px')
    expect(style.fontWeight).toBe(900)
    expect(style.fontFamily).toContain('Fraunces')
    expect(style.lineHeight).toBe(1.05)
  })
})

describe('shape elements', () => {
  it('handles gradient and shadow for shape elements', () => {
    const shape: ShapeElement = {
      id: 's1',
      type: 'shape',
      shape: 'card',
      fill: '#000000',
      x: 10,
      y: 10,
      w: 200,
      h: 200,
      fillGradient: {
        angle: 90,
        stops: [
          { color: '#000000', at: 0 },
          { color: '#ffffff', at: 1 },
        ],
      },
      shadow: [{ x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.2)' }],
    }
    const style = getShapeStyle(shape)
    expect(style.borderRadius).toBe('16px')
    expect(style.background).toBe('linear-gradient(90deg, #000000 0%, #ffffff 100%)')
    expect(style.boxShadow).toContain('rgba(0,0,0,0.2)')
  })
})

describe('table and chart elements', () => {
  it('formats table and chart styles correctly', () => {
    const tbl: TableElement = {
      id: 'tb1',
      type: 'table',
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      columns: [],
      rows: [],
      style: { radius: 10 },
    }
    expect(getTableStyle(tbl).borderRadius).toBe('10px')
  })
})

describe('isBackgroundLayer', () => {
  it('identifies full-bleed elements and background textures', () => {
    const fullBleed: ShapeElement = {
      id: 'bg-1',
      type: 'shape',
      shape: 'rect',
      fill: 'transparent',
      x: 0,
      y: 0,
      w: 1280,
      h: 720,
    }
    expect(isBackgroundLayer(fullBleed, DEFAULT_PAGE)).toBe(true)

    const glow: ShapeElement = {
      id: 'sd-glow',
      type: 'shape',
      shape: 'rect',
      fill: 'transparent',
      x: 0,
      y: 0,
      w: 500,
      h: 500,
    }
    expect(isBackgroundLayer(glow, DEFAULT_PAGE)).toBe(true)

    const normalShape: ShapeElement = {
      id: 's-normal',
      type: 'shape',
      shape: 'card',
      fill: '#3B82F6',
      x: 100,
      y: 100,
      w: 300,
      h: 200,
    }
    expect(isBackgroundLayer(normalShape, DEFAULT_PAGE)).toBe(false)
  })

  it('measures page coverage against the deck own page', () => {
    const fourThree: ShapeElement = {
      id: 'bg-1',
      type: 'shape',
      shape: 'rect',
      fill: 'transparent',
      x: 0,
      y: 0,
      w: 1024,
      h: 768,
    }
    expect(isBackgroundLayer(fourThree, { width: 1024, height: 768 })).toBe(true)
    expect(isBackgroundLayer(fourThree, { width: 1920, height: 1080 })).toBe(false)
  })
})

