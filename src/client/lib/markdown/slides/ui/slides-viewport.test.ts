import { act, createElement, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import { t } from '../../../i18n'
import type { BentoDoc, SlideElement, TextElement } from '../types'
import { SlidesRoot } from './slides-root'
import { fitZoom } from './slides-stage'

const PAGE = { width: 1280, height: 720 }

function text(id: string, x: number, y: number): TextElement {
  return { id, type: 'text', html: `<p>${id}</p>`, fontSize: 24, x, y, w: 100, h: 50 }
}

/** One page with a box that a pan must leave exactly where it is. */
function deck(): BentoDoc {
  const backdrop: SlideElement = { id: 'backdrop', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1280, h: 720, fill: '#FFFFFF' }
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: PAGE,
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides: [{ id: 'one', elements: [backdrop, text('a', 100, 100)] }],
  }
}

let mounted: ReturnType<typeof renderElement> | null = null

/** The deck hosted the way the app hosts it, so the committed document is readable after each act. */
function mountDeck() {
  const latest: { doc: BentoDoc } = { doc: deck() }
  function LiveDeck() {
    const [data, setData] = useState<BentoDoc>(() => deck())
    latest.doc = data
    return createElement(SlidesRoot, {
      initialData: data,
      isFullscreen: true,
      onUpdateData: (next: BentoDoc) => setData(next),
    })
  }
  mounted = renderElement(createElement(LiveDeck))
  return latest
}

function stage(): HTMLElement {
  const node = document.querySelector<HTMLElement>('main.bento-canvas-stage')
  if (!node) throw new Error('the stage is not on screen')
  return node
}

function box(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`main [data-slide-element="${id}"]`)
  if (!node) throw new Error(`no box for ${id}`)
  return node
}

/**
 * A measured stage. jsdom lays nothing out, so the two numbers the stage reads off its own box
 * have to be given to it — the same two `fitZoom` is handed a size for.
 */
function sizeStage(width: number, height: number): HTMLElement {
  const node = stage()
  Object.defineProperty(node, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(node, 'clientHeight', { configurable: true, value: height })
  return node
}

function key(type: 'keydown' | 'keyup', init: KeyboardEventInit, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init }))
  })
}

function press(target: HTMLElement, init: MouseEventInit): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }))
  })
}

function moveTo(clientX: number, clientY: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }))
  })
}

function release(): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
  })
}

function click(button: HTMLElement): void {
  act(() => {
    button.click()
  })
}

/** The percentage the corner cluster is showing, which is how a zoom reaches the reader. */
function zoomLabel(): string {
  return [...document.querySelectorAll<HTMLButtonElement>('button')]
    .map((button) => button.textContent ?? '')
    .find((label) => /^\d+%$/.test(label)) ?? ''
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('fitting the page to the stage', () => {
  it('is the ratio that shows both sides, never rounded past the edge it was fitted to', () => {
    // 800 - 2x32 of stage padding is 736 across and 536 down: the width is the tighter of the two.
    expect(fitZoom(PAGE, { width: 800, height: 600 })).toBeCloseTo(736 / 1280, 5)
    // The same stage as the page: the padding alone is what keeps it under 100%, and the height
    // is the tighter side of the two.
    expect(fitZoom(PAGE, { width: 1280, height: 720 })).toBeCloseTo(656 / 720, 5)
  })

  it('stays inside the zoom range a stage too small or too large to fit honestly', () => {
    expect(fitZoom(PAGE, { width: 100, height: 100 })).toBe(0.4)
    expect(fitZoom(PAGE, { width: 8000, height: 8000 })).toBe(2)
    expect(fitZoom(PAGE, { width: 0, height: 0 })).toBe(0.4)
  })
})

describe('the corner controls', () => {
  it('fits the whole page when the fit control is pressed, and says so on the label', () => {
    mountDeck()
    sizeStage(800, 600)

    const fit = document.querySelector<HTMLButtonElement>(`button[aria-label="${t('slides.fit_to_window')}"]`)
    expect(fit, 'the fit control should exist').not.toBeNull()
    click(fit!)

    expect(zoomLabel()).toBe(`${Math.round((736 / 1280) * 100)}%`)
  })
})

describe('moving the view instead of the page', () => {
  it('scrolls the stage on a Space-held drag, and never touches the box underneath', () => {
    const live = mountDeck()
    const node = sizeStage(400, 300)
    node.scrollLeft = 200
    node.scrollTop = 100

    key('keydown', { key: ' ' })
    // A held Space takes the page out of the pointer's reach, so nothing under the cursor can
    // claim the press for a drag of its own.
    expect(box('a').style.pointerEvents).toBe('none')

    press(box('a'), { clientX: 400, clientY: 300 })
    moveTo(360, 280)
    release()

    expect([node.scrollLeft, node.scrollTop]).toEqual([240, 120])
    const a = live.doc.slides[0]?.elements.find((element) => element.id === 'a')
    expect([a?.x, a?.y]).toEqual([100, 100])
  })
})

describe('the middle button', () => {
  it('pans with no key held, and leaves the selection alone', () => {
    mountDeck()
    const node = sizeStage(400, 300)
    node.scrollLeft = 50

    press(box('a'), { button: 1, clientX: 100, clientY: 100 })
    moveTo(70, 100)
    release()

    expect(node.scrollLeft).toBe(80)
    expect(document.querySelector('main [data-slide-selection]')).toBeNull()
  })
})

describe('what a pan leaves to the page', () => {
  it('leaves the box draggable again as soon as Space is let go', () => {
    const live = mountDeck()
    sizeStage(400, 300)

    key('keydown', { key: ' ' })
    key('keyup', { key: ' ' })
    expect(box('a').style.pointerEvents).not.toBe('none')

    press(box('a'), { clientX: 100, clientY: 100 })
    moveTo(130, 100)
    release()

    const a = live.doc.slides[0]?.elements.find((element) => element.id === 'a')
    expect(a?.x).toBe(130)
  })

  it('leaves Space to the control it was pressed on, so a focused button still activates', () => {
    mountDeck()
    const fit = document.querySelector<HTMLButtonElement>(`button[aria-label="${t('slides.fit_to_window')}"]`)
    expect(fit).not.toBeNull()

    const pressed = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    act(() => {
      fit!.dispatchEvent(pressed)
    })

    expect(pressed.defaultPrevented).toBe(false)
    expect(box('a').style.pointerEvents).not.toBe('none')
  })
})

describe('the middle button outside the drag', () => {
  it('does not also paste over the stage, and is left alone outside it', () => {
    mountDeck()
    const inside = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    const outside = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 })
    act(() => {
      box('a').dispatchEvent(inside)
      document.body.dispatchEvent(outside)
    })

    expect(inside.defaultPrevented).toBe(true)
    expect(outside.defaultPrevented).toBe(false)
  })
})
