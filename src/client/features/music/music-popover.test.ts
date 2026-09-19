import { afterEach, describe, expect, it } from 'vitest'
import { Fragment, useRef, useState } from 'react'
import { act, createElement, type ReactNode } from 'react'
import { renderElement } from '../../lib/test-render'
import { MusicPopover } from './music-popover'

function PopoverHarness(): ReactNode {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  return createElement(
    Fragment,
    null,
    createElement('button', { ref: anchorRef, type: 'button', onClick: () => setOpen((value) => !value) }, 'toggle'),
    createElement(MusicPopover, {
      open,
      onClose: () => setOpen(false),
      label: 'panel',
      anchorRef,
      children: [
        createElement('button', { key: 'one', type: 'button', onClick: () => setOpen(false) }, 'one'),
        createElement('button', { key: 'two', type: 'button' }, 'two'),
      ],
    }),
  )
}

let rendered: ReturnType<typeof renderElement> | null = null

function mount(): { anchor: HTMLButtonElement } {
  rendered = renderElement(createElement(PopoverHarness))
  const anchor = rendered.container.querySelector('button') as HTMLButtonElement
  return { anchor }
}

function openPanel(anchor: HTMLButtonElement): HTMLElement {
  act(() => {
    anchor.focus()
    anchor.click()
  })
  const panel = document.querySelector('[role="dialog"][aria-label="panel"]') as HTMLElement
  expect(panel).not.toBeNull()
  return panel
}

function buttonsIn(panel: HTMLElement): HTMLButtonElement[] {
  return [...panel.querySelectorAll('button')] as HTMLButtonElement[]
}

afterEach(() => {
  act(() => rendered?.unmount())
  rendered = null
  document.body.innerHTML = ''
})

// UI-21: the popover panels are dialogs. Opening one must move focus inside,
// Tab must not walk out of it, and closing must hand focus back to the anchor.
describe('MusicPopover focus management', () => {
  it('announces itself on the anchor before and while it is open', () => {
    const { anchor } = mount()
    expect(anchor.getAttribute('aria-haspopup')).toBe('dialog')
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    openPanel(anchor)
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
  })

  it('moves focus into the panel on open and back to the anchor on close', () => {
    const { anchor } = mount()
    const panel = openPanel(anchor)
    expect(panel.contains(document.activeElement)).toBe(true)
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(anchor)
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
  })

  it('keeps Tab cycling inside the panel', () => {
    const { anchor } = mount()
    const panel = openPanel(anchor)
    const [first, second] = buttonsIn(panel)
    act(() => {
      second?.focus()
      second?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    })
    expect(document.activeElement).toBe(first)
  })
})
