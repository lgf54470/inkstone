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
  const { laser, spotlight, overview, screenCover } = usePresentationKeys(props)
  return createElement('span', {
    'data-laser': String(laser),
    'data-spotlight': String(spotlight),
    'data-overview': String(overview),
    'data-cover': screenCover ?? 'none',
  })
}

function state(container: HTMLElement) {
  const marker = container.querySelector('span')
  return {
    laser: marker?.getAttribute('data-laser'),
    spotlight: marker?.getAttribute('data-spotlight'),
    overview: marker?.getAttribute('data-overview'),
    cover: marker?.getAttribute('data-cover'),
  }
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

describe('usePresentationKeys — the slide overview', () => {
  it('opens the grid on O and puts it away on the same key', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('o')
    expect(state(view.container).overview).toBe('true')
    press('O')
    expect(state(view.container).overview).toBe('false')
    view.unmount()
  })

  it('opens the same grid on G, which is what the matrix reads as', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('g')
    expect(state(view.container).overview).toBe('true')
    press('o')
    expect(state(view.container).overview).toBe('false')
    view.unmount()
  })

  it('hands O to a focused control instead of hijacking the keystroke', () => {
    const input = document.createElement('input')
    document.body.append(input)
    const view = renderElement(createElement(Host, { props: options() }))
    press('o', input)
    expect(state(view.container).overview).toBe('false')
    view.unmount()
  })

  it('goes out with the show, so a closed talk leaves no grid on the page', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('o')
    view.rerender(createElement(Host, { props: { ...options(), open: false } }))
    expect(state(view.container).overview).toBe('false')
    view.unmount()
  })

  it('leaves the arrows to the grid the presenter is roaming', () => {
    const props = options()
    const grid = document.createElement('div')
    grid.setAttribute('data-presentation-overview', '')
    const card = document.createElement('button')
    grid.append(card)
    document.body.append(grid)
    const view = renderElement(createElement(Host, { props }))
    press('ArrowRight', card)
    expect(props.goNext).not.toHaveBeenCalled()
    expect(props.goPrev).not.toHaveBeenCalled()
    view.unmount()
  })

  it('lets a screen cover take the key while the grid is up', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('o')
    press('b')
    expect(state(view.container).cover).toBe('black')
    expect(state(view.container).overview).toBe('true')
    view.unmount()
  })

  it('does not throw when key event targets document or window', () => {
    const props = options()
    const view = renderElement(createElement(Host, { props }))
    expect(() => press('ArrowRight', document)).not.toThrow()
    expect(props.goNext).toHaveBeenCalledTimes(1)
    expect(() => press('c', window)).not.toThrow()
    expect(state(view.container).laser).toBe('true')
    view.unmount()
  })
})

describe('usePresentationKeys — the spotlight tool', () => {
  it('turns spotlight on and off with T and K', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('t')
    expect(state(view.container).spotlight).toBe('true')
    press('T')
    expect(state(view.container).spotlight).toBe('false')
    press('k')
    expect(state(view.container).spotlight).toBe('true')
    press('K')
    expect(state(view.container).spotlight).toBe('false')
    view.unmount()
  })

  it('enforces mutual exclusion between laser and spotlight', () => {
    const view = renderElement(createElement(Host, { props: options() }))
    press('c')
    expect(state(view.container).laser).toBe('true')
    expect(state(view.container).spotlight).toBe('false')
    press('t')
    expect(state(view.container).laser).toBe('false')
    expect(state(view.container).spotlight).toBe('true')
    press('c')
    expect(state(view.container).laser).toBe('true')
    expect(state(view.container).spotlight).toBe('false')
    view.unmount()
  })

  it('hands T and K to a focused control instead of hijacking the keystroke', () => {
    const button = document.createElement('button')
    document.body.append(button)
    const view = renderElement(createElement(Host, { props: options() }))
    press('t', button)
    expect(state(view.container).spotlight).toBe('false')
    press('k', button)
    expect(state(view.container).spotlight).toBe('false')
    view.unmount()
  })

  it('goes out with the show', () => {
    const props = options()
    const view = renderElement(createElement(Host, { props }))
    press('t')
    expect(state(view.container).spotlight).toBe('true')
    view.rerender(createElement(Host, { props: { ...props, open: false } }))
    expect(state(view.container).spotlight).toBe('false')
    view.unmount()
  })
})
