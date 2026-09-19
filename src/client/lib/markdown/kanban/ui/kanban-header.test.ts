import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, createElement, type ComponentProps } from 'react'
import { initI18n, setLocale, t } from '../../../../lib/i18n'
import { renderElement } from '../../../test-render'
import { formatKanbanPropertyName } from '../i18n-helpers'
import { ZH_CN_MESSAGES } from '../../../../../shared/locales/zh-CN'
import { KanbanHeader } from './kanban-header'
import type { KanbanData, KanbanItem, KanbanProperty } from '../types'

beforeAll(async () => {
  await initI18n()
})

const statusColumn = {
  id: 'status',
  name: 'Status',
  type: 'select' as const,
  options: [
    { id: 'done', label: 'Done', color: 'green' as const },
    { id: 'todo', label: 'To Do', color: 'gray' as const },
  ],
}

function item(id: string, status: string): KanbanItem {
  return { id, title: id, properties: { status } }
}

const allItems = [item('a', 'done'), item('b', 'todo')]

const data: KanbanData = {
  columns: [statusColumn],
  items: allItems,
  views: [{ id: 'v', name: 'Board', type: 'board', groupBy: 'status' }],
}

type HeaderOverrides = Omit<Partial<ComponentProps<typeof KanbanHeader>>, 'viewPanelId'>

function headerProps(visibleItems: KanbanItem[], extra: HeaderOverrides = {}): ComponentProps<typeof KanbanHeader> {
  return {
    data,
    visibleItems,
    activeView: data.views[0]!,
    searchQuery: '',
    filters: [],
    sorts: [],
    onSelectView: vi.fn(),
    onSearchChange: vi.fn(),
    onChangeFilters: vi.fn(),
    onChangeSorts: vi.fn(),
    onAddItem: vi.fn(),
    viewPanelId: 'view-panel',
    ...extra,
  }
}

function renderHeader(visibleItems: KanbanItem[], extra: HeaderOverrides = {}) {
  return renderElement(createElement(KanbanHeader, headerProps(visibleItems, extra)))
}

describe('KanbanHeader progress bar scope', () => {
  it('segments reflect the visible (filtered) items, not the whole board', () => {
    const rendered = renderHeader([allItems[0]!])
    try {
      expect(document.querySelector('[title="Done: 1 (100%)"]')).toBeTruthy()
      expect(document.querySelector('[title="To Do: 1 (50%)"]')).toBeNull()
    } finally {
      rendered.unmount()
    }
  })

  it('shows every status when nothing is filtered out', () => {
    const rendered = renderHeader(allItems)
    try {
      expect(document.querySelector('[title="Done: 1 (50%)"]')).toBeTruthy()
      expect(document.querySelector('[title="To Do: 1 (50%)"]')).toBeTruthy()
    } finally {
      rendered.unmount()
    }
  })
})

const tableColumns: KanbanProperty[] = [
  { id: 'title', name: 'Title', type: 'title' },
  statusColumn,
  { id: 'spec', name: 'Spec file', type: 'text' },
]

function renderTableHeader(hiddenColumns: string[], onToggleHiddenColumn = vi.fn()) {
  const tableData: KanbanData = {
    columns: tableColumns,
    items: allItems,
    views: [{ id: 'vt', name: 'Table', type: 'table', groupBy: 'status', hiddenColumns }],
  }
  const rendered = renderElement(
    createElement(KanbanHeader, {
      data: tableData,
      visibleItems: allItems,
      activeView: tableData.views[0]!,
      searchQuery: '',
      filters: [],
      sorts: [],
      onSelectView: vi.fn(),
      onSearchChange: vi.fn(),
      onChangeFilters: vi.fn(),
      onChangeSorts: vi.fn(),
      onAddItem: vi.fn(),
      onToggleHiddenColumn,
      viewPanelId: 'view-panel',
    }),
  )
  return { ...rendered, onToggleHiddenColumn }
}

function columnToggle(container: HTMLElement, columnName: string): HTMLInputElement | null {
  const label = [...container.querySelectorAll('label')].find((el) => el.textContent?.includes(columnName))
  return label?.querySelector('input[type="checkbox"]') ?? null
}

function columnName(columnId: string): string {
  const column = tableColumns.find((col) => col.id === columnId)
  if (!column) throw new Error(`no fixture column "${columnId}"`)
  return formatKanbanPropertyName(column)
}

function buttonNamed(container: HTMLElement, name: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(name))
  if (!button) throw new Error(`no button labelled "${name}"`)
  return button
}

