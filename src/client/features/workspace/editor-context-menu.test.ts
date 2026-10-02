import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { pinyin } from 'pinyin-pro'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { renderElement } from '../../lib/test-render'
import { Menu } from '../../components/overlay'
import { filterMenuItems, matchMenuItem } from '../../components/overlay/menu-search'
import { useEditorContextMenu } from './use-editor-context-menu'
import { ContextMenuToolbar } from './context-menu/toolbar'
import type { EditorContextData } from './context-menu-detect'

function createEditorView(doc: string, selection?: { from: number; to: number }) {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  const state = EditorState.create({
    doc,
    selection: selection ? EditorSelection.single(selection.from, selection.to) : undefined,
  })
  return new EditorView({ state, parent })
}

function Probe({
  editorView,
  editorContext,
  content,
  onCapture,
}: {
  editorView: EditorView
  editorContext: EditorContextData
  content: string
  onCapture: (data: ReturnType<typeof useEditorContextMenu>) => void
}) {
  const data = useEditorContextMenu({
    point: { x: 100, y: 100 },
    onClose: vi.fn(),
    editorView,
    editorContext,
    content,
    onEditContent: vi.fn(),
    onJumpToLine: vi.fn(),
  })
  onCapture(data)
  return null
}

describe('useEditorContextMenu common vs private structure', () => {
  it('provides disabled cut and copy on empty line with full common items', () => {
    const view = createEditorView('Line 1\n\nLine 3')
    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: { type: 'empty', pos: 7, lineNumber: 2 },
        content: 'Line 1\n\nLine 3',
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    expect(captured.toolbarProps.canCut).toBe(false)
    expect(captured.toolbarProps.canCopy).toBe(false)
    expect(captured.toolbarProps.canPaste).toBe(true)

    const ids = captured.menuItems.map((item) => item.id)
    expect(ids).toEqual(['select-all', 'insert-sub'])

    expect(ids).not.toContain('undo')
    expect(ids).not.toContain('redo')
    expect(ids).not.toContain('cut')
    expect(ids).not.toContain('copy')
    expect(ids).not.toContain('paste')

    const selectAllItem = captured.menuItems.find((i) => i.id === 'select-all')
    expect(selectAllItem?.separatorBefore).toBe(false)

    rendered.unmount()
    view.destroy()
  })

  it('separates private codeblock items and common items without duplication', () => {
    const view = createEditorView('```ts\nconst x = 1;\n```')
    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: {
          type: 'codeblock',
          pos: 10,
          lineNumber: 2,
          codeBlock: { language: 'ts', code: 'const x = 1;', from: 0, to: 24 },
        },
        content: '```ts\nconst x = 1;\n```',
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    expect(captured.toolbarProps.canCopy).toBe(true)
    expect(captured.toolbarProps.canCut).toBe(false)

    const ids = captured.menuItems.map((item) => item.id)
    expect(ids).not.toContain('copy-code')
    expect(ids).toContain('format-code')
    expect(ids).toContain('delete-codeblock')

    expect(ids).not.toContain('undo')
    expect(ids).not.toContain('redo')
    expect(ids).not.toContain('cut')
    expect(ids).not.toContain('copy')
    expect(ids).not.toContain('paste')

    expect(ids).toContain('select-all')
    expect(ids).toContain('insert-sub')

    const selectAllItem = captured.menuItems.find((i) => i.id === 'select-all')
    expect(selectAllItem?.separatorBefore).toBe(true)

    rendered.unmount()
    view.destroy()
  })

  it('separates private heading items and common items without duplication', () => {
    const view = createEditorView('# Main Heading')
    let captured!: ReturnType<typeof useEditorContextMenu>
    const rendered = renderElement(
      createElement(Probe, {
        editorView: view,
        editorContext: {
          type: 'heading',
          pos: 5,
          lineNumber: 1,
          heading: { level: 1, text: 'Main Heading', from: 0, to: 14 },
        },
        content: '# Main Heading',
        onCapture: (data) => {
          captured = data
        },
      }),
    )

    expect(captured.toolbarProps.canCopy).toBe(true)

    const ids = captured.menuItems.map((item) => item.id)
    expect(ids[0]).toBe('heading-convert-sub')
    expect(ids).not.toContain('copy-heading-text')

    expect(ids).not.toContain('undo')
    expect(ids).not.toContain('redo')
    expect(ids).not.toContain('cut')
    expect(ids).not.toContain('copy')
    expect(ids).not.toContain('paste')

    expect(ids).toContain('select-all')
    expect(ids).toContain('insert-sub')

    const selectAllItem = captured.menuItems.find((i) => i.id === 'select-all')
    expect(selectAllItem?.separatorBefore).toBe(true)

    rendered.unmount()
    view.destroy()
  })
})

