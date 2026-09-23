/**
 * A board's own actions as palette items. The list is what a reader searches, so what is pinned here
 * is the wording (one entry per view, the view on screen marked as such) and the narrowing: a command
 * that cannot do anything — clearing an empty selection, redoing with nothing to redo — is left out
 * rather than offered and silently ignored.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import type { KanbanSurfaceCommands } from '../../../lib/markdown/kanban'
import { boardCommandItems } from './use-commands'

beforeAll(async () => {
  await initI18n()
})

function surface(over: Partial<KanbanSurfaceCommands> = {}): KanbanSurfaceCommands {
  return {
    boardTitle: 'Gate Board',
    views: [
      { id: 'v', name: 'Board', icon: null },
      { id: 't', name: 'Table', icon: null },
    ],
    activeViewId: 'v',
    selectedCount: 0,
    canUndo: false,
    canRedo: false,
    addCard: vi.fn(),
    selectView: vi.fn(),
    selectAllVisible: vi.fn(),
    clearSelection: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...over,
  }
}

function labels(items: ReturnType<typeof boardCommandItems>): string[] {
  return items.map((item) => item.label)
}

describe('the board’s palette items', () => {
  it('offers a card, every view by name, and the visible-set selection', () => {
    const items = boardCommandItems(surface())
    expect(labels(items)).toEqual([
      t('preview.kanban_new_item'),
      t('preview.kanban_switch_view', { title: 'Board' }),
      t('preview.kanban_switch_view', { title: 'Table' }),
      t('preview.kanban_select_all_visible'),
    ])
    expect(items.every((item) => item.group === 'Gate Board')).toBe(true)
  })

  it('marks the view on screen without hiding the others', () => {
    const items = boardCommandItems(surface({ activeViewId: 't' }))
    const table = items.find((item) => item.id === 'cmd-kanban-view-t')!
    const board = items.find((item) => item.id === 'cmd-kanban-view-v')!
    expect(table.detail).toBe(t('preview.kanban_current_view'))
    expect(board.detail).toBeUndefined()
  })

  it('leaves out what cannot run: an empty selection, an empty history', () => {
    const ids = boardCommandItems(surface()).map((item) => item.id)
    expect(ids).not.toContain('cmd-kanban-clear-selection')
    expect(ids).not.toContain('cmd-kanban-undo')
    expect(ids).not.toContain('cmd-kanban-redo')
    const full = boardCommandItems(surface({ selectedCount: 3, canUndo: true, canRedo: true })).map((item) => item.id)
    expect(full).toContain('cmd-kanban-clear-selection')
    expect(full).toContain('cmd-kanban-undo')
    expect(full).toContain('cmd-kanban-redo')
  })

  it('runs the board’s own writer for each item', () => {
    const commands = surface({ selectedCount: 1, canUndo: true, canRedo: true })
    const items = boardCommandItems(commands)
    for (const item of items) item.run()
    expect(commands.addCard).toHaveBeenCalledTimes(1)
    expect(commands.selectView).toHaveBeenCalledWith('v')
    expect(commands.selectView).toHaveBeenCalledWith('t')
    expect(commands.selectAllVisible).toHaveBeenCalledTimes(1)
    expect(commands.clearSelection).toHaveBeenCalledTimes(1)
    expect(commands.undo).toHaveBeenCalledTimes(1)
    expect(commands.redo).toHaveBeenCalledTimes(1)
  })

  it('promises the chords the board itself listens for', () => {
    const items = boardCommandItems(surface({ canUndo: true, canRedo: true }))
    expect(items.find((item) => item.id === 'cmd-kanban-undo')!.combo).toBe('mod+z')
    expect(items.find((item) => item.id === 'cmd-kanban-redo')!.combo).toBe('mod+shift+z')
  })
})
