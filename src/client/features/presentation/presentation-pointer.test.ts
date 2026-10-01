/**
 * The laser pointer layer — what a talk points with when the operating system's cursor is a
 * speck on the projector. It is decoration, so three things have to hold: it never takes a
 * click the slide was going to receive, it never reaches a screen reader, and it never keeps
 * a pointer listener once the mode is off, because a show that runs for an hour should not
 * accumulate listeners for a dot nobody is looking at.
 */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement, type RenderedElement } from '../../lib/test-render'
import { LaserPointer } from './presentation-pointer'

let frame: (() => void) | null = null
let frames = 0

beforeEach(() => {
  frame = null
  frames = 0
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    frame = callback
    frames += 1
    return frames
  })
  vi.stubGlobal('cancelAnimationFrame', () => { frame = null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function layer(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-laser-pointer]')
}

function moveTo(x: number, y: number): void {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }))
}

function runFrame(): void {
  const paint = frame
  frame = null
  paint?.()
}

describe('LaserPointer — the layer it adds', () => {
  it('draws nothing while the mode is off', () => {
    const view = renderElement(createElement(LaserPointer, { active: false }))
    expect(layer(view.container)).toBeNull()
    view.unmount()
  })

  it('is a dot with a smear behind it and no name for a screen reader', () => {
    const view = renderElement(createElement(LaserPointer, { active: true }))
    const root = layer(view.container)
    expect(root?.getAttribute('aria-hidden')).toBe('true')
    expect(root?.querySelectorAll('.laser-trail')).toHaveLength(3)
    expect(root?.querySelector('.laser-dot')).toBeTruthy()
    view.unmount()
  })
})

describe('LaserPointer — following the pointer', () => {
  it('carries the pointer position in the coordinates the dot reads', () => {
    const view = renderElement(createElement(LaserPointer, { active: true }))
    moveTo(640, 360)
    runFrame()
    expect(layer(view.container)?.style.getPropertyValue('--laser-x')).toBe('640px')
    expect(layer(view.container)?.style.getPropertyValue('--laser-y')).toBe('360px')
    view.unmount()
  })

  it('writes one frame for a burst of moves and lands on the newest position', () => {
    const view = renderElement(createElement(LaserPointer, { active: true }))
    moveTo(10, 10)
    moveTo(240, 180)
    expect(frames).toBe(1)
    runFrame()
    expect(layer(view.container)?.style.getPropertyValue('--laser-x')).toBe('240px')
    view.unmount()
  })

  it('tracks again on the next frame after the one it painted', () => {
    const view = renderElement(createElement(LaserPointer, { active: true }))
    moveTo(10, 10)
    runFrame()
    moveTo(20, 20)
    expect(frames).toBe(2)
    runFrame()
    expect(layer(view.container)?.style.getPropertyValue('--laser-x')).toBe('20px')
    view.unmount()
  })

})

describe('LaserPointer — giving up the pointer', () => {
  it('stops tracking when the mode goes off', () => {
    const view: RenderedElement = renderElement(createElement(LaserPointer, { active: true }))
    moveTo(10, 10)
    runFrame()
    view.rerender(createElement(LaserPointer, { active: false }))
    frames = 0
    moveTo(900, 900)
    expect(frames).toBe(0)
    view.unmount()
  })

  it('stops tracking when the layer unmounts with the show', () => {
    const view = renderElement(createElement(LaserPointer, { active: true }))
    moveTo(10, 10)
    runFrame()
    view.unmount()
    frames = 0
    moveTo(900, 900)
    expect(frames).toBe(0)
  })
})
