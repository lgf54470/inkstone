import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { ScreenCover } from './presentation-stage'
import { measureStage, SLIDE_DESIGN_HEIGHT, SLIDE_DESIGN_WIDTH, SLIDE_PAD_X, SLIDE_PAD_Y } from './slide-stage'

describe('measureStage', () => {
  it('returns fallback metrics for non-positive dimensions', () => {
    const metrics = measureStage(0, 0)
    expect(metrics.scale).toBe(1)
    expect(metrics.designWidth).toBe(SLIDE_DESIGN_WIDTH)
    expect(metrics.designHeight).toBe(SLIDE_DESIGN_HEIGHT)
    expect(metrics.contentWidth).toBe(SLIDE_DESIGN_WIDTH - SLIDE_PAD_X * 2)
    expect(metrics.contentHeight).toBe(SLIDE_DESIGN_HEIGHT - SLIDE_PAD_Y * 2)
  })

  it('keeps fixed design size and scales up on 1080p viewport', () => {
    const metrics = measureStage(1920, 1080)
    expect(metrics.scale).toBe(1.5)
    expect(metrics.designWidth).toBe(1280)
    expect(metrics.designHeight).toBe(720)
    expect(metrics.contentWidth).toBe(1168)
    expect(metrics.contentHeight).toBe(632)
  })

  it('scales down on smaller screens while preserving fixed 16:9 canvas', () => {
    const metrics = measureStage(640, 360)
    expect(metrics.scale).toBe(0.5)
    expect(metrics.designWidth).toBe(1280)
    expect(metrics.designHeight).toBe(720)
    expect(metrics.contentWidth).toBe(1168)
    expect(metrics.contentHeight).toBe(632)
  })

  it('maintains identical design dimensions when rail opens/closes, preventing cache misses', () => {
    const beforeRail = measureStage(1280, 720)
    const afterRail = measureStage(1064, 720)
    expect(beforeRail.designWidth).toBe(afterRail.designWidth)
    expect(beforeRail.designHeight).toBe(afterRail.designHeight)
    expect(beforeRail.contentWidth).toBe(afterRail.contentWidth)
    expect(beforeRail.contentHeight).toBe(afterRail.contentHeight)
    expect(afterRail.scale).toBe(1064 / 1280)
  })
})

describe('ScreenCover', () => {
  it('renders black cover with modal z-index and calls onClear on click', () => {
    const onClear = vi.fn()
    const view = renderElement(createElement(ScreenCover, { cover: 'black', onClear }))
    const cover = view.container.querySelector('[data-screen-cover="black"]')
    expect(cover).toBeTruthy()
    expect(cover?.className).toContain('z-[var(--z-modal)]')
    expect(cover?.className).toContain('bg-[rgb(0_0_0)]')
    cover?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClear).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('renders white cover with modal z-index and calls onClear on click', () => {
    const onClear = vi.fn()
    const view = renderElement(createElement(ScreenCover, { cover: 'white', onClear }))
    const cover = view.container.querySelector('[data-screen-cover="white"]')
    expect(cover).toBeTruthy()
    expect(cover?.className).toContain('z-[var(--z-modal)]')
    expect(cover?.className).toContain('bg-[rgb(255_255_255)]')
    cover?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(onClear).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it('intercepts onContextMenu and prevents default to eliminate native menu on screen cover', () => {
    const onClear = vi.fn()
    const view = renderElement(createElement(ScreenCover, { cover: 'black', onClear }))
    const cover = view.container.querySelector('[data-screen-cover="black"]')
    expect(cover).toBeTruthy()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    cover?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onClear).not.toHaveBeenCalled()
    view.unmount()
  })
})
