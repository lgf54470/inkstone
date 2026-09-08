import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  Hash,
  LayoutTemplate,
} from 'lucide-react'
import { type DateRangeFilter, type Folder, type NoteSummary, type NoteTemplate, type SortKey, type SortOrder, type UiDensity, type ViewKind } from '@shared/types'
import { useNow, useBreakpoint } from '../../lib/hooks'
import { fuzzyFilter } from '../../lib/fuzzy'
import { Menu, type MenuItem } from '../../components/overlay'
import { TagFilterPopover } from '../../components/tag-filter-popover'
import { DateRangePopover } from '../../components/date-range-popover'
import { addDaysKey, isWeekRangeKey, parseDateKey, weekStartKeyOf } from '../../lib/time'
import { memoLatestEditKey } from './use-rolling-filter'
import { useGapIndicatorStore } from './use-gap-indicator'

const FAV_MENU_WIDTH = 220
import { loadRememberedFilter, loadSessionFilter, saveRememberedFilter, saveSessionFilter } from './list-filter-persist'
import { useUi } from '../../store/ui'
import { useSession } from '../../store/session'
import { useVisibleNotes } from '../../store/notes'
import { useNotes } from '../../store/notes'
import { useNoteTemplates } from '../../store/note-templates'
import { createNoteFromTemplate } from '../../lib/template-notes'
import { CALENDAR_TREE, isTodoFolderId, isVirtualFolderId, resolveTodoTag, TODO_TREE, virtualPathSegments } from '../../lib/calendar-tree'
import { folderPathLabel } from '../../lib/folders'
import { useShareStore } from '../share'
import { t, useLocale, type MessageKey } from '../../lib/i18n'
import { BulkBar } from './note-list/bulk-bar'
import { NoteListHeader } from './note-list/header'
import { groupNotes } from './note-list/grouping'
import { useEmptyTrash } from './note-list/use-empty-trash'
import { NoteListBody, useRenderWindow, type FilteredMatch } from './note-list/render-window'

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
}
function listFilterMatches(notes: NoteSummary[], query: string): FilteredMatch[] | null {
    const trimmed = query.trim()
    if (!trimmed)
        return null
    return fuzzyFilter(notes, trimmed, (n) => `${n.title} ${n.excerpt}`, 200).map(({ item, match }) => ({
        note: item,
        ranges: match.ranges.filter(([start]) => start < item.title.length),
    }))
}

function listTitle(view: ViewKind, folderId: string | null, tag: string | null, folders: Folder[]): string {
    if (view === 'folder') {
        if (isVirtualFolderId(folderId)) {
            const isTodo = isTodoFolderId(folderId)
            const ns = isTodo ? TODO_TREE : CALENDAR_TREE
            const rootLabel = isTodo ? t('sidebar.todo_folder') : t('sidebar.calendar_folder')
            const segments = virtualPathSegments(folderId, ns)
            return segments ? [rootLabel, ...segments].join(' / ') : rootLabel
        }
        return (folderId ? folderPathLabel(folders, folderId) : '') || t('navigation.folder')
    }
    if (view === 'tag')
        return `#${tag ?? ''}`
    return t(VIEW_MESSAGE_KEYS[view])
}

function dayFilterLabelOf(dateFilter: DateRangeFilter | null, locale: string): string {
    if (!dateFilter)
        return ''
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(dateFilter.start))
}

function dayFilterLabelEndOf(dateFilter: DateRangeFilter | null, locale: string): string | null {
    if (!dateFilter || dateFilter.start === dateFilter.end)
        return null
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(dateFilter.end))
}

function latestEditOf(allNotes: Record<string, NoteSummary>, locale: string): { key: string; label: string } | null {
    const key = memoLatestEditKey(allNotes)
    if (!key)
        return null
    return {
        key,
        label: new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(parseDateKey(key)),
    }
}

