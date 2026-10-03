import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n } from '../../lib/i18n'
import { matchPanelHeader } from '../../lib/markdown/renderer'
import { countColumns, setColumnCount, updateAlignHeader, updateColsHeader } from './panel-source'
import { enhancePanelToolbarsInRoot, executePanelAction } from './panel-toolbar'

beforeAll(async () => {
  await initI18n()
})

const COLS_NOTE = '::: cols\nfirst\n::\nsecond\n:::\n'
const ALIGN_NOTE = '::: center\nbody\n:::\n'

function colsOptions(source: string) {
  const header = matchPanelHeader(source.split('\n')[0]!)!.header
  if (header.kind !== 'cols') throw new Error('not a cols header')
  return header.cols
}

describe('align header rewrite', () => {
  it('changes only the alignment word', () => {
    const next = updateAlignHeader(ALIGN_NOTE, 0, 'right')
    expect(next).toBe('::: right\nbody\n:::\n')
    expect(next?.split('\n')[1]).toBe('body')
  })

  it('keeps the author colon count and indentation, which decide how the block closes', () => {
    const source = '  :::: justify\nbody\n::::\n'
    expect(updateAlignHeader(source, 0, 'center')).toBe('  :::: center\nbody\n::::\n')
  })

  it('refuses a line that is not an alignment block', () => {
    expect(updateAlignHeader(COLS_NOTE, 0, 'left')).toBeNull()
    expect(updateAlignHeader('> [!tip]', 0, 'left')).toBeNull()
  })
})

describe('cols header rewrite', () => {
  it('sets the gap, the divider and the content alignment without disturbing the body', () => {
    const gap = updateColsHeader(COLS_NOTE, 0, (current) => ({ ...current, gap: 'wide' }))!
    expect(colsOptions(gap).gap).toBe('wide')
    expect(gap).toContain('first\n::\nsecond')

    const aligned = updateColsHeader(COLS_NOTE, 0, (current) => ({ ...current, align: 'center' }))!
    expect(colsOptions(aligned).align).toBe('center')
  })

  it('writes a header the renderer reads back identically', () => {
    const once = updateColsHeader(COLS_NOTE, 0, (current) => ({ ...current, gap: 'narrow', divider: true }))!
    expect(updateColsHeader(once, 0, () => colsOptions(once))).toBe(once)
  })
})

describe('column count rewrite', () => {
  it('counts the columns the body says it has', () => {
    expect(countColumns(COLS_NOTE, 0)).toBe(2)
    expect(countColumns('::: cols\nonly\n:::\n', 0)).toBe(1)
  })

  it('adds the separators a stated count needs, so header and body agree', () => {
    const next = setColumnCount(COLS_NOTE, 0, 4)!
    expect(countColumns(next, 0)).toBe(4)
    expect(colsOptions(next).fixedCount).toBe(4)
    expect(next).toContain('first')
    expect(next).toContain('second')
  })

  it('removes separators without ever removing what was written between them', () => {
    const wide = '::: cols\na\n::\nb\n::\nc\n::\nd\n:::\n'
    const next = setColumnCount(wide, 0, 2)!
    expect(countColumns(next, 0)).toBe(2)
    expect(next).toContain('a')
    expect(next).toContain('b\nc\nd')
    expect(next.match(/^::$/gm)).toHaveLength(1)
  })

  it('clamps to the range the stylesheet draws', () => {
    expect(countColumns(setColumnCount(COLS_NOTE, 0, 99)!, 0)).toBe(6)
    expect(countColumns(setColumnCount(COLS_NOTE, 0, 0)!, 0)).toBe(1)
  })

  it('drops explicit tracks, which no longer describe an equal-column grid', () => {
    const tracked = '::: cols 1fr 2fr\na\n::\nb\n:::\n'
    const next = setColumnCount(tracked, 0, 3)!
    expect(colsOptions(next).tracks).toBeNull()
  })

  it('leaves a separator inside a code fence or a nested container alone', () => {
    const fenced = '::: cols\na\n::\n```\n::\n::\n```\n:::\n'
    expect(countColumns(fenced, 0)).toBe(2)
    const nested = '::: cols\n::: tabs\n:: inner\n:::\n::\nb\n:::\n'
    expect(countColumns(nested, 0)).toBe(2)
  })
})

function mount(source: string): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  host.innerHTML = source
  enhancePanelToolbarsInRoot(host)
  return host
}

describe('panel toolbar chrome', () => {
  it('wraps a block once, and says which block it belongs to', () => {
    const host = mount('<div class="markdown-cols" data-cols="2" data-line="4"></div>')
    const wrapper = host.querySelector<HTMLElement>('.panel-block')
    expect(wrapper?.querySelector('.block-head-title')?.textContent).toBe('Columns')
    expect(wrapper?.querySelector('.markdown-cols')).not.toBeNull()
    enhancePanelToolbarsInRoot(host)
    expect(host.querySelectorAll('.panel-block')).toHaveLength(1)
  })

  it('names an alignment block by what it does', () => {
    const host = mount('<div class="markdown-align" data-align="center" data-line="0"></div>')
    expect(host.querySelector('.block-head-title')?.textContent).toBe('Alignment')
  })

  it('gives the settings trigger the aria relationship a screen reader needs', () => {
    const host = mount('<div class="markdown-cols" data-cols="2" data-line="1"></div>')
    const trigger = host.querySelector<HTMLButtonElement>('[data-panel-action="toggle-settings"]')
    const panel = host.querySelector<HTMLElement>('.block-settings')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.getAttribute('aria-controls')).toBe(panel?.id)
    expect(panel?.hidden).toBe(true)
  })

  it('leaves a block that carries no source line alone, since nothing could be written back', () => {
    const host = mount('<div class="markdown-cols" data-cols="2"></div>')
    expect(host.querySelector('.panel-block')).toBeNull()
  })

  it('does not build chrome inside an embedded note, where the source is not this note', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div class="note-embed-body"><div class="markdown-cols" data-cols="2" data-line="0"></div></div>'
    enhancePanelToolbarsInRoot(host)
    expect(host.querySelector('.panel-block')).toBeNull()
  })
})

describe('panel toolbar actions', () => {
  function click(host: HTMLElement, action: string, value?: string) {
    const button = document.createElement('button')
    button.dataset.panelAction = action
    if (value !== undefined) button.dataset.panelVal = value
    host.querySelector<HTMLElement>('.panel-block')!.append(button)
    const edit = vi.fn()
    const toast = vi.fn()
    const handled = executePanelAction(action, button, ALIGN_NOTE, edit, toast)
    return { handled, edit, toast }
  }

  it('rewrites the note when a new alignment is chosen', () => {
    const host = mount('<div class="markdown-align" data-align="center" data-line="0"></div>')
    const { handled, edit } = click(host, 'set-align', 'right')
    expect(handled).toBe(true)
    expect(edit).toHaveBeenCalledWith('::: right\nbody\n:::\n')
  })

  it('reports instead of writing nothing when the block has moved', () => {
    const host = mount('<div class="markdown-align" data-align="center" data-line="9"></div>')
    const { edit, toast } = click(host, 'set-align', 'right')
    expect(edit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })

  it('closes the settings panel over a block that cannot be edited', () => {
    const host = mount('<div class="markdown-align" data-align="center" data-line="0"></div>')
    const wrapper = host.querySelector<HTMLElement>('.panel-block')!
    wrapper.classList.add('is-block-settings-open')
    click(host, 'set-align', 'left')
    expect(wrapper.classList.contains('is-block-settings-open')).toBe(false)
  })
})
