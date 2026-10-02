import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderMarkdown } from '../../lib/markdown/renderer'
import {
  closeLayoutPopoverFromEvent,
  dismissTabsOverlays,
  enhanceTabsInRoot,
  executeTabsAction,
} from './tabs-interactive'
import {
  addTabToSource,
  deleteTabInSource,
  renameTabInSource,
  updateTabsSourceHeader,
} from './tabs-source'
import { parseTabsOptions } from '../../lib/markdown/renderer'
import { selectMarkdownTab, moveMarkdownTabFocus, readSyncedTabChoice } from './markdown-tabs'

afterEach(() => {
  window.localStorage.clear()
})

describe('parseTabsOptions', () => {
  it('parses empty info as default horizontal options', () => {
    expect(parseTabsOptions('')).toEqual({
      style: 'horizontal',
      variant: 'default',
      align: 'start',
    })
  })

  it('parses key-value pairs', () => {
    expect(parseTabsOptions('style=vertical variant=pills align=center')).toEqual({
      style: 'vertical',
      variant: 'pills',
      align: 'center',
    })
  })

  it('supports quotes and alias values', () => {
    expect(parseTabsOptions('style="vertical" variant="cards" align="right"')).toEqual({
      style: 'vertical',
      variant: 'cards',
      align: 'end',
    })
  })

  it('parses standalone keyword tokens', () => {
    expect(parseTabsOptions('vertical minimal center')).toEqual({
      style: 'vertical',
      variant: 'minimal',
      align: 'center',
    })
  })

  it('parses position edges and keeps sync id case-sensitive', () => {
    expect(parseTabsOptions('position=bottom sync=Lang-1')).toEqual({
      style: 'horizontal',
      variant: 'default',
      align: 'start',
      position: 'bottom',
      sync: 'Lang-1',
    })
  })

  it('rejects malformed sync ids and unknown positions', () => {
    const parsed = parseTabsOptions('sync=bad! position=diagonal')
    expect(parsed.sync).toBeUndefined()
    expect(parsed.position).toBeUndefined()
  })
})

describe('updateTabsSourceHeader', () => {
  it('toggles style from horizontal to vertical', () => {
    const source = ':::: tabs\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ style: 'vertical' }))
    expect(next).toBe(':::: tabs style=vertical\n@tab A\nContent A\n::::')
  })

  it('toggles style from vertical to horizontal', () => {
    const source = ':::: tabs style=vertical\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ style: 'horizontal' }))
    expect(next).toBe(':::: tabs style=horizontal\n@tab A\nContent A\n::::')
  })

  it('preserves existing options when updating another option', () => {
    const source = ':::: tabs style=vertical variant=cards\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ align: 'center' }))
    expect(next).toBe(':::: tabs style=vertical variant=cards align=center\n@tab A\nContent A\n::::')
  })

  it('supports directive syntax {tab-set}', () => {
    const source = ':::: {tab-set}\n::: tab-item A\nContent\n:::\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ style: 'vertical' }))
    expect(next).toBe(':::: {tab-set} style=vertical\n::: tab-item A\nContent\n:::\n::::')
  })

  it('returns null for non-tab lines', () => {
    const source = '# Heading\nParagraph'
    expect(updateTabsSourceHeader(source, 0, () => ({ style: 'vertical' }))).toBeNull()
  })

  it('writes position and sync options', () => {
    const source = ':::: tabs\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ position: 'right', sync: 'lang' }))
    expect(next).toBe(':::: tabs position=right sync=lang\n@tab A\nContent A\n::::')
  })

  it('clears position and sync when set to undefined', () => {
    const source = ':::: tabs position=bottom sync=lang\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ position: undefined, sync: undefined }))
    expect(next).toBe(':::: tabs\n@tab A\nContent A\n::::')
  })

  it('writes only position when an edge is chosen (style becomes derived)', () => {
    const source = ':::: tabs\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ position: 'left', style: 'vertical' }))
    expect(next).toBe(':::: tabs position=left\n@tab A\nContent A\n::::')
  })

  it('drops a legacy style token once a position is set', () => {
    const source = ':::: tabs style=vertical\n@tab A\nContent A\n::::'
    const next = updateTabsSourceHeader(source, 0, () => ({ position: 'top', style: 'horizontal' }))
    expect(next).toBe(':::: tabs position=top\n@tab A\nContent A\n::::')
  })
})

