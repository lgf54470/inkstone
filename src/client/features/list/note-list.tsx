import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Hash,
  LayoutTemplate,
} from 'lucide-react';
import { type DateRangeFilter, type ViewKind } from '@shared/types';
import { useNow } from '../../lib/hooks';
import { fuzzyFilter } from '../../lib/fuzzy';
import { useBreakpoint } from '../../lib/hooks';
import { Menu, type MenuItem } from '../../components/overlay';
import { NoteListSkeleton } from '../../components/feedback';
import { TagFilterPopover } from '../../components/tag-filter-popover';
import { DateRangePopover } from '../../components/date-range-popover';
import { addDaysKey, isWeekRangeKey, parseDateKey, weekStartKeyOf } from '../../lib/time';
import { memoLatestEditKey } from './use-rolling-filter';
import { useGapIndicatorStore } from './use-gap-indicator';
import { loadRememberedFilter, loadSessionFilter, saveRememberedFilter, saveSessionFilter } from './list-filter-persist';
import { useUi } from '../../store/ui';
import { useSession } from '../../store/session';
import { useVisibleNotes } from '../../store/notes/selectors';
import { useNotes } from '../../store/notes';
import { useNoteTemplates } from '../../store/note-templates';
import { createNoteFromTemplate } from '../../lib/template-notes';
import { CALENDAR_TREE, isTodoFolderId, isVirtualFolderId, resolveTodoTag, TODO_TREE, virtualPathSegments } from '../../lib/calendar-tree';
import { folderPathLabel } from '../../lib/folders';
import { useShareStore } from '../share';
import { t, useLocale, type MessageKey } from '../../lib/i18n';
import { BulkBar } from './note-list/bulk-bar';
import { ListEmpty } from './note-list/list-empty';
import { NoteRow } from './note-list/note-row';
import { NoteListHeader } from './note-list/header';
import { groupNotes } from './note-list/grouping';
import { useEmptyTrash } from './note-list/use-empty-trash';

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
    const { emptyTrash, isEmptyingTrash } = useEmptyTrash();
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
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
    const sortButtonRef = useRef<HTMLButtonElement>(null);
    const [isTagFilterOpen, setIsTagFilterOpen] = useState(false);
    const [isRangeEditorOpen, setIsRangeEditorOpen] = useState(false);
    const rangeChipRef = useRef<HTMLButtonElement>(null);
    const [isFavMenuOpen, setIsFavMenuOpen] = useState(false);
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
        onSelect: () => setIsTagFilterOpen(true),
    };
    return (<section className="relative flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)]">
      <NoteListHeader title={title} view={view} folderId={folderId} todoTagText={todoTagText} breakpoint={breakpoint} toggleNavDrawer={toggleNavDrawer} sortButtonRef={sortButtonRef} setIsSortMenuOpen={setIsSortMenuOpen} favButtonRef={favButtonRef} setIsFavMenuOpen={setIsFavMenuOpen} filter={filter} setListQuery={setListQuery} listRef={listRef} filteredIds={filteredIds} openNote={openNote} dateFilter={dateFilter} rangeChipRef={rangeChipRef} isRangeEditorOpen={isRangeEditorOpen} setIsRangeEditorOpen={setIsRangeEditorOpen} dayFilterLabel={dayFilterLabel} dayFilterLabelEnd={dayFilterLabelEnd} relativeFilter={relativeFilter} gapShown={gapShown} displayGap={displayGap} gapCapsuleRef={gapCapsuleRef} peekUsed={peekUsed} peekRange={peekRange} latestEdit={latestEdit} tagColors={tagColors} selectedTags={selectedTags} selectedTagsMatch={selectedTagsMatch} setSelectedTagsMatch={setSelectedTagsMatch} rememberFilters={rememberFilters} setRememberFilters={setRememberFilters} clearAllFilters={clearAllFilters} isEmptyingTrash={isEmptyingTrash} emptyTrash={emptyTrash} notes={notes}/>
      <div key={`${view}:${folderId ?? ''}:${tag ?? ''}`} ref={listRef} role="listbox" aria-label={title} aria-multiselectable="true" aria-activedescendant={activeNoteId && renderedIds.has(activeNoteId) ? `note-option-${activeNoteId}` : undefined} tabIndex={0} onKeyDown={onKeyDown} className="anim-view-content min-h-0 flex-1 overflow-y-auto px-2 pb-4 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
        {!hydrated && loading ? (<NoteListSkeleton />        ) : filteredCount === 0 ? (<ListEmpty view={view} folderId={folderId} filtering={Boolean(filter)} dayFiltering={Boolean(dateFilter)} tagFiltering={selectedTags.length > 0} latestEdit={latestEdit} onJumpToLatest={() => { if (latestEdit) applyFixedRange({ start: latestEdit.key, end: latestEdit.key }); }} weekFiltered={weekFiltered} onJumpToLatestWeek={() => { if (latestWeekRange) applyFixedRange(latestWeekRange); }}/>) : (groups.map((group) => (<div key={group.key} role="group" aria-label={group.label ?? title}>
              {group.label && (<div className="px-2 pt-3 pb-1 text-[length:var(--text-10\.5)] font-semibold tracking-[0.06em] text-[var(--text-quaternary)]">
                  {group.label}
                </div>)}
              <div role="presentation" className="space-y-px">
                {group.items.map(({ note, ranges, position }) => (<NoteRow key={note.id} note={note} isShared={sharedNoteIds.has(note.id)} highlight={ranges} density={density} tagColors={tagColors} position={position} total={filteredCount} onRangeSelect={selectRange}/>))}
              </div>
            </div>)))}
        {renderLimit < filteredCount && <div ref={loadMoreRef} aria-hidden="true" className="h-px"/>}
      </div>

      <BulkBar />

      <Menu anchor={sortButtonRef} open={isSortMenuOpen} onClose={() => setIsSortMenuOpen(false)} items={[...sortItems, tagFilterItem]} align="end"/>
      <Menu anchor={favButtonRef} open={isFavMenuOpen} onClose={() => setIsFavMenuOpen(false)} items={favItems} align="end" width={220}/>
      <TagFilterPopover anchor={sortButtonRef} open={isTagFilterOpen} onClose={() => setIsTagFilterOpen(false)}/>
      {dateFilter && <DateRangePopover anchor={rangeChipRef} open={isRangeEditorOpen} onClose={() => setIsRangeEditorOpen(false)} range={dateFilter} onChange={applyFixedRange} relative={relativeFilter} onApplyRelative={(value) => useUi.getState().setRelativeFilter(value)}/>}
    </section>);
}