function favoriteTemplateItems(allTemplates: NoteTemplate[]): MenuItem[] {
    const favorites = allTemplates
        .filter((item) => item.isStarred)
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || b.updatedAt - a.updatedAt)
    if (!favorites.length)
        return [
            { id: 'empty', label: t('templates.no_favorite_templates'), disabled: true },
            {
                id: 'open-library',
                label: t('templates.open_template_library'),
                icon: <LayoutTemplate size={13}/>,
                separatorBefore: true,
                onSelect: () => useUi.getState().openPanel('templates'),
            },
        ]
    return favorites.map((template) => ({
        id: template.id,
        label: template.name,
        icon: <LayoutTemplate size={13}/>,
        onSelect: () => void createNoteFromTemplate(template),
    }))
}

function listSortItems(view: ViewKind, sort: SortKey, order: SortOrder, density: UiDensity, setSort: (key: SortKey, order?: SortOrder) => void): MenuItem[] {
    if (view === 'recent' || view === 'trash') {
        return [
            {
                id: 'fixed-order',
                label: view === 'trash' ? t('notes.recently_deleted_first') : t('notes.recently_edited_first'),
                checked: true,
                disabled: true,
            },
            {
                id: 'density',
                label: density === 'comfortable' ? t('notes.compact_list') : t('notes.comfortable_list'),
                separatorBefore: true,
                onSelect: () => useUi.getState().setDensity(density === 'comfortable' ? 'compact' : 'comfortable'),
            },
        ]
    }
    return [
        { id: 'updated', label: t('notes.modified'), checked: sort === 'updated', onSelect: () => setSort('updated') },
        { id: 'created', label: t('notes.created'), checked: sort === 'created', onSelect: () => setSort('created') },
        { id: 'title', label: t('notes.title'), checked: sort === 'title', onSelect: () => setSort('title', 'asc') },
        {
            id: 'order',
            label: order === 'desc' ? t('notes.sort_ascending') : t('notes.sort_descending'),
            separatorBefore: true,
            onSelect: () => setSort(sort, order === 'desc' ? 'asc' : 'desc'),
        },
        {
            id: 'density',
            label: density === 'comfortable' ? t('notes.compact_list') : t('notes.comfortable_list'),
            onSelect: () => useUi.getState().setDensity(density === 'comfortable' ? 'compact' : 'comfortable'),
        },
    ]
}

function listKeyDown(event: React.KeyboardEvent, state: { filteredIds: string[]; activeNoteId: string | null }, actions: { openNote: (id: string) => void }): void {
    if (event.key === 'Escape') {
        useUi.getState().setSelected(state.activeNoteId ? [state.activeNoteId] : [])
        return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
        return
    event.preventDefault()
    const index = state.filteredIds.indexOf(state.activeNoteId ?? '')
    const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
            ? state.filteredIds.length - 1
            : event.key === 'ArrowDown'
                ? index + 1
                : index - 1
    const target = state.filteredIds[Math.max(0, Math.min(state.filteredIds.length - 1, next))]
    if (target)
        void actions.openNote(target)
}

function selectRangeInList(targetId: string, filteredIds: string[]): void {
    const ui = useUi.getState()
    const anchor = ui.selectedIds[0] ?? ui.activeNoteId
    const from = filteredIds.indexOf(anchor ?? '')
    const to = filteredIds.indexOf(targetId)
    if (from < 0 || to < 0) {
        ui.setSelected([targetId])
        return
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    ui.setSelected(filteredIds.slice(lo, hi + 1))
}

function attachGapPeekListeners(node: HTMLButtonElement, startPeek: (instant: boolean) => void, endPeek: () => void): () => void {
    const onPointerDown = (event: PointerEvent) => startPeek(event.shiftKey)
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            startPeek(true)
        }
    }
    const onKeyUp = (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ')
            endPeek()
    }
    node.addEventListener('pointerdown', onPointerDown)
    node.addEventListener('pointerup', endPeek)
    node.addEventListener('pointerleave', endPeek)
    node.addEventListener('pointercancel', endPeek)
    node.addEventListener('keydown', onKeyDown)
    node.addEventListener('keyup', onKeyUp)
    node.addEventListener('blur', endPeek)
    return () => {
        node.removeEventListener('pointerdown', onPointerDown)
        node.removeEventListener('pointerup', endPeek)
        node.removeEventListener('pointerleave', endPeek)
        node.removeEventListener('pointercancel', endPeek)
        node.removeEventListener('keydown', onKeyDown)
        node.removeEventListener('keyup', onKeyUp)
        node.removeEventListener('blur', endPeek)
    }
}

