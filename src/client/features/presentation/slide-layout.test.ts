import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { createFenceBodies } from '../../lib/markdown/fence-bodies'
import { SlideProse } from './slide-prose'
import { planSlidePages, type SlidePlan } from './slide-pagination'
import { readSlideHtml, rememberSlideHtml, renderSlideSource, slicePageHtml, slideMarkup, type SlideMarkup } from './slide-html'
import { thumbMetrics, usePageHtml, type ThumbView } from './slide-thumb'
import type { SlideLayout } from './slides'

const CONTENT_WIDTH = 1168
const CONTENT_HEIGHT = 632

describe('renderSlideSource — the layout switch', () => {
  it('takes the switch out of the markup it renders and reports it', () => {
    const rendered = renderSlideSource('<!-- layout: cover -->\n\n# Title', false)
    expect(rendered.layout).toBe('cover')
    expect(rendered.html).toContain('<h1')
    expect(rendered.html).not.toContain('layout')
  })

  it('renders a slide with no switch as it is, with nothing to report', () => {
    const rendered = renderSlideSource('# Title\n\npoint', false)
    expect(rendered.layout).toBeUndefined()
    expect(rendered.html).toContain('<h1')
  })

  it('leaves a switch demonstrated inside a code fence in the markup', () => {
    const rendered = renderSlideSource('# A\n\n```md\n<!-- layout: cover -->\n```', false)
    expect(rendered.layout).toBeUndefined()
    expect(rendered.html).toContain('layout: cover')
  })

  it('carries the switch onto the markup entry the cache keeps', () => {
    const key = 'layout-cover-key'
    rememberSlideHtml(key, slideMarkup(renderSlideSource('<!-- layout: cover -->\n\n# Title', false)))
    expect(readSlideHtml(key)?.layout).toBe('cover')
  })
})

describe('slicePageHtml — the page a column slide gives its cards', () => {
  it('keeps every block of a column slide on the one page it was measured with', () => {
    // The canvas hides off-page blocks with an inline `visibility`; a card slicing a column
    // slide's only page has to show all of them, not inherit what the projector left hidden.
    const plan = planSlidePages([{ top: 0, height: 300, heading: true }, { top: 300, height: 300, heading: false }, { top: 600, height: 300, heading: false }], CONTENT_HEIGHT, 'split')
    const sliced = slicePageHtml('<h1 style="visibility: hidden">a</h1><p>b</p><p>c</p>', plan, 0, CONTENT_WIDTH, CONTENT_HEIGHT)
    expect(sliced).toContain('<h1 style="">a</h1>')
    expect(sliced).toContain('<p>b</p>')
    expect(sliced).toContain('<p>c</p>')
  })

  it('leaves a block that fits the page exactly as it was', () => {
    const plan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [1] }
    expect(slicePageHtml('<p>fits</p>', plan, 0, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe('<p>fits</p>')
  })
})

describe('SlideProse — the layout a slide asked for', () => {
  function prose(layout?: 'cover' | 'split') {
    const { container } = renderElement(createElement(SlideProse, {
      html: '<h1>Title</h1>',
      contentWidth: 1168,
      contentHeight: CONTENT_HEIGHT,
      font: 'serif',
      layout,
    }))
    const host = container.querySelector<HTMLElement>('[data-slide-page]')
    return { host, wrapper: container.firstElementChild as HTMLElement }
  }

  it('marks the cover slide so the projector can centre it, and gives it the page to centre in', () => {
    const { host } = prose('cover')
    expect(host?.className).toContain('ink-slide-cover')
    expect(host?.style.minHeight).toBe(`${CONTENT_HEIGHT}px`)
  })

  it('marks the split slide for its two columns', () => {
    const { host } = prose('split')
    expect(host?.className).toContain('ink-slide-split')
    expect(host?.style.minHeight).toBe('')
  })

  it('leaves a slide with no switch alone', () => {
    const { host } = prose()
    expect(host?.className).not.toContain('ink-slide-cover')
    expect(host?.className).not.toContain('ink-slide-split')
  })

  it('keeps the content box the projector measured for the slide’s own width', () => {
    const { wrapper } = prose('split')
    expect(wrapper.style.width).toBe('1168px')
    expect(prose('split').host?.className).toContain('ink-prose')
  })
})

// The fence bodies a slide was rendered from travel with its markup, so the layout work above
// cannot be accused of dropping them.
describe('renderSlideSource — what travels with the markup', () => {
  it('keeps the fence bodies the slide was rendered from', () => {
    const empty = createFenceBodies()
    const rendered = renderSlideSource('<!-- layout: cover -->\n\n# Title', false)
    expect(rendered.fences).toEqual(empty)
  })
})

// A card is drawn by the same rule the projector follows, so the layout it picks has to come from the
// measurement when there is one — including the measurement that says the columns were refused.
describe('usePageHtml — the layout a card is drawn in', () => {
  const view: ThumbView = { thumb: thumbMetrics(240, 1280, 720), designWidth: 1280, designHeight: 720, externalImages: false, proseFont: 'serif' }
  const markup: SlideMarkup = { html: '<h1>a</h1><p>b</p>', fences: createFenceBodies(), layout: 'split' }

  function cardLayout(plan: SlidePlan | undefined): SlideLayout | undefined {
    let layout: SlideLayout | undefined
    function Harness() {
      layout = usePageHtml({ near: true, cacheKey: 'card-layout-key', cached: markup, source: '<!-- layout: split -->\n\n# a\n\nb', plan, sub: 0, view }).layout
      return createElement('div')
    }
    renderElement(createElement(Harness))
    return layout
  }

  it('follows the projector onto the flow layout when its columns were refused', () => {
    expect(cardLayout(planSlidePages([{ top: 0, height: 900, heading: false }, { top: 900, height: 900, heading: false }], CONTENT_HEIGHT))).toBeUndefined()
  })

  it('keeps the columns the projector kept', () => {
    expect(cardLayout(planSlidePages([{ top: 0, height: 300, heading: false }], CONTENT_HEIGHT, 'split'))).toBe('split')
  })

  it('takes the author at their word for a slide nobody has measured yet', () => {
    expect(cardLayout(undefined)).toBe('split')
  })
})
