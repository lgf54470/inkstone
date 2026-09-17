import { act, createElement, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../../test-render'
import type { BentoDoc, SlideElement, TextElement } from '../types'
import { SlidesRoot } from './slides-root'

function text(id: string, x: number, y: number): TextElement {
  return { id, type: 'text', html: `<p>${id}</p>`, fontSize: 24, x, y, w: 100, h: 50 }
}

/**
 * Two text boxes side by side, and a backdrop that covers the page — the backdrop is what the
 * rubber band has to leave out, because it overlaps every band that could be drawn.
 */
function deck(): BentoDoc {
  const backdrop: SlideElement = { id: 'backdrop', type: 'shape', shape: 'rect', x: 0, y: 0, w: 1280, h: 720, fill: '#FFFFFF' }
  return {
    format: 'bento/slides',
    version: 1,
    title: 'Deck',
    size: { width: 1280, height: 720 },
    theme: { background: '#ffffff', color: '#111111', accent: '#FF9E8A' },
    slides: [{ id: 'one', elements: [backdrop, text('a', 100, 100), text('b', 500, 400)] }],
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

function box(id: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`main [data-slide-element="${id}"]`)
  if (!node) throw new Error(`no box for ${id}`)
  return node
}

function page(): HTMLElement {
  const node = document.querySelector<HTMLElement>('main [data-slide-element="a"]')?.parentElement
  if (!node) throw new Error('the page is not on screen')
  return node
}

function press(target: HTMLElement, options: MouseEventInit = {}): void {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...options }))
  })
}

function moveTo(clientX: number, clientY: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX, clientY }))
  })
}

function release(clientX: number, clientY: number): void {
  act(() => {
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX, clientY }))
  })
}

function click(node: HTMLElement, options: MouseEventInit = {}): void {
  act(() => {
    node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...options }))
  })
}

/** The selection as the canvas draws it: which boxes carry a ring, and which one has the handles. */
function rings(): Array<{ id: string; handles: boolean }> {
  return [...document.querySelectorAll<HTMLElement>('main [data-slide-element]')]
    .map((node) => ({
      id: node.getAttribute('data-slide-element') ?? '',
      overlay: node.querySelector<HTMLElement>('[data-slide-selection]'),
    }))
    .filter((entry) => entry.overlay !== null)
    .map((entry) => ({ id: entry.id, handles: entry.overlay?.getAttribute('data-slide-selection') === 'primary' }))
}

afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('selecting more than one box', () => {
  it('picks a box on a press, and replaces the selection on the next press', () => {
    mountDeck()
    press(box('a'))
    expect(rings()).toEqual([{ id: 'a', handles: true }])

    press(box('b'))
    expect(rings()).toEqual([{ id: 'b', handles: true }])
  })

  it('adds a box on a modified click, and takes it out again on the next one', () => {
    mountDeck()
    press(box('a'))

    press(box('b'), { shiftKey: true })
    click(box('b'), { shiftKey: true })
    expect(rings()).toEqual([
      { id: 'a', handles: false },
      { id: 'b', handles: true },
    ])

    press(box('b'), { shiftKey: true })
    click(box('b'), { shiftKey: true })
    expect(rings()).toEqual([{ id: 'a', handles: true }])
  })

  it('leaves the handles on the last box picked rather than on every selected one', () => {
    mountDeck()
    press(box('a'))
    press(box('b'), { metaKey: true })
    click(box('b'), { metaKey: true })

    const withHandles = rings().filter((entry) => entry.handles)
    expect(withHandles).toHaveLength(1)
    expect(withHandles[0]?.id).toBe('b')
  })
})

describe('the rubber band', () => {
  it('selects every box it touched, and leaves the backdrop out of it', () => {
    mountDeck()
    press(page(), { clientX: 50, clientY: 50 })
    moveTo(300, 300)
    expect(document.querySelector('[data-slide-marquee]')).not.toBeNull()
    release(300, 300)

    expect(rings()).toEqual([{ id: 'a', handles: true }])
  })

  it('catches both boxes when the band covers them, handles on the last one it found', () => {
    mountDeck()
    press(page(), { clientX: 10, clientY: 10 })
    moveTo(700, 600)
    release(700, 600)

    expect(rings()).toEqual([
      { id: 'a', handles: false },
      { id: 'b', handles: true },
    ])
  })

  it('clears the selection when the press never travelled, and draws no band', () => {
    mountDeck()
    press(box('a'))
    press(page(), { clientX: 900, clientY: 600 })
    expect(document.querySelector('[data-slide-marquee]')).toBeNull()
    release(900, 600)

    expect(rings()).toEqual([])
  })
})

describe('dragging a selection', () => {
  it('carries every selected box the same distance, from where each one started', () => {
    const live = mountDeck()
    press(box('a'))
    press(box('b'), { shiftKey: true })
    click(box('b'), { shiftKey: true })

    press(box('a'), { clientX: 100, clientY: 100 })
    moveTo(140, 130)
    release(140, 130)

    const elements = live.doc.slides[0]?.elements ?? []
    const a = elements.find((element) => element.id === 'a')
    const b = elements.find((element) => element.id === 'b')
    const backdrop = elements.find((element) => element.id === 'backdrop')
    expect([a?.x, a?.y]).toEqual([140, 130])
    expect([b?.x, b?.y]).toEqual([540, 430])
    expect([backdrop?.x, backdrop?.y]).toEqual([0, 0])
  })

  it('moves only the box that was dragged when it is the whole selection', () => {
    const live = mountDeck()
    press(box('a'), { clientX: 0, clientY: 0 })
    moveTo(30, 20)
    release(30, 20)

    const elements = live.doc.slides[0]?.elements ?? []
    const at = (id: string): [number | undefined, number | undefined] => {
      const element = elements.find((candidate) => candidate.id === id)
      return [element?.x, element?.y]
    }
    expect(at('a')).toEqual([130, 120])
    expect(at('b')).toEqual([500, 400])
  })
})