function useNoteListStore() {
    const view = useUi((s) => s.view)
    const folderId = useUi((s) => s.folderId)
    const tag = useUi((s) => s.tag)
    const sort = useUi((s) => s.sort)
    const order = useUi((s) => s.order)
    const density = useUi((s) => s.density)
    const setSort = useUi((s) => s.setSort)
    const activeNoteId = useUi((s) => s.activeNoteId)
    const toggleNavDrawer = useUi((s) => s.toggleNavDrawer)
    const selectedTags = useUi((s) => s.selectedTags)
    const selectedTagsMatch = useUi((s) => s.selectedTagsMatch)
    const setSelectedTagsMatch = useUi((s) => s.setSelectedTagsMatch)
    const dateFilter = useUi((s) => s.dateFilter)
    const relativeFilter = useUi((s) => s.relativeFilter)
    const listQuery = useUi((s) => s.listQuery)
    const setListQuery = useUi((s) => s.setListQuery)
    const folders = useNotes((s) => s.folders)
    const tags = useNotes((s) => s.tags)
    const loading = useNotes((s) => s.loading)
    const hydrated = useNotes((s) => s.hydrated)
    const openNote = useNotes((s) => s.openNote)
    const allNotes = useNotes((s) => s.notes)
    return { view, folderId, tag, sort, order, density, setSort, activeNoteId, toggleNavDrawer, selectedTags, selectedTagsMatch, setSelectedTagsMatch, dateFilter, relativeFilter, listQuery, setListQuery, folders, tags, loading, hydrated, openNote, allNotes }
}

function usePersistedListFilters() {
    const [persistedFilters] = useState(() => loadRememberedFilter() ?? loadSessionFilter())
    const [rememberFilters, setRememberFilters] = useState(() => loadRememberedFilter() !== null)
    useEffect(() => {
        useUi.setState({
            listQuery: persistedFilters.query,
            dateFilter: persistedFilters.dateFilter,
            relativeFilter: persistedFilters.relativeFilter,
            selectedTags: persistedFilters.selectedTags,
            selectedTagsMatch: persistedFilters.selectedTagsMatch,
        })
    }, [persistedFilters])
    return { rememberFilters, setRememberFilters }
}

function useFavoriteTemplateItems() {
    const allTemplates = useNoteTemplates((s) => s.templates)
    useEffect(() => {
        const state = useNoteTemplates.getState()
        if (!state.hydrated)
            void state.hydrate().catch((error) => {
                console.warn('[notes] failed to hydrate the template library', error)
            })
    }, [])
    return useMemo(() => favoriteTemplateItems(allTemplates), [allTemplates])
}

function useGapPeek(engagePeek: () => DateRangeFilter | null, releasePeek: () => void) {
    const peekTimer = useRef<number | null>(null)
    const peekUsed = useRef(false)
    const startPeek = useCallback((instant: boolean) => {
        if (instant) {
            if (engagePeek())
                peekUsed.current = true
            return
        }
        if (peekTimer.current !== null)
            window.clearTimeout(peekTimer.current)
        peekTimer.current = window.setTimeout(() => {
            if (engagePeek())
                peekUsed.current = true
        }, 350)
    }, [engagePeek])
    const endPeek = useCallback(() => {
        if (peekTimer.current !== null) {
            window.clearTimeout(peekTimer.current)
            peekTimer.current = null
        }
        releasePeek()
    }, [releasePeek])
    const gapCapsuleRef = useCallback((node: HTMLButtonElement | null) => {
        if (!node)
            return undefined
        return attachGapPeekListeners(node, startPeek, endPeek)
    }, [endPeek, startPeek])
    return { peekUsed, gapCapsuleRef }
}

