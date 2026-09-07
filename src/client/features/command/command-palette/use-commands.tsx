import { useMemo } from 'react'
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
  Keyboard,
  LayoutTemplate,
  Moon,
  Palette,
  Pencil,
  Plus,
  Settings,
  Share2,
  Star,
  Sun,
  Trash2,
  Waypoints,
} from 'lucide-react'
import { t, useLocale, type MessageKey } from '../../../lib/i18n'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { calendarNodeName, calendarPeriodsForDate, type CalendarPeriod } from '../../../lib/calendar-tree'
import { cycleYearGridColumns, setYearGridColumns, useYearGridColumns, type YearGridColumnsPref } from '../../../lib/year-grid-prefs'
import { useUi, type PanelName } from '../../../store/ui'
import { useNotes } from '../../../store/notes'
import { useSession } from '../../../store/session'
import { createContextualNote } from '../../../store/notes'
import { getActiveEditorView, insertNoteTemplate } from '../../../editor/commands'
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
    { id: 'cmd-share', kind: 'command', label: t('command.share_current_note'), icon: <Share2 size={14} />, group: currentNoteGroup, run: () => deps.openPanel('share') },
    { id: 'cmd-blog-publish', kind: 'command', label: t('blog.publish_to_blog'), icon: <Globe size={14} />, group: currentNoteGroup, run: () => deps.openPanel('blog-publish') },
    { id: 'cmd-delete', kind: 'command', label: t('command.move_the_current_note_to_trash'), icon: <Trash2 size={14} />, combo: 'mod+backspace', group: currentNoteGroup, run: () => void deps.deleteNote(activeNote.id) },
  ]
}

function interfaceCommands(deps: { isDark: boolean; yearGridColumns: YearGridColumnsPref; openPanel: (panel: PanelName) => void; updateSettings: (patch: object) => void }): CommandItem[] {
  return [
    { id: 'cmd-layout-edit', kind: 'command', label: t('command.layout_editor_only'), icon: <Pencil size={14} />, group: t('common.interface'), run: () => void deps.updateSettings({ preview: { layout: 'edit' } }) },
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
  return useMemo<CommandItem[]>(() => {
    const activeNote = activeNoteId ? notes[activeNoteId] : null
    const isDark = document.documentElement.dataset.theme === 'dark'
    const periods = calendarPeriodsForDate(new Date())
    return [
      ...creationCommands({ openPanel, createFolder }),
      ...(activeNote ? currentNoteCommands(activeNote, { setStarred, setArchived, openPanel, deleteNote }) : []),
      ...interfaceCommands({ isDark, yearGridColumns, openPanel, updateSettings }),
      ...hubCommands({ openPanel }),
      ...navigationCommands({ openView, openCalendarPeriod: ctx.openCalendarPeriod, periods }),
    ]
  }, [activeNoteId, appearanceTheme, locale, createFolder, deleteNote, notes, ctx.openCalendarPeriod, openPanel, openView, setStarred, updateSettings, yearGridColumns])
}