describe('addTabToSource', () => {
  it('appends a new @tab before container close', () => {
    const source = ':::: tabs\n@tab Tab 1\nContent 1\n::::'
    const next = addTabToSource(source, 0, 'Tab 2')
    expect(next).toBe(':::: tabs\n@tab Tab 1\nContent 1\n@tab Tab 2\n\n::::')
  })

  it('appends a new tab-item for directive tabs', () => {
    const source = ':::: tabs\n::: tab-item Tab 1\nContent 1\n:::\n::::'
    const next = addTabToSource(source, 0, 'Tab 2')
    expect(next).toContain('::: tab-item Tab 2')
  })

  it('respects nested container closes when finding container end', () => {
    const source = ':::: tabs\n@tab Outer\n::: note\nNote inside tab\n:::\n::::'
    const next = addTabToSource(source, 0, 'New Tab')
    expect(next).toBe(':::: tabs\n@tab Outer\n::: note\nNote inside tab\n:::\n@tab New Tab\n\n::::')
  })

  it('supports markers nested under up to three leading spaces and keeps the indent', () => {
    const source = '  :::: tabs\n  @tab Old\n  content\n  ::::'
    expect(renameTabInSource(source, 0, 0, 'New')).toBe('  :::: tabs\n  @tab New\n  content\n  ::::')
    const added = addTabToSource(source, 0, 'Two')
    expect(added).toBe('  :::: tabs\n  @tab Old\n  content\n  @tab Two\n  \n  ::::')
    expect(deleteTabInSource(added!, 0, 1)).toBe('  :::: tabs\n  @tab Old\n  content\n  ::::')
  })
})

describe('renameTabInSource', () => {
  it('renames an @tab segment while preserving its active prefix', () => {
    const source = ':::: tabs\n@tab+ Old Title\nContent\n@tab Second\nMore\n::::'
    const next = renameTabInSource(source, 0, 0, 'New Title')
    expect(next).toBe(':::: tabs\n@tab+ New Title\nContent\n@tab Second\nMore\n::::')
  })

  it('renames a directive tab-item segment', () => {
    const source = ':::: tabs\n::: tab-item Old\nContent\n:::\n::::'
    const next = renameTabInSource(source, 0, 0, 'New')
    expect(next).toBe(':::: tabs\n::: tab-item New\nContent\n:::\n::::')
  })

  it('does not touch titles inside nested containers', () => {
    const source = ':::: tabs\n@tab Outer\n::: tabs\n@tab Inner\nx\n:::\n::::'
    const next = renameTabInSource(source, 0, 0, 'Outer 2')
    expect(next).toContain('@tab Outer 2')
    expect(next).toContain('@tab Inner')
  })
})

describe('deleteTabInSource', () => {
  it('deletes an @tab segment', () => {
    const source = ':::: tabs\n@tab A\na\n@tab B\nb\n::::'
    expect(deleteTabInSource(source, 0, 0)).toBe(':::: tabs\n@tab B\nb\n::::')
  })

  it('deletes a directive tab-item segment', () => {
    const source = ':::: tabs\n::: tab-item A\na\n:::\n::: tab-item B\nb\n:::\n::::'
    const next = deleteTabInSource(source, 0, 0)
    expect(next).toBe(':::: tabs\n::: tab-item B\nb\n:::\n::::')
  })

  it('refuses to delete the last remaining tab', () => {
    const source = ':::: tabs\n@tab A\na\n::::'
    expect(deleteTabInSource(source, 0, 0)).toBeNull()
  })
})

