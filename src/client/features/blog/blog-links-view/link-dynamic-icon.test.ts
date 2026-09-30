import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { LinkDynamicIcon } from './link-dynamic-icon'

let rendered: RenderedElement | null = null

afterEach(() => {
  rendered?.unmount()
  rendered = null
})

/**
 * The row renderer answers most values without leaving the module: the presets are imported, an
 * address and an emoji are drawn locally, and only an icon picked from a search pulls its own
 * module. Before this, resolving any of them meant having lucide's entire registry in the bundle.
 */
describe('link dynamic icon', () => {
  it('draws a preset without loading anything', () => {
    rendered = renderElement(createElement(LinkDynamicIcon, { icon: 'Globe', name: 'Example' }))
    expect(rendered.container.querySelector('svg')).not.toBeNull()
  })

  it('loads an icon outside the presets from its own module', async () => {
    rendered = renderElement(createElement(LinkDynamicIcon, { icon: 'Rocket', name: 'Example' }))
    const view = rendered
    // The module loads, then the icon's own effect runs: two turns after the row's first render.
    await act(async () => {})
    await act(async () => {})
    expect(view.container.querySelector('svg')).not.toBeNull()
  })

  it('keeps the letter avatar for a value no lucide version knows', () => {
    rendered = renderElement(createElement(LinkDynamicIcon, { icon: 'NotAnIcon', name: 'Kubuntu' }))
    expect(rendered.container.textContent).toBe('K')
    expect(rendered.container.querySelector('svg')).toBeNull()
  })

  it('keeps a caller-supplied fallback ahead of the registry for an unknown value', () => {
    rendered = renderElement(createElement(LinkDynamicIcon, {
      icon: 'NotAnIcon',
      name: 'Kubuntu',
      fallback: createElement('span', { 'data-fallback': 'true' }),
    }))
    expect(rendered.container.querySelector('[data-fallback]')).not.toBeNull()
  })
})
