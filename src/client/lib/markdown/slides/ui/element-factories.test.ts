import { describe, expect, it } from 'vitest'
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
    const rect = createDefaultShape('rect', '#3B82F6')
    expect(rect.type).toBe('shape')
    expect(rect.shape).toBe('rect')
    expect(rect.fill).toBe('#3B82F6')

    const card = createDefaultShape('card', '#1E293B')
    expect(card.shape).toBe('card')
    expect(card.radius).toBe(12)
  })

  it('creates default image element with fallback source', () => {
    const img = createDefaultImage()
    expect(img.type).toBe('image')
    expect(img.src).toContain('unsplash.com')
    expect(img.w).toBe(480)
    expect(img.h).toBe(300)
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