function useListData() {
    const locale = useLocale()
    const store = useNoteListStore()
    const { view, folderId, tag, sort, order, density, setSort, activeNoteId, toggleNavDrawer, selectedTags, selectedTagsMatch, setSelectedTagsMatch, dateFilter, relativeFilter, listQuery, setListQuery, folders, tags, loading, hydrated, openNote, allNotes } = store
    const todoTagText = resolveTodoTag(useSession((s) => s.settings.notes?.todoTag), locale)
    const breakpoint = useBreakpoint()
    const notes = useVisibleNotes()
    const shares = useShareStore((s) => s.shares)
    const sharedNoteIds = useMemo(() => new Set(shares.map((s) => s.noteId)), [shares])
    const { emptyTrash, isEmptyingTrash } = useEmptyTrash()
    const { rememberFilters, setRememberFilters } = usePersistedListFilters()
    const filter = listQuery
    const deferredFilter = useDeferredValue(filter)
    useEffect(() => {
        const combo = { query: filter, dateFilter, relativeFilter, selectedTags, selectedTagsMatch }
        saveSessionFilter(combo)
        if (rememberFilters)
            saveRememberedFilter(combo)
        else
            saveRememberedFilter(null)
    }, [filter, dateFilter, relativeFilter, selectedTags, selectedTagsMatch, rememberFilters])
    return { locale, view, folderId, tag, sort, order, density, setSort, activeNoteId, toggleNavDrawer, selectedTags, selectedTagsMatch, setSelectedTagsMatch, dateFilter, relativeFilter, listQuery, setListQuery, folders, tags, loading, hydrated, openNote, allNotes, todoTagText, breakpoint, notes, sharedNoteIds, emptyTrash, isEmptyingTrash, rememberFilters, setRememberFilters, filter, deferredFilter }
}

function useListLayout() {
    const [isSortMenuOpen, setIsSortMenuOpen] = useState(false)
    const sortButtonRef = useRef<HTMLButtonElement>(null)
    const [isTagFilterOpen, setIsTagFilterOpen] = useState(false)
    const [isRangeEditorOpen, setIsRangeEditorOpen] = useState(false)
    const rangeChipRef = useRef<HTMLButtonElement>(null)
    const [isFavMenuOpen, setIsFavMenuOpen] = useState(false)
    const favButtonRef = useRef<HTMLButtonElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const loadMoreRef = useRef<HTMLDivElement>(null)
    return { isSortMenuOpen, setIsSortMenuOpen, sortButtonRef, isTagFilterOpen, setIsTagFilterOpen, isRangeEditorOpen, setIsRangeEditorOpen, rangeChipRef, isFavMenuOpen, setIsFavMenuOpen, favButtonRef, listRef, loadMoreRef }
}

function useListGap() {
    const gap = useGapIndicatorStore((s) => s.gap)
    const lastGap = useGapIndicatorStore((s) => s.lastGap)
    const peekRange = useGapIndicatorStore((s) => s.peekRange)
    const engagePeek = useGapIndicatorStore((s) => s.engagePeek)
    const releasePeek = useGapIndicatorStore((s) => s.releasePeek)
    const displayGap = gap ?? lastGap
    const gapShown = gap !== null || peekRange !== null
    const { peekUsed, gapCapsuleRef } = useGapPeek(engagePeek, releasePeek)
    return { displayGap, gapShown, peekUsed, gapCapsuleRef, peekRange }
}

function useWeekRange(locale: string, dateFilter: DateRangeFilter | null, latestEdit: { key: string; label: string } | null) {
    const weekStart = locale === 'zh-CN' ? 1 : 0
    const weekFiltered = dateFilter ? isWeekRangeKey(dateFilter.start, dateFilter.end, weekStart) : false
    const latestWeekRange = latestEdit
        ? (() => {
            const start = weekStartKeyOf(latestEdit.key, weekStart)
            return { start, end: addDaysKey(start, 6) }
        })()
        : null
    return { weekFiltered, latestWeekRange }
}

function useListFiltering(notes: NoteSummary[], deferredFilter: string) {
    const filteredMatches = useMemo(() => listFilterMatches(notes, deferredFilter), [notes, deferredFilter])
    const filteredCount = filteredMatches ? filteredMatches.length : notes.length
    const filteredIds = useMemo(() => {
        if (filteredMatches)
            return filteredMatches.map((item) => item.note.id)
        return notes.map((note) => note.id)
    }, [filteredMatches, notes])
    const filteredIdsRef = useRef(filteredIds)
    filteredIdsRef.current = filteredIds
    return { filteredMatches, filteredCount, filteredIds, filteredIdsRef }
}

