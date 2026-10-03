import { describe, expect, it, vi } from 'vitest'
import { formatTableOptions, parseTableOptions, renderMarkdown } from '../../lib/markdown/renderer'
import { closeBlockToolbarOverlay } from './block-actions'
import { enhanceTableToolbarsInRoot, executeTableAction } from './table-toolbar'

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return root
}

function action(root: HTMLElement, selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!
}

const TABLE = ['::: table compact zebra', '| a | b |', '| --- | --- |', '| 1 | 2 |', ':::'].join('\n')

describe('parseTableOptions', () => {
  it('reads the defaults from a bare container', () => {
    expect(parseTableOptions('')).toEqual({ density: 'cozy', zebra: false, frames: 'all' })
  })

  it('reads flags and key-value spellings', () => {
    expect(parseTableOptions('compact zebra frames=rows')).toEqual({ density: 'compact', zebra: true, frames: 'rows' })
    expect(parseTableOptions('density=compact striped frames=none')).toEqual({ density: 'compact', zebra: true, frames: 'none' })
  })

  it('reads a turned-off stripe as off', () => {
    expect(parseTableOptions('zebra=false').zebra).toBe(false)
  })
})

describe('formatTableOptions', () => {
  it('drops a value equal to the default and keeps the order the panel offers', () => {
    expect(formatTableOptions({ density: 'cozy', zebra: true, frames: 'rows' })).toBe('zebra frames=rows')
    expect(formatTableOptions({ density: 'cozy', zebra: false, frames: 'all' })).toBe('')
  })
})

describe('::: table container', () => {
  it('wraps the table and states its options on the wrapper', () => {
    const root = mount(TABLE)
    const wrapper = root.querySelector<HTMLElement>('.markdown-table')!
    expect(wrapper.dataset.tableDensity).toBe('compact')
    expect(wrapper.dataset.tableZebra).toBe('true')
    expect(wrapper.dataset.tableFrames).toBe('all')
    expect(wrapper.dataset.line).toBe('0')
    expect(wrapper.querySelector('.table-wrap table')).not.toBeNull()
  })

  it('leaves a table outside a container untouched', () => {
    const root = mount('| a | b |\n| --- | --- |\n| 1 | 2 |')
    expect(root.querySelector('.markdown-table')).toBeNull()
    expect(root.querySelector('.table-wrap table')).not.toBeNull()
  })
})

describe('enhanceTableToolbarsInRoot', () => {
  it('injects a head, a trigger and a panel that reports the current style', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const wrapper = root.querySelector<HTMLElement>('.markdown-table')!
    expect(wrapper.querySelector(':scope > .block-head .block-tools')).not.toBeNull()
    const panel = wrapper.querySelector<HTMLElement>(':scope > .block-settings')!
    expect(panel.hidden).toBe(true)
    expect(panel.querySelector('[data-table-style-action="set-density"][data-table-style-val="compact"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(panel.querySelector('[data-table-style-action="toggle-zebra"][data-table-style-val="on"]')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not inject a second head', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    enhanceTableToolbarsInRoot(root)
    expect(root.querySelectorAll('.block-head')).toHaveLength(1)
  })

  it('keeps its action attribute clear of the table floating bar it shares a surface with', () => {
    // The floating bar (table-interactive.ts) answers to `data-table-action` and claims every such
    // click before the block route runs, so a toolbar that reused it could never be clicked.
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    expect(root.querySelector('[data-table-action]')).toBeNull()
    expect(root.querySelectorAll('[data-table-style-action]').length).toBeGreaterThan(0)
  })
})

describe('executeTableAction', () => {
  it('rewrites the container header and keeps the table below it', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeTableAction('set-density', action(root, '[data-table-style-action="set-density"][data-table-style-val="cozy"]'), TABLE, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(['::: table zebra', '| a | b |', '| --- | --- |', '| 1 | 2 |', ':::'].join('\n'))
  })

  it('turns the stripes off and closes the panel on the live node', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeTableAction('toggle-zebra', action(root, '[data-table-style-action="toggle-zebra"][data-table-style-val="off"]'), TABLE, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(['::: table density=compact', '| a | b |', '| --- | --- |', '| 1 | 2 |', ':::'].join('\n'))
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(true)
  })

  it('writes the borders choice', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeTableAction('set-frames', action(root, '[data-table-style-action="set-frames"][data-table-style-val="none"]'), TABLE, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(['::: table density=compact zebra frames=none', '| a | b |', '| --- | --- |', '| 1 | 2 |', ':::'].join('\n'))
  })

  it('declines to write when the recorded line no longer opens the container', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const onEdit = vi.fn()
    const toast = vi.fn()
    executeTableAction('set-frames', action(root, '[data-table-style-action="set-frames"][data-table-style-val="rows"]'), '| a | b |\n| --- | --- |', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

describe('table overlay', () => {
  it('closes on Escape and hands focus back to the trigger', () => {
    const root = mount(TABLE)
    enhanceTableToolbarsInRoot(root)
    const trigger = action(root, '[data-table-style-action="toggle-settings"]')
    executeTableAction('toggle-settings', trigger, TABLE, vi.fn(), vi.fn())
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(false)
    expect(closeBlockToolbarOverlay(trigger)).toBe(trigger)
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(true)
  })
})
