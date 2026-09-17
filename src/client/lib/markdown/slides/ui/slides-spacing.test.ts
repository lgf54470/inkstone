import { act, createElement, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import type { BentoDoc, SlideElement, TextElement } from '../types'
import { SlidesRoot } from './slides-root'

function text(id: string, x: number, y: number, w = 100, h = 100): TextElement {
  return { id, type: 'text', html: `<p>${id}</p>`, fontSize: 24, x, y, w, h }
}

function backdrop(): SlideElement {
  return { id: 'backdrop', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1280, h: 720, fill: '#FFFFFF' }
}

/** Three boxes in one row: `b` sits between `a` and `c`, 40 from one and 44 from the other. */
function row(left: number, middle: number, right: number): BentoDoc {
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: { width: 1280, height: 720 },
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides: [{ id: 'one', elements: [backdrop(), text('a', left, 100), text('b', middle, 100), text('c', right, 100)] }],
  }
}

let mounted: ReturnType<typeof renderElement> | null = null

/** The deck hosted the way the app hosts it, so the committed document is readable after each act. */
function mountDeck(doc: BentoDoc) {
  const latest: { doc: BentoDoc } = { doc }
  function LiveDeck() {
    const [data, setData] = useState<BentoDoc>(() => doc)
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

function box(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`.bento-canvas-stage [data-slide-element="${id}"]`)
  if (!node) throw new Error(`no box for ${id}`)
  return node
}

function press(target: HTMLElement, clientX: number, clientY: number): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }))
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

/** The widths the drag is currently writing on the page, in the order they are drawn. */
function gapSizes(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.bento-canvas-stage [data-slide-gap-size]')].map(
    (badge) => badge.textContent ?? '',
  )
}

function at(id: string, doc: BentoDoc): [number | undefined, number | undefined] {
  const element = doc.slides[0]?.elements.find((candidate) => candidate.id === id)
  return [element?.x, element?.y]
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('even spacing while dragging', () => {
  it('lands the box on the equal gaps, and says so while it moves', () => {
    const live = mountDeck(row(100, 240, 384))
    press(box('b'), 0, 0)
    moveTo(2, 0)

    // 200…384 of room around a 100-wide box: 42 either side, written on both segments.
    expect(gapSizes()).toEqual(['42', '42'])
    expect(document.querySelectorAll('.bento-canvas-stage [data-slide-gap]')).toHaveLength(2)

    release()
    expect(at('b', live.doc)).toEqual([242, 100])
    expect(gapSizes()).toEqual([])
  })

  it('still shows the gaps when the box is already where they want it', () => {
    const live = mountDeck(row(100, 242, 384))
    press(box('b'), 0, 0)
    moveTo(0, 0)

    expect(gapSizes()).toEqual(['42', '42'])
    release()
    expect(at('b', live.doc)).toEqual([242, 100])
  })

  it('says nothing when the two sides of the row share nothing in common', () => {
    const live = mountDeck(row(100, 240, 900))
    press(box('b'), 0, 0)
    moveTo(3, 0)

    expect(gapSizes()).toEqual([])
    release()
    expect(at('b', live.doc)).toEqual([243, 100])
  })

  it('gives the gaps up in favour of an edge the box was aimed at', () => {
    // Dragged to 281, its right edge is 3 short of `c`'s left edge: the edge is the sharper
    // intent, so the drag takes that and the row's even spacing is not applied on top of it.
    const live = mountDeck(row(100, 240, 384))
    press(box('b'), 0, 0)
    moveTo(41, 0)

    expect(gapSizes()).toEqual([])
    release()
    expect(at('b', live.doc)).toEqual([284, 100])
  })
})
