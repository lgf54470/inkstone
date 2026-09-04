import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownWideNarrow,
  Bookmark,
  CalendarDays,
  Check,
  Globe,
  Hash,
  LayoutTemplate,
  PanelLeft,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Star,
  X,
} from 'lucide-react';
import { type DateRangeFilter, type NoteSummary, type SortKey, type ViewKind } from '@shared/types';
import { cn } from '../../lib/cn';
import { groupLabel } from '../../lib/time';
import { useNow } from '../../lib/hooks';
import { fuzzyFilter } from '../../lib/fuzzy';
import { useBreakpoint } from '../../lib/hooks';
import { IconButton } from '../../components/primitives';
import { Menu, Tooltip, confirm, type MenuItem } from '../../components/overlay';
import { NoteListSkeleton } from '../../components/feedback';
import { TagFilterPopover } from '../../components/tag-filter-popover';
import { DateRangePopover } from '../../components/date-range-popover';
import { addDaysKey, isWeekRangeKey, parseDateKey, weekStartKeyOf } from '../../lib/time';
import { memoLatestEditKey } from './use-rolling-filter';
import { useGapIndicatorStore } from './use-gap-indicator';
import { loadRememberedFilter, loadSessionFilter, saveRememberedFilter, saveSessionFilter } from './list-filter-persist';
import { useUi } from '../../store/ui';
import { useSession } from '../../store/session';
import { createContextualNote, useVisibleNotes } from '../../store/notes/selectors';
import { useNotes } from '../../store/notes';
import { useNoteTemplates } from '../../store/note-templates';
import { createNoteFromTemplate } from '../../lib/template-notes';
import { CALENDAR_TREE, isTodoFolderId, isVirtualFolderId, resolveTodoTag, TODO_TREE, virtualPathSegments } from '../../lib/calendar-tree';
import { folderPathLabel } from '../../lib/folders';
import { useShareStore } from '../share/share-store';
import { t, useLocale, type MessageKey } from '../../lib/i18n';
import { BulkBar } from './note-list/BulkBar';
import { ListEmpty } from './note-list/ListEmpty';
import { NoteRow } from './note-list/NoteRow';

