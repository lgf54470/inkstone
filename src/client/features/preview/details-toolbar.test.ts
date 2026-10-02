import { describe, expect, it, vi } from 'vitest'
import { formatDetailsOptions, parseDetailsOptions, renderMarkdown } from '../../lib/markdown/renderer'
import { closeBlockToolbarOverlay } from './block-actions'
import { enhanceDetailsToolbarsInRoot, executeDetailsAction } from './details-toolbar'

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return root
}

function action(root: HTMLElement, selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!
}

const DETAILS = ['::: details variant=card My  block', 'hidden body', ':::'].join('\n')

describe('parseDetailsOptions', () => {
  it('reads the title, the open flag and the variant', () => {
    expect(parseDetailsOptions('open My block')).toEqual({ title: 'My block', open: true, variant: 'default' })
    expect(parseDetailsOptions('variant=card My block')).toEqual({ title: 'My block', open: false, variant: 'card' })
    expect(parseDetailsOptions('+ [Bracketed title]')).toEqual({ title: 'Bracketed title', open: true, variant: 'default' })
  })

  it('keeps the title spacing and stays on the default for an unknown variant', () => {
    expect(parseDetailsOptions('variant=fancy My  block').title).toBe('My  block')
    expect(parseDetailsOptions('variant=fancy My  block').variant).toBe('default')
  })
})

describe('formatDetailsOptions', () => {
  it('writes the flag, the variant and the title, dropping a default variant', () => {
    expect(formatDetailsOptions({ title: 'My block', open: true, variant: 'default' })).toBe('open My block')
    expect(formatDetailsOptions({ title: 'My block', open: false, variant: 'plain' })).toBe('variant=plain My block')
    expect(formatDetailsOptions({ title: '', open: false, variant: 'default' })).toBe('')
  })
})

describe('::: details container', () => {
  it('draws the flags it was given', () => {
    const details = mount(DETAILS).querySelector<HTMLElement>('details.markdown-details')!
    expect(details.dataset.detailsVariant).toBe('card')
    expect(details.hasAttribute('open')).toBe(false)
    expect(details.querySelector('summary')?.textContent).toBe('My  block')
  })

  it('leaves the plain flag off the markup', () => {
    const details = mount('::: details open Named\nbody\n:::').querySelector<HTMLElement>('details')!
    expect(details.dataset.detailsVariant).toBeUndefined()
    expect(details.hasAttribute('open')).toBe(true)
  })
})

describe('enhanceDetailsToolbarsInRoot', () => {
  it('wraps the block and reports its current state in the panel', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    const wrapper = root.querySelector<HTMLElement>('.details-block')!
    expect(wrapper.querySelector(':scope > .block-head .block-tools')).not.toBeNull()
    expect(wrapper.querySelector(':scope > .markdown-details')).not.toBeNull()
    const panel = wrapper.querySelector<HTMLElement>('.block-settings')!
    expect(panel.hidden).toBe(true)
    expect(panel.querySelector('[data-details-action="set-variant"][data-details-val="card"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(panel.querySelector('[data-details-action="set-open"][data-details-val="closed"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not wrap the block twice', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    enhanceDetailsToolbarsInRoot(root)
    expect(root.querySelectorAll('.details-block')).toHaveLength(1)
  })
})

describe('executeDetailsAction', () => {
  it('writes the default state into the header', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeDetailsAction('set-open', action(root, '[data-details-action="set-open"][data-details-val="open"]'), DETAILS, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(['::: details open variant=card My  block', 'hidden body', ':::'].join('\n'))
  })

  it('writes the style and closes the panel on the live node', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeDetailsAction('set-variant', action(root, '[data-details-action="set-variant"][data-details-val="plain"]'), DETAILS, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(['::: details variant=plain My  block', 'hidden body', ':::'].join('\n'))
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(true)
  })

  it('declines to write when the recorded line no longer opens the container', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    const onEdit = vi.fn()
    const toast = vi.fn()
    executeDetailsAction('set-open', action(root, '[data-details-action="set-open"][data-details-val="open"]'), '# heading\n\nbody', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

describe('details overlay', () => {
  it('closes on Escape and hands focus back to the trigger', () => {
    const root = mount(DETAILS)
    enhanceDetailsToolbarsInRoot(root)
    const trigger = action(root, '[data-details-action="toggle-settings"]')
    executeDetailsAction('toggle-settings', trigger, DETAILS, vi.fn(), vi.fn())
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(false)
    expect(closeBlockToolbarOverlay(trigger)).toBe(trigger)
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(true)
  })
})