function useListDerived(data: ReturnType<typeof useListData>, layout: ReturnType<typeof useListLayout>) {
    const { locale, view, folderId, tag, sort, order, density, setSort, activeNoteId, selectedTags, selectedTagsMatch, setSelectedTagsMatch, dateFilter, relativeFilter, setListQuery, folders, tags, notes, openNote, allNotes } = data
    const { isSortMenuOpen, setIsSortMenuOpen, sortButtonRef, isTagFilterOpen, setIsTagFilterOpen, isRangeEditorOpen, setIsRangeEditorOpen, rangeChipRef, isFavMenuOpen, setIsFavMenuOpen, favButtonRef, listRef, loadMoreRef } = layout
    const now = useNow()
    const tagColors = useMemo(() => new Map((tags ?? []).map((item) => [item.name, item.color])), [tags])
    const favItems = useFavoriteTemplateItems()
    const filterScope = useRef<{ view: ViewKind; folderId: string | null; tag: string | null } | null>(null)
    useEffect(() => {
        if (filterScope.current && (filterScope.current.view !== view || filterScope.current.folderId !== folderId || filterScope.current.tag !== tag))
            setListQuery('')
        filterScope.current = { view, folderId, tag }
    }, [view, folderId, tag])
    const title = useMemo(() => listTitle(view, folderId, tag, folders), [view, folderId, tag, folders])
    const dayFilterLabel = useMemo(() => dayFilterLabelOf(dateFilter, locale), [dateFilter, locale])
    const dayFilterLabelEnd = useMemo(() => dayFilterLabelEndOf(dateFilter, locale), [dateFilter, locale])
    const latestEdit = useMemo(() => latestEditOf(allNotes, locale), [allNotes, locale])
    const { displayGap, gapShown, peekUsed, gapCapsuleRef, peekRange } = useListGap()
    const { weekFiltered, latestWeekRange } = useWeekRange(locale, dateFilter, latestEdit)
    const applyFixedRange = (range: DateRangeFilter | null) => {
        useUi.getState().setRelativeFilter(null)
        useUi.getState().setDateFilter(range)
    }
    const { filteredMatches, filteredCount, filteredIds, filteredIdsRef } = useListFiltering(notes, data.deferredFilter)
    const { renderLimit, rendered, renderedIds } = useRenderWindow({ filteredMatches, notes, filteredCount, activeNoteId, filteredIds, view, folderId, tag, sort, order, density, deferredFilter: data.deferredFilter, listRef, loadMoreRef })
    const groups = useMemo(() => groupNotes(rendered, sort, view === 'trash', now), [rendered, sort, view, locale, now])
    const onKeyDown = (event: React.KeyboardEvent) => listKeyDown(event, { filteredIds, activeNoteId }, { openNote })
    const selectRange = useCallback((targetId: string) => selectRangeInList(targetId, filteredIdsRef.current), [])
    const sortItems = useMemo(() => listSortItems(view, sort, order, density, setSort), [view, sort, order, density, setSort])
    const tagFilterItem: MenuItem = {
        id: 'tag-filter',
        label: t('notes.filter_by_tags'),
        icon: <Hash size={13}/>,
        checked: selectedTags.length > 0 || undefined,
        separatorBefore: true,
        onSelect: () => setIsTagFilterOpen(true),
    }
    return {
        title, view, folderId, tag, todoTagText: data.todoTagText, breakpoint: data.breakpoint, toggleNavDrawer: data.toggleNavDrawer,
        sortButtonRef, setIsSortMenuOpen, favButtonRef, setIsFavMenuOpen, filter: data.filter, setListQuery, listRef, filteredIds, openNote,
        dateFilter, rangeChipRef, isRangeEditorOpen, setIsRangeEditorOpen, dayFilterLabel, dayFilterLabelEnd, relativeFilter,
        gapShown, displayGap, gapCapsuleRef, peekUsed, peekRange, latestEdit, tagColors, selectedTags, selectedTagsMatch, setSelectedTagsMatch,
        rememberFilters: data.rememberFilters, setRememberFilters: data.setRememberFilters, isEmptyingTrash: data.isEmptyingTrash, emptyTrash: data.emptyTrash,
        notes, groups, activeNoteId, renderedIds, onKeyDown, hydrated: data.hydrated, loading: data.loading, filteredCount, weekFiltered, latestWeekRange,
        applyFixedRange, sharedNoteIds: data.sharedNoteIds, density, selectRange, renderLimit, loadMoreRef,
        isSortMenuOpen, sortItems, tagFilterItem, isFavMenuOpen, favItems, isTagFilterOpen, setIsTagFilterOpen,
    }
}

