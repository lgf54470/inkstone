import { describe, expect, it } from 'vitest'
import { imageBoxForAspect } from '../image-asset'
import {
  createDefaultChart,
  createDefaultCode,
  createDefaultImage,
  createDefaultShape,
  createDefaultTable,
  createDefaultText,
} from './element-factories'

describe('basic element factories', () => {
  it('creates default text element with valid dimensions', () => {
    const el = createDefaultText()
    expect(el.type).toBe('text')
    expect(el.id).toMatch(/^text-/)
    expect(el.w).toBeGreaterThan(0)
    expect(el.h).toBeGreaterThan(0)
    expect(el.fontSize).toBe(28)
  })

  it('creates default shape elements for all supported types', () => {
    const shapes = [
      'rect',
      'card',
      'rounded',
      'circle',
      'ellipse',
      'triangle',
      'arrow',
      'arrow2',
      'line',
      'curve',
      'connector',
      'curve-connector',
      'free',
      'poly',
    ] as const

    for (const shapeType of shapes) {
      const shape = createDefaultShape(shapeType, '#3B82F6')
      expect(shape.type).toBe('shape')
      expect(shape.shape).toBe(shapeType)
      if (shapeType === 'line' || shapeType === 'arrow' || shapeType === 'arrow2') {
        expect(shape.fill).toBe('transparent')
        expect(shape.stroke).toBe('#3B82F6')
      } else {
        expect(shape.fill).toBe('#3B82F6')
      }
    }
  })

})

describe('image factory', () => {
  it('points at the chosen picture and takes the shape it was measured at', () => {
    const img = createDefaultImage('/api/files/abc/content', { w: 320, h: 180 })
    expect(img.type).toBe('image')
    expect(img.src).toBe('/api/files/abc/content')
    expect({ w: img.w, h: img.h }).toEqual({ w: 320, h: 180 })
  })

  it('falls back to the same landscape box the unknown-size path uses', () => {
    const img = createDefaultImage('/api/files/abc/content')
    expect({ w: img.w, h: img.h }).toEqual(imageBoxForAspect())
  })
})

describe('rich element factories', () => {
  it('creates default table element with headers and sample rows', () => {
    const table = createDefaultTable()
    expect(table.type).toBe('table')
    expect(table.columns.length).toBe(3)
    expect(table.rows.length).toBe(3)
    expect(table.rows[0]?.cells[0]?.bold).toBe(true)
  })

  it('creates default chart element for supported presets', () => {
    const barChart = createDefaultChart('bar')
    expect(barChart.type).toBe('chart')
    expect(barChart.preset).toBe('bar')
    expect(barChart.data.length).toBe(4)

    const lineChart = createDefaultChart('line')
    expect(lineChart.preset).toBe('line')
  })

  it('creates default code element with typescript sample', () => {
    const code = createDefaultCode()
    expect(code.type).toBe('code')
    expect(code.lang).toBe('typescript')
    expect(code.code).toContain('loadBentoSlides')
  })
})
