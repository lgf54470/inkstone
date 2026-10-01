/**
 * The keys read from the side that owns the state: what a keystroke does to the pointer mode,
 * which keystroke the show hands over to a focused control, and what happens to a mode nobody
 * exited when the show itself closes.
 */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { usePresentationKeys, type PresentationKeysOptions } from './use-presentation-keys'

function Host({ props }: { props: PresentationKeysOptions }) {
  const { laser, screenCover } = usePresentationKeys(props)
  return createElement('span', { 'data-laser': String(laser), 'data-cover': screenCover ?? 'none' })
}

function state(container: HTMLElement) {
  const marker = container.querySelector('span')
  return { laser: marker?.getAttribute('data-laser'), cover: marker?.getAttribute('data-cover') }
}

// The key arrives the way a browser sends it: nothing focused, so the event lands on the body and
// bubbles up to the show's capture listener on `window`. `act` because the state a keystroke
// changes belongs to React, and reading the DOM before it has committed proves nothing.
function press(key: string, target: EventTarget = document.body): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

const options = (): PresentationKeysOptions => ({
  open: true,
  slideCount: 3,
  goNext: vi.fn(),
  goPrev: vi.fn(),
  jumpTo: vi.fn(),
  toggleFullscreen: vi.fn(),
  toggleRail: vi.fn(),
  toggleFollowing: vi.fn(),
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('usePresentationKeys — the laser pointer', () => {
  it('turns the pointer on and back off with C', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('c')
    expect(state(view.container).laser).toBe('true')
    press('C')
    expect(state(view.container).laser).toBe('false')
    view.unmount()
  })

  it('hands C to a focused control instead of hijacking the keystroke', () => {
    const button = document.createElement('button')
    document.body.append(button)
    const view = renderElement(createElement(Host, { props: options() }))
    press('c', button)
    expect(state(view.container).laser).toBe('false')
    view.unmount()
  })

  it('goes out with the show, so a closed talk leaves no dot on the page', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('c')
    view.rerender(createElement(Host, { props: { ...options(), open: false } }))
    expect(state(view.container).laser).toBe('false')
    view.unmount()
  })

  it('lets a screen cover take the key, which is what brings the slide back', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('b')
    expect(state(view.container).cover).toBe('black')
    press('c')
    expect(state(view.container).cover).toBe('none')
    expect(state(view.container).laser).toBe('false')
    view.unmount()
  })
})
