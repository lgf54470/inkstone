import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CalendarDays,
  Columns2,
  Download,
  Eye,
  FilePlus2,
  FolderClosed,
  FolderPlus,
  Globe,
  Hash,
  Kanban,
  Keyboard,
  LayoutTemplate,
  Moon,
  Music,
  Network,
  Palette,
  Pencil,
  Plus,
  Presentation,
  Redo2,
  Settings,
  Share2,
  SquareCheck,
  Star,
  Sun,
  Trash2,
  Type,
  Undo2,
  Waypoints,
  X,
} from 'lucide-react'
import { t, useLocale, type MessageKey } from '../../../lib/i18n'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { calendarNodeName, calendarPeriodsForDate, type CalendarPeriod } from '../../../lib/calendar-tree'
import { kanbanSurfaceCommands, type KanbanSurfaceCommands } from '../../../lib/markdown/kanban'
import { cycleYearGridColumns, setYearGridColumns, useYearGridColumns, type YearGridColumnsPref } from '../../../lib/year-grid-prefs'
import { useUi, type PanelName } from '../../../store/ui'
import { useNotes } from '../../../store/notes'
import { useSession } from '../../../store/session'
import { createContextualNote } from '../../../store/notes'
import { generateKanbanFromOutline, generateMindmapFromOutline, generateSlidesFromOutline, getActiveEditorView, insertNoteTemplate } from '../../../editor/commands'
import type { Item } from './types'
import type { ViewKind } from '@shared/types'

type CommandItem = Omit<Item, 'score' | 'match'>

const YEAR_GRID_LABEL_KEYS: Record<YearGridColumnsPref, MessageKey> = {
  auto: 'settings.year_grid_columns_auto',
  '3': 'settings.year_grid_columns_three',
  '4': 'settings.year_grid_columns_four',
}

function runExportZip() {
  void api.transfer.save('zip').catch((error) => {
    useUi.getState().toast({
      title: t('common.export_failed'),
      description: errorMessage(error),
      tone: 'danger',
    })
  })
}

function runCycleYearGridColumns(current: YearGridColumnsPref) {
  const previous = current
  const next = cycleYearGridColumns(current)
  setYearGridColumns(next)
  useUi.getState().toast({
    title: t('command.year_grid_columns_switched_value0', { value0: t(YEAR_GRID_LABEL_KEYS[next]) }),
    action: {
      label: t('common.undo'),
      run: () => {
        setYearGridColumns(previous)
        useUi.getState().toast({ title: t('command.year_grid_columns_undone') })
      },
    },
  })
}

function creationCommands(deps: { openPanel: (panel: PanelName) => void; createFolder: () => void }): CommandItem[] {
  return [
    { id: 'cmd-new', kind: 'command', label: t('common.new_note'), icon: <Plus size={14} />, combo: 'mod+n', group: t('command.commands'), run: () => void createContextualNote() },
    { id: 'cmd-new-from-template', kind: 'command', label: t('templates.new_note_from_template'), icon: <LayoutTemplate size={14} />, combo: 'mod+shift+n', group: t('command.commands'), run: () => deps.openPanel('templates') },
    { id: 'cmd-new-folder', kind: 'command', label: t('common.new_folder'), icon: <FolderPlus size={14} />, group: t('command.commands'), run: () => void deps.createFolder() },
    { id: 'cmd-manage-folders', kind: 'command', label: t('folders.manage_folders'), icon: <FolderClosed size={14} />, group: t('command.commands'), run: () => deps.openPanel('folders') },
    { id: 'cmd-manage-tags', kind: 'command', label: t('tags.manage_tags'), icon: <Hash size={14} />, group: t('command.commands'), run: () => deps.openPanel('tags') },
  ]
}

