import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import type { ChartElement } from '../types'
import { SlideChartBlock } from './chart-block'

function chart(preset: ChartElement['preset']): ChartElement {
  return {
    id: 'chart-1',
    type: 'chart',
    preset,
    title: 'Monthly',
    data: [
      { label: 'Jan', value: 10 },
      { label: 'Feb', value: 30 },
      { label: 'Mar', value: 20 },
    ],
    x: 0,
    y: 0,
    w: 400,
    h: 300,
  }
}

function draw(el: ChartElement, palette?: string[]) {
  return renderElement(createElement(SlideChartBlock, { el, palette, defaultAccent: '#FF9E8A' }))
}

const marks = {
  bar: '[data-bar]',
  line: '[data-line]',
  pie: '[data-slice]',
  scatter: '[data-point]',
} as const

/** A line carries its dots, so it is the one preset that draws another preset's mark too. */
const drawsAlongside: Partial<Record<keyof typeof marks, (keyof typeof marks)[]>> = {
  line: ['scatter'],
}

describe('a slide chart', () => {
  it('draws the preset it was asked for, not always bars', () => {
    for (const preset of ['bar', 'line', 'pie', 'scatter'] as const) {
      const view = draw(chart(preset))
      expect(view.container.querySelectorAll(marks[preset]).length).toBeGreaterThan(0)
      const shared = drawsAlongside[preset] ?? []
      const others = (Object.keys(marks) as (keyof typeof marks)[]).filter(
        (key) => key !== preset && !shared.includes(key),
      )
      for (const other of others) {
        expect(view.container.querySelectorAll(marks[other]).length, `${preset} drew ${other}`).toBe(0)
      }
      view.unmount()
    }
  })

  it('colours the marks from the deck palette', () => {
    const view = draw(chart('bar'), ['#111111', '#222222'])
    const bars = [...view.container.querySelectorAll('[data-bar]')].map((bar) =>
      bar.getAttribute('fill'),
    )
    expect(bars).toEqual(['#111111', '#222222', '#111111'])
    view.unmount()
  })

  it('falls back to the element colour when the deck names no palette', () => {
    const view = draw({ ...chart('pie'), color: '#ABCDEF' })
    expect(view.container.querySelector('[data-slice]')?.getAttribute('fill')).toBe('#ABCDEF')
    view.unmount()
  })

  it('names itself for a reader who cannot see the marks', () => {
    const view = draw(chart('line'))
    expect(view.container.querySelector('svg')?.getAttribute('aria-label')).toBe('Monthly')
    view.unmount()
  })
})