describe('tabs rendering attributes', () => {
  it('renders vertical tabs attributes when style=vertical', () => {
    const md = ':::: tabs style=vertical\n@tab One\nFirst\n@tab Two\nSecond\n::::'
    const rendered = renderMarkdown(md)
    expect(rendered.html).toContain('data-tabs-style="vertical"')
  })

  it('renders variant and align data attributes', () => {
    const md = ':::: tabs variant=pills align=center\n@tab A\nContent A\n::::'
    const rendered = renderMarkdown(md)
    expect(rendered.html).toContain('data-tabs-variant="pills"')
    expect(rendered.html).toContain('data-tabs-align="center"')
  })

  it('renders position and sync attributes inside an outer wrapper', () => {
    const md = ':::: tabs position=bottom sync=lang\n@tab A\nContent A\n::::'
    const rendered = renderMarkdown(md)
    expect(rendered.html).toContain('data-tabs-position="bottom"')
    expect(rendered.html).toContain('data-tabs-sync="lang"')
    expect(rendered.html).toContain('<div class="markdown-tabs-outer"><div class="markdown-tabs"')
  })

  it('derives a vertical strip from left/right positions', () => {
    const left = renderMarkdown(':::: tabs position=left\n@tab A\nx\n::::')
    expect(left.html).toContain('data-tabs-style="vertical"')
    expect(left.html).toContain('data-tabs-position="left"')
    const right = renderMarkdown(':::: tabs position=right\n@tab A\nx\n::::')
    expect(right.html).toContain('data-tabs-style="vertical"')
    const bottom = renderMarkdown(':::: tabs position=bottom\n@tab A\nx\n::::')
    expect(bottom.html).not.toContain('data-tabs-style="vertical"')
  })

  it('keeps a legacy style=vertical note on the left edge without a position attr', () => {
    const rendered = renderMarkdown(':::: tabs style=vertical\n@tab A\nx\n::::')
    expect(rendered.html).toContain('data-tabs-style="vertical"')
    expect(rendered.html).not.toContain('data-tabs-position')
  })
})

describe('tabs rendering nested blocks', () => {
  it('supports nested code blocks, charts, and callouts inside tabs without breaking', () => {
    const md = [
      ':::: tabs',
      '@tab Code',
      '```ts',
      'const x = 1;',
      '```',
      '@tab Chart',
      '```chart',
      '{"type":"bar"}',
      '```',
      '@tab Callout',
      '> [!NOTE] Title',
      '> Callout text',
      '::::',
    ].join('\n')
    const rendered = renderMarkdown(md)
    expect(rendered.html).toContain('data-tab-button="0"')
    expect(rendered.html).toContain('data-tab-button="1"')
    expect(rendered.html).toContain('data-tab-button="2"')
    expect(rendered.html).toContain('data-chart')
    expect(rendered.html).toContain('code-block')
    expect(rendered.html).toContain('callout')
  })
})

describe('tabs rendering nested containers', () => {
  it('supports nested tabs inside tabs correctly without flattening inner tabs', () => {
    const md = [
      ':::: tabs',
      '@tab Outer 1',
      'Outer 1 content',
      '::: tabs style=vertical',
      '@tab Inner A',
      'Inner A content',
      '@tab Inner B',
      'Inner B content',
      ':::',
      '@tab Outer 2',
      'Outer 2 content',
      '::::',
    ].join('\n')
    const rendered = renderMarkdown(md)
    const root = document.createElement('div')
    root.innerHTML = rendered.html

    const outerTabs = root.querySelector(':scope > .markdown-tabs-outer > .markdown-tabs')
    expect(outerTabs).not.toBeNull()

    const outerButtons = [...outerTabs!.querySelectorAll<HTMLButtonElement>('[data-tab-button]')].filter(
      (b) => b.closest('[data-tabs]') === outerTabs,
    )
    expect(outerButtons.map((b) => b.textContent)).toEqual(['Outer 1', 'Outer 2'])

    const innerTabs = root.querySelector('.markdown-tabs [data-tabs]')
    expect(innerTabs).not.toBeNull()
    const innerButtons = [...innerTabs!.querySelectorAll<HTMLButtonElement>('[data-tab-button]')].filter(
      (b) => b.closest('[data-tabs]') === innerTabs,
    )
    expect(innerButtons.map((b) => b.textContent)).toEqual(['Inner A', 'Inner B'])
  })
})

