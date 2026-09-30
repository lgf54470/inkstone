import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { LinkIconSelector } from './link-icon-selector'

let rendered: RenderedElement | null = null

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

async function search(query: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>('input[type="text"]')
  if (!input) throw new Error('the picker rendered no search field')
  act(() => {
    // React tracks the value it last wrote, so the native setter is what makes it see a change.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, query)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  // Each result cell loads its own icon module and settles in a follow-up turn.
  await act(async () => {})
  await act(async () => {})
}

function gridButton(name: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`button[title="${name}"]`)
}

/**
 * The picker draws the presets from static imports and matches a query against lucide's name list,
 * so opening it and searching it cost no icon code; the grid's cells then load the icon modules they
 * show (see `link-icons.ts` for why that replaced the full registry).
 */
describe('link icon selector', () => {
  it('offers the presets before anything is typed', () => {
    rendered = renderElement(createElement(LinkIconSelector, { value: '', onChange: () => {} }))
    expect(gridButton('Globe')).not.toBeNull()
    expect(gridButton('Rocket')).toBeNull()
  })

  it('searches every lucide name, not just the presets', async () => {
    rendered = renderElement(createElement(LinkIconSelector, { value: '', onChange: () => {} }))
    await search('rocket')
    expect(gridButton('Rocket')).not.toBeNull()
  })

  it('reports the stored spelling of the icon that was picked', async () => {
    const onChange = vi.fn()
    rendered = renderElement(createElement(LinkIconSelector, { value: '', onChange }))
    await search('rocket')
    act(() => {
      gridButton('Rocket')?.click()
    })
    expect(onChange).toHaveBeenCalledWith('Rocket')
  })
})
