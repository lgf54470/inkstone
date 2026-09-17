import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { parseSlidesOutline } from '../outline'
import type { BentoDoc, SlidesPresentSettings } from '../types'
import { SlidesPresenter } from './slides-presenter'

function deck(present: SlidesPresentSettings, source = ['# One', '', '---', '', '# Two'].join('\n')) {
  const doc: BentoDoc = parseSlidesOutline(source)
  return { ...doc, present }
}

/** One, a hidden middle page, and Two — the deck that separates numbering from the show order. */
function hiddenMiddle(): string {
  return ['# One', '', '---', '', '# Hidden', '', '---', '', '# Two'].join('\n')
}

function show(doc: BentoDoc, initialIndex = 0) {
  return renderElement(createElement(SlidesPresenter, { doc, initialIndex, onClose: () => {} }))
}

describe('the presenter chrome', () => {
  it('shows the page number and the progress bar by default', () => {
    const view = show(deck({}))
    expect(view.container.querySelector('[data-present-number]')?.textContent).toContain('1 / 2')
    expect(view.container.querySelector('[data-present-progress]')).not.toBeNull()
    view.unmount()
  })

  it('hides both when the deck turns them off', () => {
    const view = show(deck({ slideNumber: false, progress: false }))
    expect(view.container.querySelector('[data-present-number]')).toBeNull()
    expect(view.container.querySelector('[data-present-progress]')).toBeNull()
    view.unmount()
  })

  it('shows corner arrows only when the deck asks for controls', () => {
    const off = show(deck({}))
    expect(off.container.querySelector('[data-present-arrows]')).toBeNull()
    off.unmount()

    const on = show(deck({ controls: true }))
    expect(on.container.querySelector('[data-present-arrows]')).not.toBeNull()
    on.unmount()
  })

})

describe('page numbering in a show', () => {
  it('leaves an unnumbered slide without a page number', () => {
    const doc = deck({})
    doc.slides[0] = { ...doc.slides[0]!, unnumbered: true }
    const view = show(doc)
    expect(view.container.querySelector('[data-present-number]')).toBeNull()
    view.unmount()
  })

  it('numbers the deck without the hidden pages by default', () => {
    const doc = deck({}, hiddenMiddle())
    doc.slides[1] = { ...doc.slides[1]!, hidden: true }

    const view = show(doc, 1)
    expect(view.container.querySelector('[data-present-number]')?.textContent).toContain('2 / 2')
    view.unmount()
  })

  it('counts the hidden pages when the deck asks for them to be numbered', () => {
    const doc = deck({ numberHidden: true }, hiddenMiddle())
    doc.slides[1] = { ...doc.slides[1]!, hidden: true }

    const view = show(doc, 1)
    expect(view.container.querySelector('[data-present-number]')?.textContent).toContain('3 / 3')
    view.unmount()
  })
})
