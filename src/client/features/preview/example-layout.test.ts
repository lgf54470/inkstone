import { describe, expect, it, vi } from 'vitest'
import {
  EXAMPLE_SPLIT_DEFAULTS,
  formatExampleSplitInfo,
  parseExampleRatio,
  parseExampleSplit,
  renderMarkdown,
} from '../../lib/markdown/renderer'
import { applyExampleSplits } from '../../lib/markdown/enhance'
import {
  closeExampleOverlayFromEvent,
  dismissExampleOverlays,
  enhanceExampleLayoutsInRoot,
  executeExampleLayoutAction,
} from './example-layout'

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return root
}

function gridOf(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('.markdown-example-grid')!
}

function actionButton(root: HTMLElement, selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!
}

describe('parseExampleSplit', () => {
  it('keeps the family default when the info string says nothing', () => {
    expect(parseExampleSplit('md-example', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual(EXAMPLE_SPLIT_DEFAULTS.md)
    expect(parseExampleSplit('javascript-example', EXAMPLE_SPLIT_DEFAULTS.js)).toEqual(EXAMPLE_SPLIT_DEFAULTS.js)
  })

  it('reads layout and ratio with quotes and aliases', () => {
    expect(parseExampleSplit('md-example layout="rl" ratio="3:7"', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual({
      layout: 'rl',
      ratio: [3, 7],
    })
    expect(parseExampleSplit('md-example direction=vertical', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual({
      layout: 'tb',
      ratio: [45, 55],
    })
  })

  it('ignores malformed values instead of guessing', () => {
    expect(parseExampleRatio('0:10')).toBeNull()
    expect(parseExampleRatio('100:1')).toBeNull()
    expect(parseExampleRatio('abc')).toBeNull()
    expect(parseExampleRatio('35:65')).toEqual([35, 65])
    expect(parseExampleSplit('md-example ratio=0:9 layout=diagonal', EXAMPLE_SPLIT_DEFAULTS.md)).toEqual(EXAMPLE_SPLIT_DEFAULTS.md)
  })
})

describe('formatExampleSplitInfo', () => {
  it('keeps unmanaged tokens and drops values equal to the default', () => {
    const next = formatExampleSplitInfo('md-example title="Demo title"', { ...EXAMPLE_SPLIT_DEFAULTS.md }, EXAMPLE_SPLIT_DEFAULTS.md)
    expect(next).toBe('md-example title="Demo title"')
  })

  it('replaces a managed option instead of appending a second one', () => {
    const next = formatExampleSplitInfo(
      'md-example title="Demo" layout=lr ratio="2:8"',
      { layout: 'tb', ratio: [3, 7] },
      EXAMPLE_SPLIT_DEFAULTS.md,
    )
    expect(next).toBe('md-example title="Demo" layout=tb ratio="3:7"')
  })
})

describe('example split markup', () => {
  it('resolves the family default into the grid attributes', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    expect(gridOf(root).dataset.exampleLayout).toBe('lr')
    expect(gridOf(root).dataset.exampleRatio).toBe('45:55')
    expect(root.querySelector('.markdown-example')?.getAttribute('data-example-family')).toBe('md')
  })

  it('emits the options written into the fence', () => {
    const root = mount('~~~javascript-example layout=bt ratio="2:8"\nconst x = 1\n~~~')
    expect(gridOf(root).dataset.exampleLayout).toBe('bt')
    expect(gridOf(root).dataset.exampleRatio).toBe('2:8')
  })

  it('turns the ratio into the axis variable the layout uses', () => {
    const root = mount('~~~md-example layout=lr ratio="3:7"\n# hi\n~~~\n\n~~~javascript-example\nconst x = 1\n~~~')
    applyExampleSplits(root)
    const [md, js] = [...root.querySelectorAll<HTMLElement>('.markdown-example-grid')]
    expect(md!.style.getPropertyValue('--ex-cols')).toBe('3fr 7fr')
    expect(md!.style.getPropertyValue('--ex-rows')).toBe('')
    expect(js!.style.getPropertyValue('--ex-rows')).toBe('45fr 55fr')
    expect(js!.style.getPropertyValue('--ex-cols')).toBe('')
  })
})

describe('enhanceExampleLayoutsInRoot', () => {
  it('injects the toolbar and settings panel for both families', () => {
    const root = mount('~~~md-example\n# hi\n~~~\n\n~~~javascript-example\nconst x = 1\n~~~')
    enhanceExampleLayoutsInRoot(root)
    expect(root.querySelectorAll('.markdown-example-tools')).toHaveLength(2)
    expect(root.querySelectorAll('.markdown-example-layout-popover [data-example-val]')).toHaveLength(8)
    expect(root.querySelectorAll('.markdown-example-settings')).toHaveLength(2)
    // The runnable block keeps its own controls; the layout tools sit beside them.
    expect(root.querySelector('.js-example-controls > .markdown-example-tools')).not.toBeNull()
    expect(root.querySelector('.markdown-example-settings [data-example-ratio-input]')).not.toBeNull()
  })

  it('marks the active direction in the popover', () => {
    const root = mount('~~~md-example layout=rl\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    expect(root.querySelector('.example-layout-opt.is-active')?.getAttribute('data-example-val')).toBe('rl')
  })

  it('leaves an example inside a note embed alone', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    const embed = document.createElement('div')
    embed.className = 'note-embed-body'
    embed.append(...root.childNodes)
    root.append(embed)
    enhanceExampleLayoutsInRoot(root)
    expect(root.querySelector('.markdown-example-tools')).toBeNull()
  })
})

describe('executeExampleLayoutAction — options', () => {
  it('writes the picked direction into the fence info string', () => {
    const root = mount('~~~md-example title="Demo"\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const button = actionButton(root, '[data-example-action="set-layout"][data-example-val="rl"]')
    const onEdit = vi.fn()
    expect(executeExampleLayoutAction('set-layout', button, '~~~md-example title="Demo"\n# hi\n~~~', onEdit, vi.fn())).toBe(true)
    expect(onEdit).toHaveBeenCalledWith('~~~md-example title="Demo" layout=rl\n# hi\n~~~')
  })

  it('swaps the direction and resets back to the family defaults', () => {
    const root = mount('~~~md-example layout=tb ratio="2:8"\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const source = '~~~md-example layout=tb ratio="2:8"\n# hi\n~~~'
    const onSwap = vi.fn()
    executeExampleLayoutAction('swap', actionButton(root, '[data-example-action="swap"]'), source, onSwap, vi.fn())
    expect(onSwap).toHaveBeenCalledWith('~~~md-example layout=bt ratio="2:8"\n# hi\n~~~')
    const onReset = vi.fn()
    executeExampleLayoutAction('reset', actionButton(root, '[data-example-action="reset"]'), source, onReset, vi.fn())
    expect(onReset).toHaveBeenCalledWith('~~~md-example\n# hi\n~~~')
  })

  it('edits the runnable example through its code fence', () => {
    const root = mount('~~~javascript-example title="Run"\nconst x = 1\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const button = actionButton(root, '[data-example-action="set-layout"][data-example-val="lr"]')
    const onEdit = vi.fn()
    executeExampleLayoutAction('set-layout', button, '~~~javascript-example title="Run"\nconst x = 1\n~~~', onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('~~~javascript-example title="Run" layout=lr\nconst x = 1\n~~~')
  })
})

describe('executeExampleLayoutAction — ratio', () => {
  it('writes a preset ratio and closes the overlay on the live node', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const button = actionButton(root, '[data-example-action="set-ratio"][data-example-val="3:7"]')
    const onEdit = vi.fn()
    executeExampleLayoutAction('set-ratio', button, '~~~md-example\n# hi\n~~~', onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('~~~md-example ratio="3:7"\n# hi\n~~~')
    expect(root.querySelector('.markdown-example-layout-popover')?.hasAttribute('hidden')).toBe(true)
  })

  it('applies a manually typed ratio', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    root.querySelector<HTMLInputElement>('[data-example-ratio-input]')!.value = '35:65'
    const onEdit = vi.fn()
    executeExampleLayoutAction('apply-ratio', actionButton(root, '[data-example-action="apply-ratio"]'), '~~~md-example\n# hi\n~~~', onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('~~~md-example ratio="35:65"\n# hi\n~~~')
  })

  it('refuses a malformed ratio with a warning and no edit', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    root.querySelector<HTMLInputElement>('[data-example-ratio-input]')!.value = '3-7'
    const onEdit = vi.fn()
    const toast = vi.fn()
    executeExampleLayoutAction('apply-ratio', actionButton(root, '[data-example-action="apply-ratio"]'), '~~~md-example\n# hi\n~~~', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

describe('executeExampleLayoutAction — source safety', () => {
  it('edits a runnable example whose body has blank lines', () => {
    const source = '~~~javascript-example\nconst a = 1\n\nconst b = 2\n~~~'
    const root = mount(source)
    enhanceExampleLayoutsInRoot(root)
    const onEdit = vi.fn()
    const button = actionButton(root, '[data-example-action="set-layout"][data-example-val="lr"]')
    executeExampleLayoutAction('set-layout', button, source, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('~~~javascript-example layout=lr\nconst a = 1\n\nconst b = 2\n~~~')
  })

  it('declines to write when the recorded line no longer opens a fence of this family', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const onEdit = vi.fn()
    const toast = vi.fn()
    const button = actionButton(root, '[data-example-action="set-layout"][data-example-val="tb"]')
    executeExampleLayoutAction('set-layout', button, '# the note grew a heading\n\n~~~md-example\n# hi\n~~~', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

describe('example overlays', () => {
  it('closes on Escape and hands focus back to the trigger', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceExampleLayoutsInRoot(root)
    const trigger = actionButton(root, '[data-example-action="toggle-settings"]')
    executeExampleLayoutAction('toggle-settings', trigger, '', vi.fn(), vi.fn())
    expect(root.querySelector('.markdown-example-settings')?.hasAttribute('hidden')).toBe(false)
    expect(closeExampleOverlayFromEvent(trigger)).toBe(trigger)
    expect(root.querySelector('.markdown-example-settings')?.hasAttribute('hidden')).toBe(true)
  })

  it('closes an open overlay when the pointer lands elsewhere in the surface', () => {
    const container = document.createElement('div')
    container.className = 'ink-prose'
    container.innerHTML = mount('~~~md-example\n# hi\n~~~').innerHTML
    enhanceExampleLayoutsInRoot(container)
    const trigger = actionButton(container, '[data-example-action="toggle-layout"]')
    executeExampleLayoutAction('toggle-layout', trigger, '', vi.fn(), vi.fn())
    expect(container.querySelector('.markdown-example-layout-popover')?.hasAttribute('hidden')).toBe(false)
    const outside = document.createElement('p')
    container.append(outside)
    dismissExampleOverlays(outside)
    expect(container.querySelector('.markdown-example-layout-popover')?.hasAttribute('hidden')).toBe(true)
  })
})