describe('ContextMenuToolbar', () => {
  it('renders quick action buttons with accessible toolbar role and labels', () => {
    const onCut = vi.fn()
    const onCopy = vi.fn()
    const onPaste = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const onClose = vi.fn()

    const rendered = renderElement(
      createElement(ContextMenuToolbar, {
        canCut: true,
        canCopy: true,
        canPaste: true,
        canUndo: true,
        canRedo: true,
        onCut,
        onCopy,
        onPaste,
        onUndo,
        onRedo,
        onClose,
      }),
    )

    const toolbar = rendered.container.querySelector('[role="toolbar"]')
    expect(toolbar).not.toBeNull()

    const buttons = rendered.container.querySelectorAll('button')
    expect(buttons.length).toBe(5)

    buttons[0]?.click()
    expect(onCut).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    rendered.unmount()
  })

  it('navigates to search input on ArrowDown when inside Menu', () => {
    const onCut = vi.fn()
    const onClose = vi.fn()
    const items = [{ id: 'test', label: 'Test' }]

    const rendered = renderElement(
      createElement(Menu, {
        anchor: { x: 50, y: 50 },
        open: true,
        onClose,
        items,
        searchable: true,
        header: createElement(ContextMenuToolbar, {
          canCut: true,
          onCut,
          onClose,
        }),
      }),
    )

    const firstBtn = document.body.querySelector<HTMLButtonElement>('[role="toolbar"] button')
    expect(firstBtn).not.toBeNull()
    firstBtn?.focus()
    expect(document.activeElement).toBe(firstBtn)

    firstBtn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))

    const searchInput = document.body.querySelector('input[type="text"]')
    expect(document.activeElement).toBe(searchInput)

    rendered.unmount()
  })
})

describe('ContextMenu Search & Matcher', () => {
  it('matches by direct substring, english initials, and pinyin initials', () => {
    expect(matchMenuItem('select', 'Select All', pinyin)).toBe(true)
    expect(matchMenuItem('sa', 'Select All', pinyin)).toBe(true)
    expect(matchMenuItem('save', 'Select All', pinyin)).toBe(false)
    expect(matchMenuItem('toc', 'Table of Contents', pinyin)).toBe(true)

    expect(matchMenuItem('\u8868\u683c', '\u63d2\u5165 \u203a \u8868\u683c', pinyin)).toBe(true)
    expect(matchMenuItem('bg', '\u8868\u683c', pinyin)).toBe(true)
    expect(matchMenuItem('crbg', '\u63d2\u5165 \u203a \u8868\u683c', pinyin)).toBe(true)
    expect(matchMenuItem('biaoge', '\u8868\u683c', pinyin)).toBe(true)
    expect(matchMenuItem('jc', '\u683c\u5f0f \u203a \u52a0\u7c97', pinyin)).toBe(true)
    expect(matchMenuItem('xyz', '\u8868\u683c', pinyin)).toBe(false)
  })

  it('filters menu items and flattens matching subItems', () => {
    const items = [
      { id: 'select-all', label: 'Select All' },
      {
        id: 'insert-sub',
        label: '\u63d2\u5165',
        subItems: [
          { id: 'table', label: '\u8868\u683c' },
          { id: 'codeblock', label: '\u4ee3\u7801\u5757' },
        ],
      },
    ]

    const matchedBg = filterMenuItems(items, 'bg', pinyin)
    expect(matchedBg.map((i) => i.id)).toEqual(['insert-sub:table'])
    expect(matchedBg[0]?.label).toBe('\u63d2\u5165 \u203a \u8868\u683c')

    const matchedCr = filterMenuItems(items, 'cr', pinyin)
    expect(matchedCr.some((i) => i.id === 'insert-sub')).toBe(true)
    expect(matchedCr.some((i) => i.id === 'insert-sub:table')).toBe(true)

    const emptyFilter = filterMenuItems(items, '', pinyin)
    expect(emptyFilter).toEqual(items)
  })

  it('filters toolbar actions into search results when query matches', () => {
    const items = [{ id: 'select-all', label: 'Select All' }]
    const toolbarActions = [
      { id: 'toolbar-copy', label: '\u590d\u5236' },
      { id: 'toolbar-cut', label: '\u526a\u5207' },
      { id: 'toolbar-paste', label: '\u7c98\u8d34', disabled: true },
    ]

    const matchedCopy = filterMenuItems(items, '\u590d\u5236', pinyin, toolbarActions)
    expect(matchedCopy.some((i) => i.id === 'tb-toolbar-copy')).toBe(true)
    expect(matchedCopy.some((i) => i.id === 'select-all')).toBe(false)

    const matchedFz = filterMenuItems(items, 'fz', pinyin, toolbarActions)
    expect(matchedFz.some((i) => i.id === 'tb-toolbar-copy')).toBe(true)

    const matchedPaste = filterMenuItems(items, '\u7c98\u8d34', pinyin, toolbarActions)
    expect(matchedPaste.some((i) => i.id === 'tb-toolbar-paste')).toBe(false)
  })
})

