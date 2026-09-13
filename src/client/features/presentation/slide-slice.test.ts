import { describe, expect, it } from 'vitest'
import { slicePageHtml } from './slide-html'
import type { SlidePlan } from './slide-pagination'

const SLIDE = '<p>one</p><p>two</p><h2>three</h2><p>four</p>'
const plan: SlidePlan = {
  pages: [
    { from: 0, to: 2, top: 0 },
    { from: 2, to: 4, top: 300 },
  ],
  scales: [1, 1, 1, 0.5],
}

const CONTENT_WIDTH = 1168
const CONTENT_HEIGHT = 632

describe('slicePageHtml', () => {
  it('keeps only the blocks the requested page owns', () => {
    expect(slicePageHtml(SLIDE, plan, 0, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe('<p>one</p><p>two</p>')
    expect(slicePageHtml(SLIDE, plan, 1, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe('<h2>three</h2><p style="transform-origin: top left; transform: scale(0.5); width: 2336px; height: 1264px; overflow: hidden;">four</p>')
  })

  it('carries the shrink factor of a block that owns a page by itself', () => {
    const tall: SlidePlan = { pages: [{ from: 0, to: 1, top: 0 }], scales: [0.25] }
    const html = slicePageHtml('<div>tall</div>', tall, 0, CONTENT_WIDTH, CONTENT_HEIGHT)
    expect(html).toContain('scale(0.25)')
    expect(html).toContain(`width: ${CONTENT_WIDTH / 0.25}px`)
  })

  it('clamps a page index past the end instead of dropping the page', () => {
    expect(slicePageHtml(SLIDE, plan, 7, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe(slicePageHtml(SLIDE, plan, 1, CONTENT_WIDTH, CONTENT_HEIGHT))
  })

  it('falls back to the whole slide when there is no plan yet', () => {
    expect(slicePageHtml(SLIDE, { pages: [], scales: [] }, 0, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe(SLIDE)
  })

  it('ignores markup positions the measured slide no longer has', () => {
    const stale: SlidePlan = { pages: [{ from: 3, to: 9, top: 0 }], scales: [1, 1, 1, 1] }
    expect(slicePageHtml(SLIDE, stale, 0, CONTENT_WIDTH, CONTENT_HEIGHT)).toBe('<p>four</p>')
  })
})
