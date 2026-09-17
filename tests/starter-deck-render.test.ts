/**
 * The deck this app inserts as its own slides showcase is content it ships, so a change here
 * would otherwise only surface when somebody opened the template. Its charts carry the
 * format's chart-engine `option` and no `data` list, which is the shape that used to take
 * the whole slide down with a TypeError mid-render. Every chart element now has to draw the
 * series its option states — a frame with no mark in it is the empty box this deck must
 * never show — and nothing may be announced or thrown on.
 */
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import starterDeck from '../src/client/editor/starter-showcase.json'
import { parseSlidesBody } from '../src/client/lib/markdown/slides/body'
import { SlidesCanvas } from '../src/client/lib/markdown/slides/ui'
import { renderElement } from '../src/client/lib/test-render'

describe('the showcase deck this app ships', () => {
  it('renders every slide, with every chart drawn from the option it carries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parsed = parseSlidesBody(JSON.stringify(starterDeck))
    if (!parsed.ok) throw new Error(parsed.error)
    const chartElements = parsed.data.slides.flatMap((slide) =>
      slide.elements.filter((element) => element.type === 'chart'),
    )
    expect(chartElements.length).toBeGreaterThan(0)

    let drawn = 0
    for (const slide of parsed.data.slides) {
      const view = renderElement(
        createElement(SlidesCanvas, {
          slide,
          theme: parsed.data.theme,
          page: parsed.data.size,
          assets: parsed.data.assets,
        }),
      )
      for (const frame of view.container.querySelectorAll('[data-slide-chart]')) {
        drawn += 1
        expect(frame.querySelector('[data-bar], [data-line], [data-slice], [data-point]')).not.toBeNull()
      }
      expect(view.container.querySelector('[data-slide-unsupported="chart"]')).toBeNull()
      view.unmount()
    }
    expect(drawn).toBe(chartElements.length)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
