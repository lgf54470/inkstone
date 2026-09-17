/**
 * The deck this app inserts as its own slides showcase is content it ships, so a change here
 * would otherwise only surface when somebody opened the template. Its charts carry the
 * format's chart-engine `option` and no `data` list, which is the shape that used to take
 * the whole slide down with a TypeError mid-render; every chart element now has to end up
 * either drawn or announced, never missing and never thrown on.
 */
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import starterDeck from '../src/client/editor/starter-showcase.json'
import { parseSlidesBody } from '../src/client/lib/markdown/slides/body'
import { SlidesCanvas } from '../src/client/lib/markdown/slides/ui'
import { renderElement } from '../src/client/lib/test-render'

describe('the showcase deck this app ships', () => {
  it('renders every slide, with every chart element accounted for', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const parsed = parseSlidesBody(JSON.stringify(starterDeck))
    if (!parsed.ok) throw new Error(parsed.error)
    const chartElements = parsed.data.slides.flatMap((slide) =>
      slide.elements.filter((element) => element.type === 'chart'),
    )
    expect(chartElements.length).toBeGreaterThan(0)

    let announced = 0
    for (const slide of parsed.data.slides) {
      const view = renderElement(
        createElement(SlidesCanvas, {
          slide,
          theme: parsed.data.theme,
          page: parsed.data.size,
          assets: parsed.data.assets,
        }),
      )
      announced += view.container.querySelectorAll('[data-slide-unsupported="chart"]').length
      view.unmount()
    }
    expect(announced).toBe(chartElements.length)
    warn.mockRestore()
  })
})
