import { useMemo } from 'react';
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
} from 'lucide-react';
import { t, useLocale, type MessageKey } from '../../../lib/i18n';
import { api } from '../../../lib/api';
import { errorMessage } from '../../../lib/errors';
import { calendarNodeName, calendarPeriodsForDate, type CalendarPeriod } from '../../../lib/calendar-tree';
import { cycleYearGridColumns, setYearGridColumns, useYearGridColumns, type YearGridColumnsPref } from '../../../lib/year-grid-prefs';
import { useUi } from '../../../store/ui';
import { useNotes } from '../../../store/notes';
import { useSession } from '../../../store/session';
import { createContextualNote } from '../../../store/notes/selectors';
import { getActiveEditorView, insertNoteTemplate } from '../../../editor/commands';
import type { Item } from './types';

const YEAR_GRID_LABEL_KEYS: Record<YearGridColumnsPref, MessageKey> = {
    'auto': 'settings.year_grid_columns_auto',
    '3': 'settings.year_grid_columns_three',
    '4': 'settings.year_grid_columns_four',
};

export function usePaletteCommands(ctx: { openCalendarPeriod: (period: CalendarPeriod) => void }) {
  const activeNoteId = useUi((s) => s.activeNoteId);
  const notes = useNotes((s) => s.notes);
  const createFolder = useNotes((s) => s.createFolder);
  const deleteNote = useNotes((s) => s.deleteNote);
  const setArchived = useNotes((s) => s.setArchived);
  const setStarred = useNotes((s) => s.setStarred);
  const openPanel = useUi((s) => s.openPanel);
  const openView = useUi((s) => s.openView);
  const appearanceTheme = useSession((s) => s.settings.appearance.theme);
  const updateSettings = useSession((s) => s.updateSettings);
  const yearGridColumns = useYearGridColumns();
  const locale = useLocale();
  const openCalendarPeriod = ctx.openCalendarPeriod;
  return useMemo<Omit<Item, 'score' | 'match'>[]>(() => {
        const activeNote = activeNoteId ? notes[activeNoteId] : null;
        const currentNoteGroup = t("common.current_note");
        const isDark = document.documentElement.dataset.theme === 'dark';
        const calendarPeriods = calendarPeriodsForDate(new Date());
        return [
            {
                id: 'cmd-new',
                kind: 'command',
                label: t("common.new_note"),
                icon: <Plus size={14}/>,
                combo: 'mod+n',
                group: t("command.commands"),
                run: () => void createContextualNote(),
            },
            {
                id: 'cmd-new-from-template',
                kind: 'command',
                label: t("templates.new_note_from_template"),
                icon: <LayoutTemplate size={14}/>,
                combo: 'mod+shift+n',
                group: t("command.commands"),
                run: () => openPanel('templates'),
            },
            {
                id: 'cmd-new-folder',
                kind: 'command',
                label: t("common.new_folder"),
                icon: <FolderPlus size={14}/>,
                group: t("command.commands"),
                run: () => void createFolder(),
            },
            {
                id: 'cmd-manage-folders',
                kind: 'command',
                label: t("folders.manage_folders"),
                icon: <FolderClosed size={14}/>,
                group: t("command.commands"),
                run: () => openPanel('folders'),
            },
            {
                id: 'cmd-manage-tags',
                kind: 'command',
                label: t("tags.manage_tags"),
                icon: <Hash size={14}/>,
                group: t("command.commands"),
                run: () => openPanel('tags'),
            },
            ...(activeNote
                ? [
                    {
                        id: 'cmd-star',
                        kind: 'command' as const,
                        label: activeNote.isStarred ? t("command.remove_current_note_from_favorites") : t("command.add_current_note_to_favorites"),
                        icon: <Star size={14}/>,
                        combo: 'mod+d',
                        group: t("common.current_note"),
                        run: () => void setStarred(activeNote.id, !activeNote.isStarred),
                    },
                    {
                        id: 'cmd-archive',
                        kind: 'command' as const,
                        label: activeNote.isArchived ? t("common.unarchive") : t("command.archive_current_note"),
                        icon: <Archive size={14}/>,
                        group: t("common.current_note"),
                        run: () => void setArchived(activeNote.id, !activeNote.isArchived),
                    },
                    {
                        id: 'cmd-insert-template',
                        kind: 'command' as const,
                        label: t("command.insert_note_template"),
                        icon: <FilePlus2 size={14}/>,
                        group: currentNoteGroup,
                        run: () => {
                            const view = getActiveEditorView();
                            if (view)
                                insertNoteTemplate(view);
                        },
                    },
                    {
                        id: 'cmd-share',
                        kind: 'command' as const,
                        label: t("command.share_current_note"),
                        icon: <Share2 size={14}/>,
                        group: currentNoteGroup,
                        run: () => openPanel('share'),
                    },
                    {
                        id: 'cmd-blog-publish',
                        kind: 'command' as const,
                        label: t("blog.publish_to_blog"),
                        icon: <Globe size={14}/>,
                        group: currentNoteGroup,
                        run: () => openPanel('blog-publish'),
                    },
                    {
                        id: 'cmd-delete',
                        kind: 'command' as const,
                        label: t("command.move_the_current_note_to_trash"),
                        icon: <Trash2 size={14}/>,
                        combo: 'mod+backspace',
                        group: t("common.current_note"),
                        run: () => void deleteNote(activeNote.id),
                    },
                ]
                : []),
            {
                id: 'cmd-layout-edit',
                kind: 'command',
                label: t("command.layout_editor_only"),
                icon: <Pencil size={14}/>,
                group: t("common.interface"),
                run: () => void updateSettings({ preview: { layout: 'edit' } }),
            },
            {
                id: 'cmd-layout-split',
                kind: 'command',
                label: t("command.layout_split_view"),
                icon: <Columns2 size={14}/>,
                combo: 'mod+\\',
                group: t("common.interface"),
                run: () => void updateSettings({ preview: { layout: 'split' } }),
            },
            {
                id: 'cmd-layout-preview',
                kind: 'command',
                label: t("command.layout_preview_only"),
                icon: <Eye size={14}/>,
                group: t("common.interface"),
                run: () => void updateSettings({ preview: { layout: 'preview' } }),
            },
            {
                id: 'cmd-theme',
                kind: 'command',
                label: isDark ? t("command.switch_to_light_theme") : t("command.switch_to_dark_theme"),
                icon: isDark ? <Sun size={14}/> : <Moon size={14}/>,
                group: t("common.interface"),
                run: () => void updateSettings({ appearance: { theme: isDark ? 'light' : 'dark' } }),
            },
            {
                id: 'cmd-accent',
                kind: 'command',
                label: t("command.change_accent_color"),
                icon: <Palette size={14}/>,
                group: t("common.interface"),
                run: () => openPanel('settings'),
            },
            {
                id: 'cmd-year-grid-columns',
                kind: 'command',
                label: t("command.year_grid_columns"),
                detail: t(YEAR_GRID_LABEL_KEYS[yearGridColumns]),
                icon: <Columns2 size={14}/>,
                group: t("common.interface"),
                run: () => {
                    const previous = yearGridColumns;
                    const next: YearGridColumnsPref = cycleYearGridColumns(yearGridColumns);
                    setYearGridColumns(next);
                    useUi.getState().toast({
                        title: t("command.year_grid_columns_switched_value0", { value0: t(YEAR_GRID_LABEL_KEYS[next]) }),
                        action: {
                            label: t("common.undo"),
                            run: () => {
                                setYearGridColumns(previous);
                                useUi.getState().toast({ title: t("command.year_grid_columns_undone") });
                            },
                        },
                    });
                },
            },
            {
                id: 'cmd-graph',
                kind: 'command',
                label: t("command.open_graph"),
                icon: <Waypoints size={14}/>,
                combo: 'mod+shift+g',
                group: t("common.interface"),
                run: () => openPanel('graph'),
            },
            {
                id: 'cmd-share-hub',
                kind: 'command',
                label: t("share.hub_title"),
                icon: <Share2 size={14}/>,
                group: t("command.commands"),
                run: () => openPanel('share-hub'),
            },
            {
                id: 'cmd-blog-hub',
                kind: 'command',
                label: t("blog.blog_hub"),
                icon: <Globe size={14}/>,
                group: t("command.commands"),
                run: () => openPanel('blog-hub'),
            },
            {
                id: 'cmd-settings',
                kind: 'command',
                label: t("common.open_settings"),
                icon: <Settings size={14}/>,
                combo: 'mod+,',
                group: t("command.commands"),
                run: () => openPanel('settings'),
            },
            {
                id: 'cmd-shortcuts',
                kind: 'command',
                label: t("command.keyboard_shortcuts"),
                icon: <Keyboard size={14}/>,
                combo: 'shift+?',
                group: t("command.commands"),
                run: () => openPanel('shortcuts'),
            },
            {
                id: 'cmd-export',
                kind: 'command',
                label: t("command.export_all_notes_zip"),
                icon: <Download size={14}/>,
                group: t("command.commands"),
                run: () => void api.transfer.save('zip').catch((error) => {
                    useUi.getState().toast({
                        title: t("common.export_failed"),
                        description: errorMessage(error),
                        tone: 'danger',
                    });
                }),
            },
            {
                id: 'cmd-trash',
                kind: 'command',
                label: t("command.open_trash"),
                icon: <Trash2 size={14}/>,
                group: t("common.navigation"),
                run: () => openView('trash'),
            },
            {
                id: 'cmd-starred',
                kind: 'command',
                label: t("command.open_favorites"),
                icon: <Star size={14}/>,
                group: t("common.navigation"),
                run: () => openView('starred'),
            },
            {
                id: 'cmd-calendar-year',
                kind: 'command',
                label: t("command.calendar_this_year_value0", { value0: calendarNodeName(calendarPeriods.year) }),
                icon: <CalendarDays size={14}/>,
                group: t("common.navigation"),
                run: () => openCalendarPeriod(calendarPeriods.year),
            },
            {
                id: 'cmd-calendar-quarter',
                kind: 'command',
                label: t("command.calendar_this_quarter_value0", { value0: calendarNodeName(calendarPeriods.quarter) }),
                icon: <CalendarDays size={14}/>,
                group: t("common.navigation"),
                run: () => openCalendarPeriod(calendarPeriods.quarter),
            },
            {
                id: 'cmd-calendar-month',
                kind: 'command',
                label: t("command.calendar_this_month_value0", { value0: calendarNodeName(calendarPeriods.month) }),
                icon: <CalendarDays size={14}/>,
                group: t("common.navigation"),
                run: () => openCalendarPeriod(calendarPeriods.month),
            },
            {
                id: 'cmd-calendar-week',
                kind: 'command',
                label: t("command.calendar_this_week_value0", { value0: calendarNodeName(calendarPeriods.week) }),
                icon: <CalendarDays size={14}/>,
                group: t("common.navigation"),
                run: () => openCalendarPeriod(calendarPeriods.week),
            },
        ];
    }, [
        activeNoteId,
        appearanceTheme,
        locale,
        createFolder,
        deleteNote,
        notes,
        openCalendarPeriod,
        openPanel,
        openView,
        setStarred,
        updateSettings,
        yearGridColumns,
    ]);
}