function currentNoteCommands(activeNote: { id: string; isStarred: boolean; isArchived: boolean }, deps: { setStarred: (id: string, starred: boolean) => void; setArchived: (id: string, archived: boolean) => void; openPanel: (panel: PanelName) => void; deleteNote: (id: string) => void }): CommandItem[] {
  const currentNoteGroup = t('common.current_note')
  return [
    { id: 'cmd-star', kind: 'command', label: activeNote.isStarred ? t('command.remove_current_note_from_favorites') : t('command.add_current_note_to_favorites'), icon: <Star size={14} />, combo: 'mod+d', group: currentNoteGroup, run: () => void deps.setStarred(activeNote.id, !activeNote.isStarred) },
    { id: 'cmd-archive', kind: 'command', label: activeNote.isArchived ? t('common.unarchive') : t('command.archive_current_note'), icon: <Archive size={14} />, group: currentNoteGroup, run: () => void deps.setArchived(activeNote.id, !activeNote.isArchived) },
    { id: 'cmd-insert-template', kind: 'command', label: t('command.insert_note_template'), icon: <FilePlus2 size={14} />, group: currentNoteGroup, run: () => { const view = getActiveEditorView(); if (view) insertNoteTemplate(view) } },
    { id: 'cmd-mindmap-from-outline', kind: 'command', label: t('workspace.mindmap_from_outline'), icon: <Network size={14} />, group: currentNoteGroup, run: () => { const view = getActiveEditorView(); if (view) generateMindmapFromOutline(view) } },
    { id: 'cmd-kanban-from-outline', kind: 'command', label: t('workspace.kanban_from_outline'), icon: <Kanban size={14} />, group: currentNoteGroup, run: () => { const view = getActiveEditorView(); if (view) generateKanbanFromOutline(view) } },
    { id: 'cmd-slides-from-outline', kind: 'command', label: t('workspace.slides_from_outline'), icon: <Presentation size={14} />, group: currentNoteGroup, run: () => { const view = getActiveEditorView(); if (view) generateSlidesFromOutline(view) } },
    { id: 'cmd-share', kind: 'command', label: t('command.share_current_note'), icon: <Share2 size={14} />, group: currentNoteGroup, run: () => deps.openPanel('share') },
    { id: 'cmd-blog-publish', kind: 'command', label: t('blog.publish_to_blog'), icon: <Globe size={14} />, group: currentNoteGroup, run: () => deps.openPanel('blog-publish') },
    { id: 'cmd-delete', kind: 'command', label: t('command.move_the_current_note_to_trash'), icon: <Trash2 size={14} />, combo: 'mod+backspace', group: currentNoteGroup, run: () => void deps.deleteNote(activeNote.id) },
  ]
}

function interfaceCommands(deps: { isDark: boolean; yearGridColumns: YearGridColumnsPref; openPanel: (panel: PanelName) => void; updateSettings: (patch: object) => void }): CommandItem[] {
  return [
    { id: 'cmd-layout-edit', kind: 'command', label: t('command.layout_editor_only'), icon: <Pencil size={14} />, group: t('common.interface'), run: () => void deps.updateSettings({ preview: { layout: 'edit' } }) },
    { id: 'cmd-layout-live', kind: 'command', label: t('command.layout_live_preview'), icon: <Type size={14} />, group: t('common.interface'), run: () => void deps.updateSettings({ preview: { layout: 'live' } }) },
    { id: 'cmd-layout-split', kind: 'command', label: t('command.layout_split_view'), icon: <Columns2 size={14} />, combo: 'mod+\\\\', group: t('common.interface'), run: () => void deps.updateSettings({ preview: { layout: 'split' } }) },
    { id: 'cmd-layout-preview', kind: 'command', label: t('command.layout_preview_only'), icon: <Eye size={14} />, group: t('common.interface'), run: () => void deps.updateSettings({ preview: { layout: 'preview' } }) },
    { id: 'cmd-theme', kind: 'command', label: deps.isDark ? t('command.switch_to_light_theme') : t('command.switch_to_dark_theme'), icon: deps.isDark ? <Sun size={14} /> : <Moon size={14} />, group: t('common.interface'), run: () => void deps.updateSettings({ appearance: { theme: deps.isDark ? 'light' : 'dark' } }) },
    { id: 'cmd-accent', kind: 'command', label: t('command.change_accent_color'), icon: <Palette size={14} />, group: t('common.interface'), run: () => deps.openPanel('settings') },
    { id: 'cmd-year-grid-columns', kind: 'command', label: t('command.year_grid_columns'), detail: t(YEAR_GRID_LABEL_KEYS[deps.yearGridColumns]), icon: <Columns2 size={14} />, group: t('common.interface'), run: () => runCycleYearGridColumns(deps.yearGridColumns) },
    { id: 'cmd-graph', kind: 'command', label: t('command.open_graph'), icon: <Waypoints size={14} />, combo: 'mod+shift+g', group: t('common.interface'), run: () => deps.openPanel('graph') },
  ]
}

