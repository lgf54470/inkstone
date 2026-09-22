import { act, createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installTestGlobals, renderElement, type RenderedElement } from '../../lib/test-render'
import { Tooltip } from './tooltip'

installTestGlobals()

// The panel is drawn in a portal on body, so nothing about it is near its trigger in the DOM. What
// has to hold is the reference between them: a description a screen reader can follow, pointing at
// the panel it belongs to. The hint is the description, never the name — an icon-only control still
// owes a name of its own (SH-105).
const RECT = { width: 24, height: 24, top: 10, left: 10, right: 34, bottom: 34, x: 10, y: 10, toJSON: () => ({}) } as DOMRect

let rendered: RenderedElement | null = null

/** jsdom lays nothing out, so the anchor has to report a size for the panel to mount at all. */
function renderTooltip(children: ReactNode): HTMLElement {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RECT)
  rendered = renderElement(createElement(Tooltip, { label: 'Rename note', delay: 0, children }))
  const trigger = rendered.container.firstElementChild?.firstElementChild
  if (!(trigger instanceof HTMLElement))
    throw new Error('the tooltip rendered no trigger to hover')
  return trigger
}

async function showTooltip(children: ReactNode): Promise<HTMLElement> {
  const trigger = renderTooltip(children)
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  return trigger
}

afterEach(() => {
  rendered?.unmount()
  rendered = null
  vi.restoreAllMocks()
})

describe('tooltip and its trigger (SH-105)', () => {
  // The description exists while the panel does, and not a moment longer: a reference to an element
  // that is not in the page describes nothing and is reported as a broken ARIA value on the control
  // that carries it (the contrast gate's axe pass caught exactly that on every surface).
  it('carries no reference while the panel is not up', () => {
    const trigger = renderTooltip(createElement('button', { type: 'button', 'aria-label': 'Rename note' }, 'R'))
    expect(document.querySelector('[role="tooltip"]')).toBeNull()
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })

  it('describes the trigger with the panel it renders', async () => {
    const trigger = await showTooltip(createElement('button', { type: 'button', 'aria-label': 'Rename note' }, 'R'))
    const panel = document.querySelector('[role="tooltip"]')
    expect(panel?.textContent).toContain('Rename note')
    expect(panel?.id).toBeTruthy()
    expect(trigger.getAttribute('aria-describedby')).toBe(panel?.id)
    // The description is an addition, not a replacement: the control names itself.
    expect(trigger.getAttribute('aria-label')).toBe('Rename note')
  })

  it('keeps the description a trigger already has and adds the panel to it', async () => {
    const trigger = await showTooltip(createElement('button', { type: 'button', 'aria-label': 'Rename note', 'aria-describedby': 'note-hint' }, 'R'))
    const panel = document.querySelector('[role="tooltip"]')
    expect(trigger.getAttribute('aria-describedby')).toBe(`note-hint ${panel?.id}`)
  })

  // A trigger that is several elements has no single element to describe, so it is left alone
  // rather than pointed at a panel by a guess.
  it('leaves a multi-element trigger without a reference', async () => {
    await showTooltip([
      createElement('button', { key: 'a', type: 'button', 'aria-label': 'First' }, '1'),
      createElement('button', { key: 'b', type: 'button', 'aria-label': 'Second' }, '2'),
    ])
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull()
    for (const trigger of rendered?.container.querySelectorAll('button') ?? [])
      expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })
})
