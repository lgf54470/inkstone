import { describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from '../../lib/markdown/renderer'
import { readCodeOptions, writeCodeOptions, CODE_OPTION_DEFAULTS } from '../../lib/markdown/renderer'
import { configureCodeBlockCollapsing, decorateCodeBlock } from '../../lib/markdown/enhance'
import {
  enhanceCodeBlockToolbarsInRoot,
  executeCodeBlockAction,
} from './code-block-toolbar'
import { closeBlockToolbarOverlay } from './block-actions'

function mount(markdown: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderMarkdown(markdown).html
  return root
}

function action(root: HTMLElement, selector: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(selector)!
}

describe('readCodeOptions', () => {
  it('reads the defaults out of a bare fence', () => {
    expect(readCodeOptions('ts')).toEqual(CODE_OPTION_DEFAULTS)
  })

  it('reads the options a fence wrote', () => {
    expect(readCodeOptions('ts title="a.ts" line-numbers wrap collapse=12 theme=dark {2,4-6}')).toEqual({
      title: 'a.ts',
      lineNumbers: true,
      startLine: 1,
      highlighted: [2, 4, 5, 6],
      wrap: true,
      collapse: 12,
      theme: 'dark',
    })
  })

  it('reads a fence written in the leading-brace form', () => {
    const options = readCodeOptions('{.ts .line-numbers title="a.ts"}')
    expect(options.lineNumbers).toBe(true)
    expect(options.title).toBe('a.ts')
  })

  it('keeps a collapse value that is not a number out of the options', () => {
    expect(readCodeOptions('ts collapse=many').collapse).toBeNull()
  })
})

describe('writeCodeOptions', () => {
  it('keeps unmanaged tokens and re-emits the managed ones it was given', () => {
    const info = 'ts title="a.ts" .extra {2,4}'
    const next = { ...readCodeOptions(info), wrap: true }
    expect(writeCodeOptions(info, next)).toBe('ts .extra title="a.ts" {2,4} wrap')
  })

  it('writes each managed option in one canonical spelling', () => {
    const next = {
      title: 'a.ts',
      lineNumbers: true,
      startLine: 5,
      highlighted: [2, 4, 5, 6],
      wrap: false,
      collapse: 0,
      theme: 'light' as const,
    }
    expect(writeCodeOptions('ts {showLineNumbers} {2} start=5', next)).toBe('ts line-numbers title="a.ts" start=5 {2,4,5,6} collapse=0 theme=light')
  })

  it('keeps the language of a leading-brace fence', () => {
    const written = writeCodeOptions('{.ts title="a.ts"}', { ...CODE_OPTION_DEFAULTS, wrap: true })
    expect(written).toBe('{.ts title="a.ts"} wrap')
    expect(readCodeOptions(written).title).toBe('a.ts')
  })

  it('keeps numbering off when the fence had turned it on', () => {
    expect(writeCodeOptions('ts {line-numbers}', CODE_OPTION_DEFAULTS)).toBe('ts line-numbers=false')
  })

  it('normalizes a quote inside a title so the value stays quoted', () => {
    expect(writeCodeOptions('ts', { ...CODE_OPTION_DEFAULTS, title: 'say "hi"' })).toBe(`ts title="say 'hi'"`)
  })
})

describe('code block markup', () => {
  it('emits the options the fence asked for', () => {
    const root = mount('```ts title="a.ts" wrap collapse=8 theme=light\nconst a = 1\n```')
    const block = root.querySelector<HTMLElement>('.code-block')!
    expect(block.dataset.codeTitle).toBe('a.ts')
    expect(block.dataset.codeWrap).toBe('true')
    expect(block.dataset.codeCollapseAt).toBe('8')
    expect(block.dataset.codeTheme).toBe('light')
  })

  it('leaves the options the fence did not ask for off the markup', () => {
    const block = mount('```ts\nconst a = 1\n```').querySelector<HTMLElement>('.code-block')!
    expect(block.dataset.codeWrap).toBeUndefined()
    expect(block.dataset.codeCollapseAt).toBeUndefined()
    expect(block.dataset.codeTheme).toBeUndefined()
  })
})

describe('per-block collapse', () => {
  it('honours a block that asks never to fold', () => {
    const root = mount('```ts collapse=0\n' + 'const a = 1\n'.repeat(10) + '```')
    root.querySelectorAll('.code-block').forEach((block) => decorateCodeBlock(block as HTMLElement))
    configureCodeBlockCollapsing(root, 8)
    expect(root.querySelector('.code-block [data-code-collapse]')).toBeNull()
    expect(root.querySelector<HTMLElement>('.code-block')?.dataset.codeCollapseAt).toBe('0')
  })

  it('folds at the block threshold instead of the setting', () => {
    const root = mount('```ts collapse=2\nconst a = 1\nconst b = 2\nconst c = 3\n```')
    root.querySelectorAll('.code-block').forEach((block) => decorateCodeBlock(block as HTMLElement))
    configureCodeBlockCollapsing(root, 0)
    const block = root.querySelector<HTMLElement>('.code-block')!
    expect(block.classList.contains('is-code-collapsed')).toBe(true)
    expect(block.dataset.codeCollapseLines).toBe('2')
  })
})

describe('enhanceCodeBlockToolbarsInRoot', () => {
  it('injects one trigger and one panel per standalone code block', () => {
    const root = mount('```ts title="a.ts"\nconst a = 1\n```\n\n```js\nconst b = 2\n```')
    enhanceCodeBlockToolbarsInRoot(root)
    expect(root.querySelectorAll('.code-block .block-tools')).toHaveLength(2)
    expect(root.querySelectorAll('.code-block > .block-settings')).toHaveLength(2)
    const panel = root.querySelector('.block-settings')!
    expect(panel.querySelector('[data-code-input="title"]')?.getAttribute('value')).toBe('a.ts')
    expect(panel.querySelectorAll('[data-code-action="set-theme"]')).toHaveLength(3)
  })

  it('leaves the source panel of an example block alone', () => {
    const root = mount('~~~md-example\n# hi\n~~~')
    enhanceCodeBlockToolbarsInRoot(root)
    expect(root.querySelector('.markdown-example-code .block-tools')).toBeNull()
  })
})

describe('executeCodeBlockAction', () => {
  const source = '```ts title="a.ts" {line-numbers}\nconst a = 1\n```'

  it('writes the typed title', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    root.querySelector<HTMLInputElement>('[data-code-input="title"]')!.value = 'b.ts'
    const onEdit = vi.fn()
    executeCodeBlockAction('apply-title', action(root, '[data-code-action="apply-title"]'), source, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('```ts line-numbers title="b.ts"\nconst a = 1\n```')
  })

  it('turns line numbers off and back on', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    const onEdit = vi.fn()
    executeCodeBlockAction('set-line-numbers', action(root, '[data-code-action="set-line-numbers"][data-code-val="off"]'), source, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith('```ts line-numbers=false title="a.ts"\nconst a = 1\n```')
  })

  it('writes the highlighted lines and the wrap choice', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    root.querySelector<HTMLInputElement>('[data-code-input="highlight"]')!.value = '2,4-5'
    const onHighlight = vi.fn()
    executeCodeBlockAction('apply-highlight', action(root, '[data-code-action="apply-highlight"]'), source, onHighlight, vi.fn())
    expect(onHighlight).toHaveBeenCalledWith('```ts line-numbers title="a.ts" {2,4,5}\nconst a = 1\n```')
    const onWrap = vi.fn()
    executeCodeBlockAction('set-wrap', action(root, '[data-code-action="set-wrap"][data-code-val="wrap"]'), source, onWrap, vi.fn())
    expect(onWrap).toHaveBeenCalledWith('```ts line-numbers title="a.ts" wrap\nconst a = 1\n```')
  })

  it('writes the palette and the collapse choice', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    const onTheme = vi.fn()
    executeCodeBlockAction('set-theme', action(root, '[data-code-action="set-theme"][data-code-val="dark"]'), source, onTheme, vi.fn())
    expect(onTheme).toHaveBeenCalledWith('```ts line-numbers title="a.ts" theme=dark\nconst a = 1\n```')
    const onNever = vi.fn()
    executeCodeBlockAction('set-collapse', action(root, '[data-code-action="set-collapse"][data-code-val="never"]'), source, onNever, vi.fn())
    expect(onNever).toHaveBeenCalledWith('```ts line-numbers title="a.ts" collapse=0\nconst a = 1\n```')
  })

  it('refuses a collapse input that is not a line count', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    root.querySelector<HTMLInputElement>('[data-code-input="collapse"]')!.value = 'many'
    const onEdit = vi.fn()
    const toast = vi.fn()
    executeCodeBlockAction('apply-collapse', action(root, '[data-code-action="apply-collapse"]'), source, onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })

  it('declines to write when the recorded line no longer opens a fence', () => {
    const root = mount(source)
    enhanceCodeBlockToolbarsInRoot(root)
    const onEdit = vi.fn()
    const toast = vi.fn()
    executeCodeBlockAction('set-wrap', action(root, '[data-code-action="set-wrap"][data-code-val="wrap"]'), '# heading\n\nconst a = 1', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

describe('code block overlay', () => {
  it('closes on Escape and hands focus back to the trigger', () => {
    const root = mount('```ts\nconst a = 1\n```')
    enhanceCodeBlockToolbarsInRoot(root)
    const trigger = action(root, '[data-code-action="toggle-settings"]')
    executeCodeBlockAction('toggle-settings', trigger, '', vi.fn(), vi.fn())
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(false)
    expect(closeBlockToolbarOverlay(trigger)).toBe(trigger)
    expect(root.querySelector('.block-settings')?.hasAttribute('hidden')).toBe(true)
  })
})