function hubCommands(deps: { openPanel: (panel: PanelName) => void }): CommandItem[] {
  return [
    { id: 'cmd-share-hub', kind: 'command', label: t('share.hub_title'), icon: <Share2 size={14} />, group: t('command.commands'), run: () => deps.openPanel('share-hub') },
    { id: 'cmd-blog-hub', kind: 'command', label: t('blog.blog_hub'), icon: <Globe size={14} />, group: t('command.commands'), run: () => deps.openPanel('blog-hub') },
    { id: 'cmd-music-hub', kind: 'command', label: t('music.hub_title'), icon: <Music size={14} />, combo: 'mod+shift+m', group: t('command.commands'), run: () => deps.openPanel('music-hub') },
    { id: 'cmd-settings', kind: 'command', label: t('common.open_settings'), icon: <Settings size={14} />, combo: 'mod+,', group: t('command.commands'), run: () => deps.openPanel('settings') },
    { id: 'cmd-shortcuts', kind: 'command', label: t('command.keyboard_shortcuts'), icon: <Keyboard size={14} />, combo: 'shift+?', group: t('command.commands'), run: () => deps.openPanel('shortcuts') },
    { id: 'cmd-export', kind: 'command', label: t('command.export_all_notes_zip'), icon: <Download size={14} />, group: t('command.commands'), run: () => runExportZip() },
  ]
}

function navigationCommands(deps: { openView: (view: ViewKind) => void; openCalendarPeriod: (period: CalendarPeriod) => void; periods: ReturnType<typeof calendarPeriodsForDate> }): CommandItem[] {
  return [
    { id: 'cmd-trash', kind: 'command', label: t('command.open_trash'), icon: <Trash2 size={14} />, group: t('common.navigation'), run: () => deps.openView('trash') },
    { id: 'cmd-starred', kind: 'command', label: t('command.open_favorites'), icon: <Star size={14} />, group: t('common.navigation'), run: () => deps.openView('starred') },
    { id: 'cmd-calendar-year', kind: 'command', label: t('command.calendar_this_year_value0', { value0: calendarNodeName(deps.periods.year) }), icon: <CalendarDays size={14} />, group: t('common.navigation'), run: () => deps.openCalendarPeriod(deps.periods.year) },
    { id: 'cmd-calendar-quarter', kind: 'command', label: t('command.calendar_this_quarter_value0', { value0: calendarNodeName(deps.periods.quarter) }), icon: <CalendarDays size={14} />, group: t('common.navigation'), run: () => deps.openCalendarPeriod(deps.periods.quarter) },
    { id: 'cmd-calendar-month', kind: 'command', label: t('command.calendar_this_month_value0', { value0: calendarNodeName(deps.periods.month) }), icon: <CalendarDays size={14} />, group: t('common.navigation'), run: () => deps.openCalendarPeriod(deps.periods.month) },
    { id: 'cmd-calendar-week', kind: 'command', label: t('command.calendar_this_week_value0', { value0: calendarNodeName(deps.periods.week) }), icon: <CalendarDays size={14} />, group: t('common.navigation'), run: () => deps.openCalendarPeriod(deps.periods.week) },
  ]
}

/**
 * What the board on screen can do, offered where every other action is. A board is a surface inside
 * the document rather than an app of its own, so this is how its cards and views become reachable by
 * name instead of by hunting for the right button — and how a keyboard reader gets to them at all.
 * The group carries the board's title, because a note may hold several boards and a command that ran
 * against the wrong one would be worse than no command.
 */
