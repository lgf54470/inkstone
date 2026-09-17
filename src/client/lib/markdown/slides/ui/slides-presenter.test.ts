import { act, createElement } from 'react'
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

describe('how a page arrives', () => {
  function page(transition?: BentoDoc['slides'][number]['transition']) {
    const doc = deck({})
    doc.slides[0] = { ...doc.slides[0]!, transition }
    return show(doc)
  }

  it('names the transition the page asked for', () => {
    for (const kind of ['fade', 'slide', 'zoom'] as const) {
      const view = page(kind)
      expect(view.container.querySelector('[data-bento-show-page]')?.getAttribute('data-transition')).toBe(kind)
      view.unmount()
    }
  })

  it('shows a morph as a plain cut rather than a fade that would claim a continuity', () => {
    const view = page('morph')
    expect(view.container.querySelector('[data-bento-show-page]')?.getAttribute('data-transition')).toBe('none')
    view.unmount()
  })

  it('carries the direction of the step, so going back does not arrive like going forward', () => {
    const view = page('slide')
    const target = (): string | null =>
      view.container.querySelector('[data-bento-show-page]')?.getAttribute('data-direction') ?? null
    expect(target()).toBe('forward')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true }))
    })
    expect(target()).toBe('back')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }))
    })
    expect(target()).toBe('forward')
    view.unmount()
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
