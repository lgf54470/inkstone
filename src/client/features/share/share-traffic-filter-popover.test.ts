import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'

/**
 * SH-50: the traffic filters were a hand-rolled panel — no role, no accessible name, focus left
 * where it was when it opened and never handed back when it closed. What the dialog has to keep is
 * the non-modal contract: it is named, the focus enters it, Escape (or a press outside) closes it,
 * and the control that opened it gets the keyboard back rather than the body.
 */
const PANEL = '[role="dialog"][aria-label="share.filter_traffic_title"]'

const mounts: Array<{ unmount: () => void }> = []

function mount() {
  const rendered = renderElement(createElement(ShareTrafficFilterPopover))
  mounts.push(rendered)
  return rendered
}

function panel(): HTMLElement | null {
  return document.body.querySelector(PANEL)
}

function trigger(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button')!
}

/** The focus is moved on the frame after the open, so the frame is what the assertion waits for. */
async function settleFrames(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await act(async () => {
      await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
    })
  }
}

beforeEach(() => {
  useShareStore.setState({ excludeBots: true, excludeSelfReferrers: false, excludeOwner: false })
})

afterEach(() => {
  while (mounts.length) mounts.pop()!.unmount()
})

describe('traffic filter popover keyboard contract (SH-50)', () => {
  it('opens a named dialog and moves the focus into it', async () => {
    const rendered = mount()
    expect(panel()).toBeNull()

    await act(async () => { trigger(rendered.container).click() })
    const opened = panel()
    expect(opened).not.toBeNull()
    expect(opened!.getAttribute('tabindex')).toBe('-1')

    await settleFrames()
    expect(document.activeElement === opened || opened!.contains(document.activeElement)).toBe(true)
  })

  it('closes on escape and hands the focus back to its control', async () => {
    const rendered = mount()
    const button = trigger(rendered.container)
    await act(async () => { button.click() })
    await settleFrames()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('closes on a press outside and hands the focus back too', async () => {
    const rendered = mount()
    const button = trigger(rendered.container)
    await act(async () => { button.click() })
    await settleFrames()

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('keeps the panel out of the subtree it was opened from, so fixed placement stays on the viewport', async () => {
    const rendered = mount()
    await act(async () => { trigger(rendered.container).click() })
    expect(rendered.container.querySelector(PANEL)).toBeNull()
    expect(document.body.contains(panel())).toBe(true)
  })
})