export function boardCommandItems(surface: KanbanSurfaceCommands): CommandItem[] {
  const group = surface.boardTitle
  const items: CommandItem[] = [
    { id: 'cmd-kanban-add', kind: 'command', label: t('preview.kanban_new_item'), icon: <Plus size={14} aria-hidden />, group, run: surface.addCard },
    ...surface.views.map((view) => ({
      id: `cmd-kanban-view-${view.id}`,
      kind: 'command' as const,
      label: t('preview.kanban_switch_view', { title: view.name }),
      detail: view.id === surface.activeViewId ? t('preview.kanban_current_view') : undefined,
      icon: view.icon,
      group,
      run: () => surface.selectView(view.id),
    })),
    { id: 'cmd-kanban-select-all', kind: 'command', label: t('preview.kanban_select_all_visible'), icon: <SquareCheck size={14} aria-hidden />, group, run: surface.selectAllVisible },
  ]
  if (surface.selectedCount > 0) {
    items.push({ id: 'cmd-kanban-clear-selection', kind: 'command', label: t('preview.kanban_clear_selection'), icon: <X size={14} aria-hidden />, group, run: surface.clearSelection })
  }
  if (surface.canUndo) {
    items.push({ id: 'cmd-kanban-undo', kind: 'command', label: t('common.undo'), icon: <Undo2 size={14} aria-hidden />, combo: 'mod+z', group, run: surface.undo })
  }
  if (surface.canRedo) {
    items.push({ id: 'cmd-kanban-redo', kind: 'command', label: t('command.redo'), icon: <Redo2 size={14} aria-hidden />, combo: 'mod+shift+z', group, run: surface.redo })
  }
  return items
}

/**
 * The board is read once, when the palette opens: every other item in the list is a snapshot of the
 * moment too, and a board being edited behind the palette is not something to re-ask while the reader
 * is typing a query. Reading it in an effect rather than during render keeps the focus question
 * honest — the palette focuses its own field, so what was focused a tick earlier is the answer.
 */
function useKanbanSurfaceCommands(): KanbanSurfaceCommands | null {
  const [surface, setSurface] = useState<KanbanSurfaceCommands | null>(null)
  useEffect(() => {
    setSurface(kanbanSurfaceCommands(document.activeElement))
  }, [])
  return surface
}

export function usePaletteCommands(ctx: { openCalendarPeriod: (period: CalendarPeriod) => void }) {
  const activeNoteId = useUi((s) => s.activeNoteId)
  const notes = useNotes((s) => s.notes)
  const createFolder = useNotes((s) => s.createFolder)
  const deleteNote = useNotes((s) => s.deleteNote)
  const setArchived = useNotes((s) => s.setArchived)
  const setStarred = useNotes((s) => s.setStarred)
  const openPanel = useUi((s) => s.openPanel)
  const openView = useUi((s) => s.openView)
  const appearanceTheme = useSession((s) => s.settings.appearance.theme)
  const updateSettings = useSession((s) => s.updateSettings)
  const yearGridColumns = useYearGridColumns()
  const locale = useLocale()
  const board = useKanbanSurfaceCommands()
  return useMemo<CommandItem[]>(() => {
    const activeNote = activeNoteId ? notes[activeNoteId] : null
    const isDark = document.documentElement.dataset.theme === 'dark'
    const periods = calendarPeriodsForDate(new Date())
    return [
      ...creationCommands({ openPanel, createFolder }),
      ...(activeNote ? currentNoteCommands(activeNote, { setStarred, setArchived, openPanel, deleteNote }) : []),
      ...interfaceCommands({ isDark, yearGridColumns, openPanel, updateSettings }),
      ...hubCommands({ openPanel }),
      ...(board ? boardCommandItems(board) : []),
      ...navigationCommands({ openView, openCalendarPeriod: ctx.openCalendarPeriod, periods }),
    ]
  }, [activeNoteId, appearanceTheme, board, locale, createFolder, deleteNote, notes, ctx.openCalendarPeriod, openPanel, openView, setStarred, updateSettings, yearGridColumns])
}
