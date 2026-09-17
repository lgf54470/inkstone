import { describe, expect, it } from 'vitest'
import {
  getChartColor,
  getElementBoxStyle,
  getShapeStyle,
  getTableStyle,
  getTextStyle,
  VIRTUAL_CANVAS_HEIGHT,
  VIRTUAL_CANVAS_WIDTH,
} from './canvas-helpers'
import type {
  ChartElement,
  ShapeElement,
  TableElement,
  TextElement,
} from '../types'

describe('canvas dimensions & layout', () => {
  it('has standard 16:9 virtual canvas dimensions', () => {
    expect(VIRTUAL_CANVAS_WIDTH).toBe(1280)
    expect(VIRTUAL_CANVAS_HEIGHT).toBe(720)
  })

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

    const chart: ChartElement = {
      id: 'c1',
      type: 'chart',
      preset: 'bar',
      data: [],
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      color: '#ff0000',
    }
    expect(getChartColor(chart, '#00ff00')).toBe('#ff0000')
  })
})