describe('KanbanHeader column visibility', () => {
  it('lists the table columns and reports the one being toggled', () => {
    const { container, unmount, onToggleHiddenColumn } = renderTableHeader(['spec'])
    try {
      act(() => { buttonNamed(container, t('preview.kanban_columns')).click() })
      const panel = container.querySelector<HTMLElement>('[role="dialog"]')!
      expect(columnToggle(panel, columnName('title'))).toBeNull()
      expect(columnToggle(panel, columnName('spec'))?.checked).toBe(false)
      act(() => { columnToggle(panel, columnName('status'))!.click() })
      expect(onToggleHiddenColumn).toHaveBeenCalledWith('status')
    } finally {
      unmount()
    }
  })

  it('keeps the board view options free of column toggles', () => {
    const rendered = renderHeader(allItems, {
      cardSize: 'medium',
      onChangeCardSize: vi.fn(),
      onChangeGroupBy: vi.fn(),
      onToggleHiddenColumn: vi.fn(),
    })
    try {
      act(() => { buttonNamed(rendered.container, t('preview.kanban_group_by')).click() })
      const panel = rendered.container.querySelector<HTMLElement>('[role="dialog"]')!
      expect(panel.querySelector('select')).toBeTruthy()
      expect(panel.querySelector('input[type="checkbox"]')).toBeNull()
    } finally {
      rendered.unmount()
    }
  })
})

const historyProps = { canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn() }

function titlesOf(container: HTMLElement) {
  const undo = container.querySelector<HTMLElement>(`[aria-label="${t('common.undo')}"]`)
  const redo = container.querySelector<HTMLElement>(`[aria-label="${t('command.redo')}"]`)
  expect(undo?.getAttribute('title'), 'the undo button has no hint').toBeTruthy()
  expect(redo?.getAttribute('title'), 'the redo button has no hint').toBeTruthy()
  return { undo: undo!.getAttribute('title'), redo: redo!.getAttribute('title') }
}

// A hint assembled in JSX outlives a locale switch only in its parentheses; reading the expected
// text from the zh-CN resource is what proves the whole message, wrapper included, is translated.
function zhHint(key: 'preview.kanban_undo_shortcut' | 'preview.kanban_redo_shortcut', shortcut: string) {
  return ZH_CN_MESSAGES[key].replace('{shortcut}', shortcut)
}

// `IS_MAC` is frozen when the hotkeys module is first read, so the macOS branch needs a fresh
// module graph with the platform already stubbed — the same resetModules move the store tests use.
async function hintTitlesOnPlatform(platform: string) {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'platform')
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
  vi.resetModules()
  try {
    const { initI18n: initLocale } = await import('../../../../lib/i18n')
    await initLocale()
    const { renderElement: mountHeader } = await import('../../../test-render')
    const { KanbanHeader: PlatformHeader } = await import('./kanban-header')
    const rendered = mountHeader(createElement(PlatformHeader, headerProps(allItems, historyProps)))
    try {
      return titlesOf(rendered.container)
    } finally {
      rendered.unmount()
    }
  } finally {
    if (previous)
      Object.defineProperty(navigator, 'platform', previous)
    else
      Reflect.deleteProperty(navigator, 'platform')
    vi.resetModules()
  }
}

describe('KanbanHeader history shortcut hints', () => {
  afterEach(async () => {
    await setLocale('en-US', false)
  })

  it('promises the chord that actually redoes on every platform', () => {
    const rendered = renderHeader(allItems, historyProps)
    try {
      expect(titlesOf(rendered.container)).toEqual({ undo: 'Undo (Ctrl+Z)', redo: 'Redo (Ctrl+Shift+Z)' })
    } finally {
      rendered.unmount()
    }
  })

  it('renders the command glyph instead of Ctrl on macOS', async () => {
    expect(await hintTitlesOnPlatform('MacIntel')).toEqual({ undo: 'Undo (⌘+Z)', redo: 'Redo (⌘+⇧+Z)' })
  })

  it('keeps the whole hint in one message so zh-CN translates it', async () => {
    await setLocale('zh-CN', false)
    const rendered = renderHeader(allItems, historyProps)
    try {
      expect(titlesOf(rendered.container)).toEqual({
        undo: zhHint('preview.kanban_undo_shortcut', 'Ctrl+Z'),
        redo: zhHint('preview.kanban_redo_shortcut', 'Ctrl+Shift+Z'),
      })
    } finally {
      rendered.unmount()
    }
  })
})