const VIEW_MESSAGE_KEYS: Record<ViewKind, MessageKey> = {
    all: 'navigation.all_notes',
    recent: 'navigation.recently_edited',
    starred: 'navigation.favorites',
    pinned: 'navigation.pinned',
    shared: 'navigation.share',
    published: 'navigation.published',
    unfiled: 'navigation.unfiled',
    archived: 'navigation.archive',
    trash: 'navigation.trash',
    folder: 'navigation.folder',
    tag: 'navigation.tag',
    untagged: 'tags.untagged',
};
const EMPTY_HIGHLIGHT: [
    number,
    number
][] = [];
const INITIAL_RENDERED_NOTES = 60;
const RENDERED_NOTES_STEP = 80;
export function NoteList() {
    const locale = useLocale();
    const todoTagText = resolveTodoTag(useSession((s) => s.settings.notes?.todoTag), locale);
    const breakpoint = useBreakpoint();
    const view = useUi((s) => s.view);
    const folderId = useUi((s) => s.folderId);
    const tag = useUi((s) => s.tag);
    const sort = useUi((s) => s.sort);
    const order = useUi((s) => s.order);
    const density = useUi((s) => s.density);
    const setSort = useUi((s) => s.setSort);
    const activeNoteId = useUi((s) => s.activeNoteId);
    const toggleNavDrawer = useUi((s) => s.toggleNavDrawer);
    const selectedTags = useUi((s) => s.selectedTags);
    const selectedTagsMatch = useUi((s) => s.selectedTagsMatch);
    const setSelectedTagsMatch = useUi((s) => s.setSelectedTagsMatch);
    const dateFilter = useUi((s) => s.dateFilter);
    const relativeFilter = useUi((s) => s.relativeFilter);
    const listQuery = useUi((s) => s.listQuery);
    const setListQuery = useUi((s) => s.setListQuery);
    const notes = useVisibleNotes();
    const shares = useShareStore((s) => s.shares);
    const sharedNoteIds = useMemo(() => new Set(shares.map((s) => s.noteId)), [shares]);
    const folders = useNotes((s) => s.folders);
    const tags = useNotes((s) => s.tags);
    const loading = useNotes((s) => s.loading);
    const hydrated = useNotes((s) => s.hydrated);
    const openNote = useNotes((s) => s.openNote);
    const { emptyTrash, emptyingTrash } = useEmptyTrash();
    const [persistedFilters] = useState(() => loadRememberedFilter() ?? loadSessionFilter());
    const [rememberFilters, setRememberFilters] = useState(() => loadRememberedFilter() !== null);
    const filter = listQuery;
    const deferredFilter = useDeferredValue(filter);
    useEffect(() => {
        useUi.setState({
            listQuery: persistedFilters.query,
            dateFilter: persistedFilters.dateFilter,
            relativeFilter: persistedFilters.relativeFilter,
            selectedTags: persistedFilters.selectedTags,
            selectedTagsMatch: persistedFilters.selectedTagsMatch,
        });
    }, [persistedFilters]);
    useEffect(() => {
        const combo = { query: filter, dateFilter, relativeFilter, selectedTags, selectedTagsMatch };
        saveSessionFilter(combo);
        if (rememberFilters)
            saveRememberedFilter(combo);
        else
            saveRememberedFilter(null);
    }, [filter, dateFilter, relativeFilter, selectedTags, selectedTagsMatch, rememberFilters]);
    const [sortMenuOpen, setSortMenuOpen] = useState(false);
    const sortButtonRef = useRef<HTMLButtonElement>(null);
    const [tagFilterOpen, setTagFilterOpen] = useState(false);
    const [rangeEditorOpen, setRangeEditorOpen] = useState(false);
    const rangeChipRef = useRef<HTMLButtonElement>(null);
    const [favMenuOpen, setFavMenuOpen] = useState(false);
    const favButtonRef = useRef<HTMLButtonElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const [renderLimit, setRenderLimit] = useState(INITIAL_RENDERED_NOTES);
    const now = useNow();
    const tagColors = useMemo(() => new Map((tags ?? []).map((item) => [item.name, item.color])), [tags]);
    const allTemplates = useNoteTemplates((s) => s.templates);
    useEffect(() => {
        const state = useNoteTemplates.getState();
        if (!state.hydrated)
            void state.hydrate().catch(() => {});
    }, []);
    const favoriteTemplates = useMemo(() => allTemplates
        .filter((item) => item.isStarred)
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt),
    [allTemplates]);
    const favItems: MenuItem[] = favoriteTemplates.length
        ? favoriteTemplates.map((template) => ({
            id: template.id,
            label: template.name,
            icon: <LayoutTemplate size={13}/>,
            onSelect: () => void createNoteFromTemplate(template),
        }))
        : [
            { id: 'empty', label: t("templates.no_favorite_templates"), disabled: true },
            {
                id: 'open-library',
                label: t("templates.open_template_library"),
                icon: <LayoutTemplate size={13}/>,
                separatorBefore: true,
                onSelect: () => useUi.getState().openPanel('templates'),
            },
        ];

    const filterScope = useRef<{ view: ViewKind; folderId: string | null; tag: string | null } | null>(null);
    useEffect(() => {
        if (filterScope.current && (filterScope.current.view !== view || filterScope.current.folderId !== folderId || filterScope.current.tag !== tag))
            setListQuery('');
        filterScope.current = { view, folderId, tag };
    }, [view, folderId, tag]);
    const title = useMemo(() => {
        if (view === 'folder') {
            if (isVirtualFolderId(folderId)) {
                const isTodo = isTodoFolderId(folderId);
                const ns = isTodo ? TODO_TREE : CALENDAR_TREE;
                const rootLabel = isTodo ? t("sidebar.todo_folder") : t("sidebar.calendar_folder");
                const segments = virtualPathSegments(folderId, ns);
                return segments ? [rootLabel, ...segments].join(' / ') : rootLabel;
            }
            return (folderId ? folderPathLabel(folders, folderId) : '') || t("navigation.folder");
        }
        if (view === 'tag')
            return `#${tag ?? ''}`;
        return t(VIEW_MESSAGE_KEYS[view]);
    }, [view, folderId, tag, folders, locale]);
    const dayFilterLabel = useMemo(() => {
        if (!dateFilter)
            return '';
        return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(dateFilter.start));
    }, [dateFilter, locale]);
    const dayFilterLabelEnd = useMemo(() => {
        if (!dateFilter || dateFilter.start === dateFilter.end)
            return null;
        return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(dateFilter.end));
    }, [dateFilter, locale]);
    const allNotes = useNotes((s) => s.notes);
    const latestEdit = useMemo(() => {
        const key = memoLatestEditKey(allNotes);
        if (!key)
            return null;
        return {
            key,
            label: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(key)),
        };
    }, [allNotes, locale]);
    const gap = useGapIndicatorStore((s) => s.gap);
    const lastGap = useGapIndicatorStore((s) => s.lastGap);
    const peekRange = useGapIndicatorStore((s) => s.peekRange);
    const engagePeek = useGapIndicatorStore((s) => s.engagePeek);
    const releasePeek = useGapIndicatorStore((s) => s.releasePeek);
    const displayGap = gap ?? lastGap;
    const gapShown = gap !== null || peekRange !== null;
    const peekTimer = useRef<number | null>(null);
    const peekUsed = useRef(false);
    const startPeek = useCallback((instant: boolean) => {
        if (instant) {
            if (engagePeek())
                peekUsed.current = true;
            return;
        }
        if (peekTimer.current !== null)
            window.clearTimeout(peekTimer.current);
        peekTimer.current = window.setTimeout(() => {
            if (engagePeek())
                peekUsed.current = true;
        }, 350);
    }, [engagePeek]);
    const endPeek = useCallback(() => {
        if (peekTimer.current !== null) {
            window.clearTimeout(peekTimer.current);
            peekTimer.current = null;
        }
        releasePeek();
    }, [releasePeek]);
    const gapCapsuleRef = useCallback((node: HTMLButtonElement | null) => {
        if (!node)
            return undefined;
        const onPointerDown = (event: PointerEvent) => startPeek(event.shiftKey);
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                startPeek(true);
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ')
                endPeek();
        };
        node.addEventListener('pointerdown', onPointerDown);
        node.addEventListener('pointerup', endPeek);
        node.addEventListener('pointerleave', endPeek);
        node.addEventListener('pointercancel', endPeek);
        node.addEventListener('keydown', onKeyDown);
        node.addEventListener('keyup', onKeyUp);
        node.addEventListener('blur', endPeek);
        return () => {
            node.removeEventListener('pointerdown', onPointerDown);
            node.removeEventListener('pointerup', endPeek);
            node.removeEventListener('pointerleave', endPeek);
            node.removeEventListener('pointercancel', endPeek);
            node.removeEventListener('keydown', onKeyDown);
            node.removeEventListener('keyup', onKeyUp);
            node.removeEventListener('blur', endPeek);
        };
    }, [endPeek, startPeek]);
    const clearAllFilters = () => {
        useUi.getState().clearAllFilters();
    };
    const weekStart = locale === 'zh-CN' ? 1 : 0;
    const weekFiltered = dateFilter ? isWeekRangeKey(dateFilter.start, dateFilter.end, weekStart) : false;
    const latestWeekRange = latestEdit
        ? (() => {
            const start = weekStartKeyOf(latestEdit.key, weekStart);
            return { start, end: addDaysKey(start, 6) };
        })()
        : null;
    const applyFixedRange = (range: DateRangeFilter | null) => {
        useUi.getState().setRelativeFilter(null);
        useUi.getState().setDateFilter(range);
    };
    const filteredMatches = useMemo(() => {
        const query = deferredFilter.trim();
        if (!query)
            return null;
        return fuzzyFilter(notes, query, (n) => `${n.title} ${n.excerpt}`, 200).map(({ item, match }) => ({
            note: item,
            ranges: match.ranges.filter(([s]) => s < item.title.length),
        }));
    }, [notes, deferredFilter]);
    const filteredCount = filteredMatches ? filteredMatches.length : notes.length;
    const filteredIds = useMemo(() => {
        if (filteredMatches)
            return filteredMatches.map((item) => item.note.id);
        return notes.map((note) => note.id);
    }, [filteredMatches, notes]);
    const filteredIdsRef = useRef(filteredIds);
    filteredIdsRef.current = filteredIds;
    const rendered = useMemo(() => {
        if (filteredMatches) {
            return filteredMatches.slice(0, renderLimit).map((item, index) => ({
                ...item,
                position: index + 1,
            }));
        }
        return notes.slice(0, renderLimit).map((note, index) => ({
            note,
            ranges: EMPTY_HIGHLIGHT,
            position: index + 1,
        }));
    }, [filteredMatches, notes, renderLimit]);
    const renderedIds = useMemo(() => new Set(rendered.map((item) => item.note.id)), [rendered]);
    const groups = useMemo(() => groupNotes(rendered, sort, view === 'trash', now), [rendered, sort, view, locale, now]);
    const pendingScrollNoteIdRef = useRef<string | null>(null);
    useEffect(() => {
        setRenderLimit(INITIAL_RENDERED_NOTES);
        listRef.current?.scrollTo?.({ top: 0 });
    }, [view, folderId, tag, deferredFilter, sort, order, density]);
    useEffect(() => {
        pendingScrollNoteIdRef.current = activeNoteId;
    }, [activeNoteId, view, folderId, tag]);
    useEffect(() => {
        if (!activeNoteId)
            return;
        const activeIndex = filteredIds.indexOf(activeNoteId);
        if (activeIndex < 0)
            return;
        startTransition(() => {
            setRenderLimit((current) => {
                if (activeIndex < current)
                    return current;
                return Math.min(filteredCount, Math.ceil((activeIndex + 1) / RENDERED_NOTES_STEP) * RENDERED_NOTES_STEP);
            });
        });
    }, [activeNoteId, filteredIds, filteredCount]);
    useEffect(() => {
        const root = listRef.current;
        const target = loadMoreRef.current;
        if (!root || !target || renderLimit >= filteredCount)
            return;
        if (typeof IntersectionObserver === 'undefined') {
            setRenderLimit(filteredCount);
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting))
                return;
            setRenderLimit((current) => Math.min(filteredCount, current + RENDERED_NOTES_STEP));
        }, { root, rootMargin: '600px 0px' });
        observer.observe(target);
        return () => observer.disconnect();
    }, [filteredCount, renderLimit]);
    useEffect(() => {
        const targetId = pendingScrollNoteIdRef.current;
        if (!targetId || !listRef.current)
            return;
        const element = listRef.current.querySelector<HTMLElement>(`[data-note-id="${targetId}"]`);
        if (element) {
            element.scrollIntoView({ block: 'nearest' });
            pendingScrollNoteIdRef.current = null;
        }
    }, [activeNoteId, renderLimit, view, folderId, tag]);
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            useUi.getState().setSelected(activeNoteId ? [activeNoteId] : []);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
            return;
        event.preventDefault();
        const index = filteredIds.indexOf(activeNoteId ?? '');
        const next = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? filteredIds.length - 1
                : event.key === 'ArrowDown'
                    ? index + 1
                    : index - 1;
        const target = filteredIds[Math.max(0, Math.min(filteredIds.length - 1, next))];
        if (target)
            void openNote(target);
    };
    const selectRange = useCallback((targetId: string) => {
        const ids = filteredIdsRef.current;
        const ui = useUi.getState();
        const anchor = ui.selectedIds[0] ?? ui.activeNoteId;
        const from = ids.indexOf(anchor ?? '');
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) {
            ui.setSelected([targetId]);
            return;
        }
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        ui.setSelected(ids.slice(lo, hi + 1));
    }, []);
    const sortItems: MenuItem[] = view === 'recent' || view === 'trash' ? [
        {
            id: 'fixed-order',
            label: view === 'trash' ? t("notes.recently_deleted_first") : t("notes.recently_edited_first"),
            checked: true,
            disabled: true,
        },
        {
            id: 'density',
            label: density === 'comfortable' ? t("notes.compact_list") : t("notes.comfortable_list"),
            separatorBefore: true,
            onSelect: () => useUi.getState().setDensity(density === 'comfortable' ? 'compact' : 'comfortable'),
        },
    ] : [
        { id: 'updated', label: t("notes.modified"), checked: sort === 'updated', onSelect: () => setSort('updated') },
        { id: 'created', label: t("notes.created"), checked: sort === 'created', onSelect: () => setSort('created') },
        { id: 'title', label: t("notes.title"), checked: sort === 'title', onSelect: () => setSort('title', 'asc') },
        {
            id: 'order',
            label: order === 'desc' ? t("notes.sort_ascending") : t("notes.sort_descending"),
            separatorBefore: true,
            onSelect: () => setSort(sort, order === 'desc' ? 'asc' : 'desc'),
        },
        {
            id: 'density',
            label: density === 'comfortable' ? t("notes.compact_list") : t("notes.comfortable_list"),
            onSelect: () => useUi.getState().setDensity(density === 'comfortable' ? 'compact' : 'comfortable'),
        },
    ];
    const tagFilterItem: MenuItem = {
        id: 'tag-filter',
        label: t("notes.filter_by_tags"),
        icon: <Hash size={13}/>,
        checked: selectedTags.length > 0 || undefined,
        separatorBefore: true,
        onSelect: () => setTagFilterOpen(true),
    };
    return (<section className="relative flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <header className="shrink-0 px-3 pt-3 pb-2">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[14.5px] font-semibold tracking-[-0.016em] text-[var(--text-primary)]">{title}</h2>
            {view === 'folder' && <p className="mt-0.5 truncate text-[10.5px] text-[var(--text-quaternary)]">{isVirtualFolderId(folderId) ? (isTodoFolderId(folderId) ? t("sidebar.todo_folder_hint_value0", { value0: todoTagText }) : t("sidebar.calendar_folder_hint")) : t("folders.includes_subfolders")}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {breakpoint === 'tablet' && (<Tooltip label={t("notes.open_navigation")}>
                <IconButton label={t("notes.open_navigation")} size="sm" onClick={() => toggleNavDrawer(true)}>
                  <PanelLeft size={14}/>
                </IconButton>
              </Tooltip>)}
            <Tooltip label={t("notes.sort_and_display")}>
              <IconButton label={t("notes.sort_and_display")} size="sm" ref={sortButtonRef} onClick={() => setSortMenuOpen(true)}>
                <ArrowDownWideNarrow size={14}/>
              </IconButton>
            </Tooltip>
            {view !== 'trash' && view !== 'archived' && (<>
                <Tooltip label={t("templates.new_note_from_template")} combo="mod+shift+n">
                  <IconButton label={t("templates.new_note_from_template")} size="sm" onClick={() => useUi.getState().openPanel('templates')}>
                    <LayoutTemplate size={14}/>
                  </IconButton>
                </Tooltip>
                <Tooltip label={t("templates.favorites")} side="bottom">
                  <IconButton ref={favButtonRef} label={t("templates.favorites")} size="sm" onClick={() => setFavMenuOpen(true)}>
                    <Star size={14}/>
                  </IconButton>
                </Tooltip>
                {view === 'shared' && (
                  <Tooltip label={t("share.manage_shares")}>
                    <IconButton label={t("share.manage_shares")} size="sm" onClick={() => useUi.getState().openPanel('share-hub')}>
                      <Share2 size={14} className="text-[var(--accent)]"/>
                    </IconButton>
                  </Tooltip>
                )}
                {view === 'published' && (
                  <Tooltip label={t("blog.blog_hub")}>
                    <IconButton label={t("blog.blog_hub")} size="sm" onClick={() => useUi.getState().openPanel('blog-hub')}>
                      <Globe size={14} className="text-[var(--accent)]"/>
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip label={t("common.new_note")} combo="mod+n">
                  <IconButton label={t("common.new_note")} size="sm" onClick={() => void createContextualNote()}>
                    <Plus size={15}/>
                  </IconButton>
                </Tooltip>
              </>)}
          </div>
        </div>

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]"/>
          <input aria-label={t("notes.filter_in_this_view")} value={filter} onChange={(e) => setListQuery(e.target.value)} onKeyDown={(e) => {
            if (e.key === 'Escape')
                setListQuery('');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const first = filteredIds[0];
                if (first)
                    void openNote(first);
                listRef.current?.focus();
            }
        }} placeholder={t("notes.filter_in_this_view")} className={cn('h-10 w-full rounded-[var(--r-md)] border border-transparent bg-[var(--bg-inset)] md:h-[30px]', 'pr-9 pl-8 text-[12.5px] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] md:pr-7 md:pl-7', 'transition-[border-color,box-shadow] duration-[var(--dur-fast)]', 'focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none')}/>
          {filter && (<Tooltip label={t("notes.clear_filters")} side="left">
              <button type="button" onClick={() => setListQuery('')} aria-label={t("notes.clear_filters")} className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] md:right-2 md:size-auto md:p-0.5">
                <X size={12}/>
              </button>
            </Tooltip>)}
        </div>

        {(dateFilter || selectedTags.length > 0 || Boolean(filter)) && (<div role="group" aria-label={t("notes.active_filters")} className="mt-2 flex flex-wrap items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-2 py-1.5">
            {dateFilter && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[11px] text-[var(--text-secondary)]">
                <CalendarDays size={11} className="shrink-0 text-[var(--text-quaternary)]"/>
                <button type="button" ref={rangeChipRef} aria-haspopup="dialog" aria-expanded={rangeEditorOpen} aria-label={t("notes.range_editor_title")} onClick={() => setRangeEditorOpen(true)} className="min-w-0 truncate rounded-full text-left transition-colors hover:text-[var(--text-primary)]">
                  {dayFilterLabelEnd ? t("notes.filtering_by_day_range_value0", { value0: dayFilterLabel, value1: dayFilterLabelEnd }) : t("notes.filtering_by_day_value0", { value0: dayFilterLabel })}
                </button>
                {relativeFilter && (<Tooltip label={relativeFilter.direction === 'edit' ? t("notes.auto_follow_edit") : t("notes.auto_follow_today")}>
                    <span aria-hidden="true" className="shrink-0 rounded-full bg-[var(--accent-soft)] p-0.5 text-[var(--accent)]"><RotateCcw size={10}/></span>
                  </Tooltip>)}
                {gapShown && (<Tooltip label={displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_value0" : "notes.rolling_gap_value0", { value0: displayGap.days }) : ''}>
                    <button type="button" ref={gapCapsuleRef} aria-label={displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_value0" : "notes.rolling_gap_value0", { value0: displayGap.days }) : ""} onClick={() => { if (peekUsed.current) { peekUsed.current = false; return; } const relative = useUi.getState().relativeFilter; if (relative) useUi.getState().setRelativeFilter({ ...relative, direction: 'edit' }); else { const key = latestEdit?.key; if (key) useUi.getState().setDateFilter({ start: key, end: key }); } }} className={cn('shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium transition-colors select-none', peekRange ? 'bg-[var(--accent)] text-[var(--accent-contrast)] ring-1 ring-inset ring-[var(--accent)]' : 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]')}>
                      {displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_short_value0" : "notes.rolling_gap_short_value0", { value0: displayGap.days }) : ""}
                    </button>
                  </Tooltip>)}
                <Tooltip label={t("notes.clear_day_filter")}>
                  <button type="button" aria-label={t("notes.clear_day_filter")} onClick={() => useUi.getState().setDateFilter(null)} className="rounded-full p-0.5 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
                    <X size={10}/>
                  </button>
                </Tooltip>
              </span>)}
            {selectedTags.length > 0 && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[11px] text-[var(--text-secondary)]">
                <Hash size={11} className="shrink-0 text-[var(--text-quaternary)]"/>
                <span className="flex shrink-0 items-center">
                    {selectedTags.slice(0, 5).map((tag) => (<span key={tag} aria-hidden="true" className="size-[7px] rounded-full ring-1 ring-[var(--border-subtle)] first:ml-0 -ml-0.5" style={{ backgroundColor: tagColors.get(tag) ?? 'var(--text-quaternary)' }}/>))}
                </span>
                <span className="truncate">{t("notes.tag_filter_value0", { value0: selectedTags.length })}</span>
                <Tooltip label={t("notes.clear_tag_filter")}>
                  <button type="button" aria-label={t("notes.clear_tag_filter")} onClick={() => useUi.getState().clearTagSelection()} className="rounded-full p-0.5 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
                    <X size={10}/>
                  </button>
                </Tooltip>
              </span>)}
            {filter && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[11px] text-[var(--text-secondary)]">
                <Search size={10} className="shrink-0 text-[var(--text-quaternary)]"/>
                <span className="max-w-36 truncate">{t("notes.search_query_value0", { value0: filter })}</span>
                <Tooltip label={t("notes.clear_search_query")}>
                  <button type="button" aria-label={t("notes.clear_search_query")} onClick={() => setListQuery('')} className="rounded-full p-0.5 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
                    <X size={10}/>
                  </button>
                </Tooltip>
              </span>)}
            {selectedTags.length > 0 && (<div role="group" aria-label={t("notes.selected_tags_match")} className="flex shrink-0 overflow-hidden rounded-full border border-[var(--border-default)]">
                <button type="button" aria-pressed={selectedTagsMatch === 'any'} onClick={() => setSelectedTagsMatch('any')} className="px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">{t("notes.tag_match_any")}</button>
                <button type="button" aria-pressed={selectedTagsMatch === 'all'} onClick={() => setSelectedTagsMatch('all')} className="border-l border-[var(--border-default)] px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">{t("notes.tag_match_all")}</button>
              </div>)}
            <button type="button" aria-pressed={rememberFilters} onClick={() => setRememberFilters((value) => !value)} className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
                {rememberFilters ? <Check size={11}/> : <Bookmark size={11}/>}{t("notes.remember_filters")}
            </button>
            <Tooltip label={t("notes.clear_all_filters")}>
              <button type="button" aria-label={t("notes.clear_all_filters")} onClick={clearAllFilters} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--danger)]">
                <X size={11}/>{t("notes.clear_all_filters")}
              </button>
            </Tooltip>
          </div>)}

        {view === 'trash' && notes.length > 0 && (<button type="button" disabled={emptyingTrash} aria-busy={emptyingTrash} onClick={() => void emptyTrash()} className="mt-2 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] py-1.5 text-[11.5px] text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:pointer-events-none disabled:opacity-50">{t("notes.empty_trash")}{notes.length}{t("notes.notes_93aeb9")}</button>)}
      </header>

      <div key={`${view}:${folderId ?? ''}:${tag ?? ''}`} ref={listRef} role="listbox" aria-label={title} aria-multiselectable="true" aria-activedescendant={activeNoteId && renderedIds.has(activeNoteId) ? `note-option-${activeNoteId}` : undefined} tabIndex={0} onKeyDown={onKeyDown} className="anim-view-content min-h-0 flex-1 overflow-y-auto px-2 pb-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
        {!hydrated && loading ? (<NoteListSkeleton />        ) : filteredCount === 0 ? (<ListEmpty view={view} folderId={folderId} filtering={Boolean(filter)} dayFiltering={Boolean(dateFilter)} tagFiltering={selectedTags.length > 0} latestEdit={latestEdit} onJumpToLatest={() => { if (latestEdit) applyFixedRange({ start: latestEdit.key, end: latestEdit.key }); }} weekFiltered={weekFiltered} onJumpToLatestWeek={() => { if (latestWeekRange) applyFixedRange(latestWeekRange); }}/>) : (groups.map((group) => (<div key={group.key} role="group" aria-label={group.label ?? title}>
              {group.label && (<div className="px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
                  {group.label}
                </div>)}
              <div role="presentation" className="space-y-px">
                {group.items.map(({ note, ranges, position }) => (<NoteRow key={note.id} note={note} isShared={sharedNoteIds.has(note.id)} highlight={ranges} density={density} tagColors={tagColors} position={position} total={filteredCount} onRangeSelect={selectRange}/>))}
              </div>
            </div>)))}
        {renderLimit < filteredCount && <div ref={loadMoreRef} aria-hidden="true" className="h-px"/>}
      </div>

      <BulkBar />

      <Menu anchor={sortButtonRef} open={sortMenuOpen} onClose={() => setSortMenuOpen(false)} items={[...sortItems, tagFilterItem]} align="end"/>
      <Menu anchor={favButtonRef} open={favMenuOpen} onClose={() => setFavMenuOpen(false)} items={favItems} align="end" width={220}/>
      <TagFilterPopover anchor={sortButtonRef} open={tagFilterOpen} onClose={() => setTagFilterOpen(false)}/>
      {dateFilter && <DateRangePopover anchor={rangeChipRef} open={rangeEditorOpen} onClose={() => setRangeEditorOpen(false)} range={dateFilter} onChange={applyFixedRange} relative={relativeFilter} onApplyRelative={(value) => useUi.getState().setRelativeFilter(value)}/>}
    </section>);
}
interface GroupItem {
    note: NoteSummary;
    ranges: [
        number,
        number
    ][];
    position: number;
}
interface Group {
    key: string;
    label: string | null;
    items: GroupItem[];
}
function groupNotes(items: GroupItem[], sort: SortKey, isTrash: boolean, now: number): Group[] {
    const pinned = isTrash ? [] : items.filter((i) => i.note.isPinned);
    const rest = isTrash ? items : items.filter((i) => !i.note.isPinned);
    const groups: Group[] = [];
    if (pinned.length)
        groups.push({ key: 'pinned', label: t("notes.pin"), items: pinned });
    if (sort === 'updated' || sort === 'created' || isTrash) {
        let currentKey: string | null = null;
        let bucket: Group | null = null;
        for (const item of rest) {
            const stamp = isTrash
                ? (item.note.deletedAt ?? item.note.updatedAt)
                : sort === 'created'
                    ? item.note.createdAt
                    : item.note.updatedAt;
            const label = groupLabel(stamp, now);
            if (label !== currentKey) {
                currentKey = label;
                bucket = { key: `${label}-${groups.length}`, label, items: [] };
                groups.push(bucket);
            }
            bucket?.items.push(item);
        }
    }
    else if (rest.length) {
        groups.push({ key: 'rest', label: pinned.length ? t("notes.other") : null, items: rest });
    }
    return groups.filter((g) => g.items.length);
}
function useEmptyTrash() {
    const emptyTrashAction = useNotes((s) => s.emptyTrash);
    const toast = useUi((s) => s.toast);
    const [emptyingTrash, setEmptyingTrash] = useState(false);
    const busyRef = useRef(false);
    const emptyTrash = async () => {
        if (busyRef.current)
            return;
        busyRef.current = true;
        setEmptyingTrash(true);
        try {
            const ok = await confirm({
                title: t("common.empty_trash"),
                description: t("notes.every_note_inside_will_be_permanently_deleted_and_cannot_be_recovered"),
                confirmLabel: t("common.clear"),
                tone: 'danger',
            });
            if (!ok)
                return;
            const purged = await emptyTrashAction();
            if (purged === null)
                return;
            toast({
                title: t("common.permanently_deleted_value0_notes", { value0: purged }),
                tone: 'success',
            });
        }
        catch (err) {
            toast({ title: t("notes.clearing_failed"), description: err instanceof Error ? err.message : String(err), tone: 'danger' });
        }
        finally {
            busyRef.current = false;
            setEmptyingTrash(false);
        }
    };
    return { emptyTrash, emptyingTrash };
}
