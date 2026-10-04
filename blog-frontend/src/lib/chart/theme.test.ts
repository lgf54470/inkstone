// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { chartAccent, chartPalette, chartPaletteKey, chartRamp } from './accent.ts'
import { applyChartPalette, echartsTheme } from './theme.ts'

/**
 * The colours a post's chart paints with are the site's accent, read when the chart is drawn.
 *
 * jsdom has no stylesheet, so the accent is written onto the root as an inline custom property — the
 * same way the app's own palette tests reach it. Whether the library finally *renders* those colours is
 * a real-browser question (echarts rejects an oklch string it cannot parse in jsdom), so what is pinned
 * here is the value the app hands it.
 */

const CINNABAR = 'oklch(49% 0.15 30)'
const INDIGO = 'oklch(62% 0.16 252)'

function setAccent(value: string | null): void {
  if (value === null) document.documentElement.style.removeProperty('--accent')
  else document.documentElement.style.setProperty('--accent', value)
}

afterEach(() => setAccent(null))

describe('the accent a chart reads', () => {
  it('is the site token, and the first series is that colour itself', () => {
    setAccent(CINNABAR)
    expect(chartAccent()).toEqual({ l: 0.49, c: 0.15, h: 30 })
    const palette = chartPalette(false)
    expect(palette[0]).toBe(CINNABAR)
    expect(new Set(palette).size).toBe(palette.length)
  })

  it('moves when the site moves, without anything being re-imported', () => {
    setAccent(CINNABAR)
    const warm = chartPalette(false)
    setAccent(INDIGO)
    const cold = chartPalette(false)
    expect(cold[0]).toBe(INDIGO)
    expect(cold[1]).not.toBe(warm[1])
  })

  it('falls back to the shipped accent with no stylesheet in reach', () => {
    setAccent(null)
    expect(chartAccent()).toEqual({ l: 0.49, c: 0.15, h: 30 })
  })

  it('is in the key a drawn chart caches under, so a moved accent repaints rather than lingers', () => {
    setAccent(CINNABAR)
    const warm = chartPaletteKey(false)
    setAccent(INDIGO)
    expect(chartPaletteKey(false)).not.toBe(warm)
    expect(chartPaletteKey(true)).not.toBe(chartPaletteKey(false))
  })
})

describe('the theme handed to echarts', () => {
  it('carries the accent ramp rather than a fixed rainbow', () => {
    setAccent(INDIGO)
    expect(echartsTheme(false).color).toEqual(chartPalette(false))
    expect(echartsTheme(true).color).toEqual(chartPalette(true))
  })

  it('fills the ramp into a continuous scale the note left uncoloured', () => {
    setAccent(CINNABAR)
    const filled = applyChartPalette({ visualMap: { min: 0, max: 10 } }, false) as { visualMap: { inRange: { color: string[] } } }
    expect(filled.visualMap.inRange.color).toEqual(chartRamp(false))
    expect(filled.visualMap.inRange.color).toHaveLength(3)
  })

  it('leaves a range the note stated alone', () => {
    const stated = { visualMap: { inRange: { color: ['#fff', '#000'] } } }
    expect(applyChartPalette(stated, false)).toEqual(stated)
    expect(applyChartPalette(null, false)).toBeNull()
    expect(applyChartPalette([1], false)).toEqual([1])
  })
})