describe('Menu Layout & Keyboard Interaction with Search and Toolbar', () => {
  it('renders fixed header, fixed searchbox and scrollable list container', () => {
    const onClose = vi.fn()
    const items = [
      { id: 'item1', label: 'Item 1' },
      { id: 'item2', label: 'Item 2' },
    ]

    const rendered = renderElement(
      createElement(Menu, {
        anchor: { x: 50, y: 50 },
        open: true,
        onClose,
        items,
        searchable: true,
        header: createElement('div', { 'data-testid': 'custom-header' }, 'Header Content'),
      }),
    )

    const menu = document.body.querySelector('[role="menu"]')
    expect(menu).not.toBeNull()
    expect(menu?.classList.contains('flex')).toBe(true)
    expect(menu?.classList.contains('flex-col')).toBe(true)
    expect(menu?.classList.contains('overflow-hidden')).toBe(true)

    const header = document.body.querySelector('[data-testid="custom-header"]')
    expect(header?.parentElement?.classList.contains('shrink-0')).toBe(true)

    const searchInput = document.body.querySelector('input[type="text"]')
    expect(searchInput).not.toBeNull()
    expect(searchInput?.closest('.shrink-0')).not.toBeNull()

    const scrollContainer = document.body.querySelector('.overflow-y-auto')
    expect(scrollContainer).not.toBeNull()
    expect(scrollContainer?.classList.contains('flex-1')).toBe(true)

    rendered.unmount()
  })

  it('ignores Enter key in search box during IME composition', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const items = [{ id: 'test-item', label: 'Test Item', onSelect }]

    const rendered = renderElement(
      createElement(Menu, {
        anchor: { x: 50, y: 50 },
        open: true,
        onClose,
        items,
        searchable: true,
      }),
    )

    const searchInput = document.body.querySelector('input[type="text"]')
    expect(searchInput).not.toBeNull()

    const imeEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(imeEnter, 'isComposing', { value: true })
    searchInput?.dispatchEvent(imeEnter)

    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    const regularEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    searchInput?.dispatchEvent(regularEnter)

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)

    rendered.unmount()
  })

  it('forwards wheel scrolling from header area to scroll container', () => {
    const onClose = vi.fn()
    const items = [
      { id: 'item1', label: 'Item 1' },
      { id: 'item2', label: 'Item 2' },
    ]

    const rendered = renderElement(
      createElement(Menu, {
        anchor: { x: 50, y: 50 },
        open: true,
        onClose,
        items,
        searchable: true,
        header: createElement('div', { 'data-testid': 'custom-header' }, 'Header Content'),
      }),
    )

    const menu = document.body.querySelector('[role="menu"]')
    const scrollContainer = document.body.querySelector('.overflow-y-auto') as HTMLElement
    expect(menu).not.toBeNull()
    expect(scrollContainer).not.toBeNull()

    const wheelEvent = new WheelEvent('wheel', { deltaY: 40, bubbles: true })
    menu?.dispatchEvent(wheelEvent)

    expect(scrollContainer.scrollTop).toBe(40)

    rendered.unmount()
  })
})