describe('nested tab selection scoping', () => {
  it('does not scramble nested tabs when switching outer tab', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <div class="tab-list" role="tablist">
          <button data-tab-button="0" aria-selected="true">Outer 1</button>
          <button data-tab-button="1" aria-selected="false">Outer 2</button>
        </div>
        <section data-tab-panel="0">
          <div class="markdown-tabs" data-tabs data-line="5">
            <div class="tab-list" role="tablist">
              <button data-tab-button="0" aria-selected="false">Inner A</button>
              <button data-tab-button="1" aria-selected="true">Inner B</button>
            </div>
            <section data-tab-panel="0" hidden></section>
            <section data-tab-panel="1"></section>
          </div>
        </section>
        <section data-tab-panel="1" hidden>Outer 2 content</section>
      </div>
    `
    const outerBtn2 = root.querySelectorAll<HTMLButtonElement>('[data-tab-button]')[1]!
    selectMarkdownTab(outerBtn2)

    expect(outerBtn2.getAttribute('aria-selected')).toBe('true')
    const innerBtns = root.querySelectorAll<HTMLButtonElement>('.markdown-tabs .markdown-tabs [data-tab-button]')
    expect(innerBtns[0]!.getAttribute('aria-selected')).toBe('false')
    expect(innerBtns[1]!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('vertical tab keyboard navigation', () => {
  it('navigates with ArrowDown and ArrowUp in vertical tabs', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-tabs-style="vertical" data-line="0">
        <div class="tab-list" role="tablist">
          <button data-tab-button="0" aria-selected="true">A</button>
          <button data-tab-button="1" aria-selected="false">B</button>
          <button data-tab-button="2" aria-selected="false">C</button>
        </div>
        <section data-tab-panel="0"></section>
        <section data-tab-panel="1" hidden></section>
        <section data-tab-panel="2" hidden></section>
      </div>
    `
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-tab-button]')
    moveMarkdownTabFocus(buttons[0]!, 'ArrowDown')
    expect(buttons[1]!.getAttribute('aria-selected')).toBe('true')

    moveMarkdownTabFocus(buttons[1]!, 'ArrowUp')
    expect(buttons[0]!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('executeTabsAction layout popover and settings', () => {
  it('toggles the layout popover open and closed with aria state', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs ink-prose" data-tabs data-line="0">
        <div class="markdown-tabs-header-wrap">
          <div class="markdown-tabs-toolbar">
            <button type="button" data-tabs-action="toggle-layout" aria-expanded="false" aria-controls="p1">Layout</button>
            <div class="markdown-tabs-layout-popover" id="p1" role="group" hidden></div>
          </div>
        </div>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="toggle-layout"]')!
    const block = root.querySelector<HTMLElement>('.markdown-tabs')!
    const popover = root.querySelector<HTMLElement>('.markdown-tabs-layout-popover')!

    await executeTabsAction('toggle-layout', btn, '', vi.fn(), vi.fn())
    expect(popover.hidden).toBe(false)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(block.classList.contains('is-layout-open')).toBe(true)

    await executeTabsAction('toggle-layout', btn, '', vi.fn(), vi.fn())
    expect(popover.hidden).toBe(true)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(block.classList.contains('is-layout-open')).toBe(false)
  })

  it('executes toggle-settings to show settings panel', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <div class="markdown-tabs-header-wrap">
          <button type="button" data-tabs-action="toggle-settings">Settings</button>
          <div class="markdown-tabs-settings-panel" hidden></div>
        </div>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="toggle-settings"]')!
    const panel = root.querySelector<HTMLElement>('.markdown-tabs-settings-panel')!
    const handled = await executeTabsAction('toggle-settings', btn, '', vi.fn(), vi.fn())
    expect(handled).toBe(true)
    expect(panel.hidden).toBe(false)
  })

  it('closes the popover on Escape and returns the trigger for focus', () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs is-layout-open" data-tabs data-line="0">
        <div class="markdown-tabs-header-wrap">
          <div class="markdown-tabs-toolbar">
            <button data-tabs-action="toggle-layout" aria-expanded="true"></button>
            <div class="markdown-tabs-layout-popover"></div>
          </div>
        </div>
      </div>
    `
    const inner = root.querySelector<HTMLElement>('.markdown-tabs-layout-popover')!
    const trigger = closeLayoutPopoverFromEvent(inner)
    expect(trigger?.getAttribute('data-tabs-action')).toBe('toggle-layout')
    expect(root.querySelector('.markdown-tabs')!.classList.contains('is-layout-open')).toBe(false)
  })

  it('dismisses an open popover on a click elsewhere in the surface', async () => {
    const root = document.createElement('div')
    root.className = 'ink-prose'
    root.innerHTML = `
      <div class="markdown-tabs is-layout-open" data-tabs data-line="0">
        <div class="markdown-tabs-header-wrap">
          <div class="markdown-tabs-toolbar">
            <button data-tabs-action="toggle-layout" aria-expanded="true"></button>
            <div class="markdown-tabs-layout-popover"><button data-tabs-action="set-option" data-tabs-set="position" data-tabs-val="top"></button></div>
          </div>
        </div>
        <section data-tab-panel="0"><p>body</p></section>
      </div>
    `
    const body = root.querySelector<HTMLElement>('p')!
    dismissTabsOverlays(body)
    const block = root.querySelector<HTMLElement>('.markdown-tabs')!
    expect(block.classList.contains('is-layout-open')).toBe(false)
    expect(root.querySelector('.markdown-tabs-layout-popover')!.hasAttribute('hidden')).toBe(true)
  })
})

describe('executeTabsAction options and enhancement', () => {
  it('executes set-option to update variant', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <button type="button" data-tabs-action="set-option" data-tabs-set="variant" data-tabs-val="pills">Pills</button>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="set-option"]')!
    const onEdit = vi.fn()
    const content = ':::: tabs style=vertical\n@tab A\nContent\n::::'
    const handled = await executeTabsAction('set-option', btn, content, onEdit, vi.fn())
    expect(handled).toBe(true)
    expect(onEdit).toHaveBeenCalledWith(':::: tabs style=vertical variant=pills\n@tab A\nContent\n::::')
  })

  it('enhances tabs with layout trigger, four-way popover and settings panel in root', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="markdown-tabs" data-tabs data-line="0"><div class="tab-list"></div></div>'
    enhanceTabsInRoot(root)
    expect(root.querySelector('.markdown-tabs-toolbar')).not.toBeNull()
    expect(root.querySelector('[data-tabs-action="toggle-layout"]')).not.toBeNull()
    const popover = root.querySelector<HTMLElement>('.markdown-tabs-layout-popover')
    expect(popover).not.toBeNull()
    expect(popover!.querySelectorAll('[data-tabs-val]')).toHaveLength(4)
    expect(root.querySelector('.markdown-tabs-settings-panel')).not.toBeNull()
    expect(root.querySelectorAll('.tabs-settings-title')).toHaveLength(5)
  })

  it('marks the active placement in the popover for a legacy vertical block', () => {
    const root = document.createElement('div')
    root.innerHTML = '<div class="markdown-tabs" data-tabs data-tabs-style="vertical" data-line="0"><div class="tab-list"></div></div>'
    enhanceTabsInRoot(root)
    const active = root.querySelector('.tabs-layout-opt.is-active')
    expect(active?.getAttribute('data-tabs-val')).toBe('left')
  })

  it('writes only the position when picking an edge, dropping a legacy style token', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <button type="button" data-tabs-action="set-option" data-tabs-set="position" data-tabs-val="right">Right</button>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="set-option"]')!
    const onEdit = vi.fn()
    await executeTabsAction('set-option', btn, ':::: tabs style=vertical\n@tab A\nContent\n::::', onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(':::: tabs position=right\n@tab A\nContent\n::::')
  })

  it('renames the active tab through rename-tab', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <div class="markdown-tabs-header-wrap">
          <input data-tabs-rename-input value="New Name">
          <button data-tabs-action="rename-tab">Rename</button>
        </div>
        <button data-tab-button="0" aria-selected="true">Old</button>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="rename-tab"]')!
    const onEdit = vi.fn()
    const content = ':::: tabs\n@tab Old\nContent\n::::'
    await executeTabsAction('rename-tab', btn, content, onEdit, vi.fn())
    expect(onEdit).toHaveBeenCalledWith(':::: tabs\n@tab New Name\nContent\n::::')
  })

  it('refuses to delete the last tab through delete-tab', async () => {
    const root = document.createElement('div')
    root.innerHTML = `
      <div class="markdown-tabs" data-tabs data-line="0">
        <button data-tabs-action="delete-tab">Delete</button>
        <button data-tab-button="0" aria-selected="true">Only</button>
      </div>
    `
    const btn = root.querySelector<HTMLButtonElement>('[data-tabs-action="delete-tab"]')!
    const onEdit = vi.fn()
    const toast = vi.fn()
    await executeTabsAction('delete-tab', btn, ':::: tabs\n@tab Only\nx\n::::', onEdit, toast)
    expect(onEdit).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'warning' }))
  })
})

function syncedFixture(group: string, noteId?: string): HTMLElement {
  const host = document.createElement('div')
  host.className = 'ink-prose'
  if (noteId) host.dataset.noteId = noteId
  host.innerHTML = `
    <div class="markdown-tabs" data-tabs data-tabs-sync="${group}" data-line="0">
      <div class="tab-list"><button data-tab-button="0" aria-selected="true">A1</button><button data-tab-button="1" aria-selected="false">A2</button></div>
      <section data-tab-panel="0"></section><section data-tab-panel="1" hidden></section>
    </div>
    <div class="markdown-tabs" data-tabs data-tabs-sync="${group}" data-line="10">
      <div class="tab-list"><button data-tab-button="0" aria-selected="true">B1</button><button data-tab-button="1" aria-selected="false">B2</button></div>
      <section data-tab-panel="0"></section><section data-tab-panel="1" hidden></section>
    </div>
    <div class="markdown-tabs" data-tabs data-tabs-sync="other" data-line="20">
      <div class="tab-list"><button data-tab-button="0" aria-selected="true">C1</button><button data-tab-button="1" aria-selected="false">C2</button></div>
      <section data-tab-panel="0"></section><section data-tab-panel="1" hidden></section>
    </div>
  `
  return host
}

describe('synced tab groups', () => {
  it('switches every block sharing the group but leaves other groups alone', () => {
    const host = syncedFixture('lang')
    const firstBlock = host.querySelector<HTMLElement>('[data-line="0"]')!
    const secondBlock = host.querySelector<HTMLElement>('[data-line="10"]')!
    const otherBlock = host.querySelector<HTMLElement>('[data-line="20"]')!

    selectMarkdownTab(firstBlock.querySelector<HTMLButtonElement>('[data-tab-button="1"]')!)

    expect(secondBlock.querySelector('[data-tab-button="1"]')!.getAttribute('aria-selected')).toBe('true')
    expect(secondBlock.querySelector<HTMLElement>('[data-tab-panel="1"]')!.hidden).toBe(false)
    expect(otherBlock.querySelector('[data-tab-button="0"]')!.getAttribute('aria-selected')).toBe('true')
  })

  it('remembers the choice per note and restores it during enhancement', () => {
    const host = syncedFixture('lang', 'note-7')
    const firstBlock = host.querySelector<HTMLElement>('[data-line="0"]')!

    selectMarkdownTab(firstBlock.querySelector<HTMLButtonElement>('[data-tab-button="1"]')!)
    expect(readSyncedTabChoice('note-7', 'lang')).toBe(1)

    const fresh = document.createElement('div')
    fresh.innerHTML = `
      <div class="markdown-tabs" data-tabs data-tabs-sync="lang" data-line="0">
        <div class="tab-list"><button data-tab-button="0" aria-selected="true">A1</button><button data-tab-button="1" aria-selected="false">A2</button></div>
        <section data-tab-panel="0"></section><section data-tab-panel="1" hidden></section>
      </div>
    `
    enhanceTabsInRoot(fresh, { noteId: 'note-7' })
    const block = fresh.querySelector<HTMLElement>('.markdown-tabs')!
    expect(block.querySelector('[data-tab-button="1"]')!.getAttribute('aria-selected')).toBe('true')
    expect(block.querySelector<HTMLElement>('[data-tab-panel="1"]')!.hidden).toBe(false)
  })
})