export function NoteList() {
    const data = useListData()
    const layout = useListLayout()
    const d = useListDerived(data, layout)
    return (<section className='relative flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-base)]'>
      <NoteListHeader title={d.title} view={d.view} folderId={d.folderId} todoTagText={d.todoTagText} breakpoint={d.breakpoint} toggleNavDrawer={d.toggleNavDrawer} sortButtonRef={d.sortButtonRef} setIsSortMenuOpen={d.setIsSortMenuOpen} favButtonRef={d.favButtonRef} setIsFavMenuOpen={d.setIsFavMenuOpen} filter={d.filter} setListQuery={d.setListQuery} listRef={d.listRef} filteredIds={d.filteredIds} openNote={d.openNote} dateFilter={d.dateFilter} rangeChipRef={d.rangeChipRef} isRangeEditorOpen={d.isRangeEditorOpen} setIsRangeEditorOpen={d.setIsRangeEditorOpen} dayFilterLabel={d.dayFilterLabel} dayFilterLabelEnd={d.dayFilterLabelEnd} relativeFilter={d.relativeFilter} gapShown={d.gapShown} displayGap={d.displayGap} gapCapsuleRef={d.gapCapsuleRef} peekUsed={d.peekUsed} peekRange={d.peekRange} latestEdit={d.latestEdit} tagColors={d.tagColors} selectedTags={d.selectedTags} selectedTagsMatch={d.selectedTagsMatch} setSelectedTagsMatch={d.setSelectedTagsMatch} rememberFilters={d.rememberFilters} setRememberFilters={d.setRememberFilters} clearAllFilters={() => useUi.getState().clearAllFilters()} isEmptyingTrash={d.isEmptyingTrash} emptyTrash={d.emptyTrash} notes={d.notes}/>

      <NoteListBody scope={{ view: d.view, folderId: d.folderId, tag: d.tag }} groups={d.groups} title={d.title} activeNoteId={d.activeNoteId} renderedIds={d.renderedIds} onKeyDown={d.onKeyDown} listRef={d.listRef} hydrated={d.hydrated} loading={d.loading} filteredCount={d.filteredCount} filter={d.filter} dateFilter={d.dateFilter} selectedTags={d.selectedTags} latestEdit={d.latestEdit} weekFiltered={d.weekFiltered} latestWeekRange={d.latestWeekRange} applyFixedRange={d.applyFixedRange} sharedNoteIds={d.sharedNoteIds} density={d.density} tagColors={d.tagColors} selectRange={d.selectRange} renderLimit={d.renderLimit} loadMoreRef={d.loadMoreRef}/>

      <BulkBar />

      <Menu anchor={d.sortButtonRef} open={d.isSortMenuOpen} onClose={() => d.setIsSortMenuOpen(false)} items={[...d.sortItems, d.tagFilterItem]} align='end'/>
      <Menu anchor={d.favButtonRef} open={d.isFavMenuOpen} onClose={() => d.setIsFavMenuOpen(false)} items={d.favItems} align='end' width={FAV_MENU_WIDTH}/>
      <TagFilterPopover anchor={d.sortButtonRef} open={d.isTagFilterOpen} onClose={() => d.setIsTagFilterOpen(false)}/>
      {d.dateFilter && <DateRangePopover anchor={d.rangeChipRef} open={d.isRangeEditorOpen} onClose={() => d.setIsRangeEditorOpen(false)} range={d.dateFilter} onChange={d.applyFixedRange} relative={d.relativeFilter} onApplyRelative={(value) => useUi.getState().setRelativeFilter(value)}/>}
    </section>)
}