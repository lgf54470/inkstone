import { type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
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
} from 'lucide-react'
import { type DateRangeFilter, type NoteSummary, type RelativeFilter, type ViewKind } from '@shared/types'
import { cn } from '../../../lib/cn'
import { IconButton } from '../../../components/primitives'
import { Tooltip } from '../../../components/overlay'
import { isTodoFolderId, isVirtualFolderId } from '../../../lib/calendar-tree'
import { type Breakpoint } from '../../../lib/hooks'
import { t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { createContextualNote } from '../../../store/notes/selectors'
import type { GapInfo } from '../use-gap-indicator'

interface NoteListHeaderProps {
  title: string
  view: ViewKind
  folderId: string | null
  todoTagText: string
  breakpoint: Breakpoint
  toggleNavDrawer: (open: boolean) => void
  sortButtonRef: RefObject<HTMLButtonElement | null>
  setIsSortMenuOpen: (open: boolean) => void
  favButtonRef: RefObject<HTMLButtonElement | null>
  setIsFavMenuOpen: (open: boolean) => void
  filter: string
  setListQuery: (query: string) => void
  listRef: RefObject<HTMLDivElement | null>
  filteredIds: string[]
  openNote: (id: string) => void
  dateFilter: DateRangeFilter | null
  rangeChipRef: RefObject<HTMLButtonElement | null>
  isRangeEditorOpen: boolean
  setIsRangeEditorOpen: (open: boolean) => void
  dayFilterLabel: string
  dayFilterLabelEnd: string | null
  relativeFilter: RelativeFilter | null
  gapShown: boolean
  displayGap: GapInfo | null
  gapCapsuleRef: (node: HTMLButtonElement | null) => void
  peekUsed: MutableRefObject<boolean>
  peekRange: DateRangeFilter | null
  latestEdit: { key: string; label: string } | null
  tagColors: Map<string, string | null>
  selectedTags: string[]
  selectedTagsMatch: 'any' | 'all'
  setSelectedTagsMatch: (match: 'any' | 'all') => void
  rememberFilters: boolean
  setRememberFilters: Dispatch<SetStateAction<boolean>>
  clearAllFilters: () => void
  isEmptyingTrash: boolean
  emptyTrash: () => Promise<void>
  notes: NoteSummary[]
}

export function NoteListHeader({ title, view, folderId, todoTagText, breakpoint, toggleNavDrawer, sortButtonRef, setIsSortMenuOpen, favButtonRef, setIsFavMenuOpen, filter, setListQuery, listRef, filteredIds, openNote, dateFilter, rangeChipRef, isRangeEditorOpen, setIsRangeEditorOpen, dayFilterLabel, dayFilterLabelEnd, relativeFilter, gapShown, displayGap, gapCapsuleRef, peekUsed, peekRange, latestEdit, tagColors, selectedTags, selectedTagsMatch, setSelectedTagsMatch, rememberFilters, setRememberFilters, clearAllFilters, isEmptyingTrash, emptyTrash, notes }: NoteListHeaderProps) {
    return (
      <header className="shrink-0 px-3 pt-3 pb-2">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[length:var(--text-14\.5)] font-semibold tracking-[-0.016em] text-[var(--text-primary)]">{title}</h2>
            {view === 'folder' && <p className="mt-0.5 truncate text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">{isVirtualFolderId(folderId) ? (isTodoFolderId(folderId) ? t("sidebar.todo_folder_hint_value0", { value0: todoTagText }) : t("sidebar.calendar_folder_hint")) : t("folders.includes_subfolders")}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {breakpoint === 'tablet' && (<Tooltip label={t("notes.open_navigation")}>
                <IconButton label={t("notes.open_navigation")} size="sm" onClick={() => toggleNavDrawer(true)}>
                  <PanelLeft size={14}/>
                </IconButton>
              </Tooltip>)}
            <Tooltip label={t("notes.sort_and_display")}>
              <IconButton label={t("notes.sort_and_display")} size="sm" ref={sortButtonRef} onClick={() => setIsSortMenuOpen(true)}>
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
                  <IconButton ref={favButtonRef} label={t("templates.favorites")} size="sm" onClick={() => setIsFavMenuOpen(true)}>
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
        }} placeholder={t("notes.filter_in_this_view")} className={cn('h-10 w-full rounded-[var(--r-md)] border border-transparent bg-[var(--bg-inset)] md:h-[30px]', 'pr-9 pl-8 text-[length:var(--text-12\.5)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] md:pr-7 md:pl-7', 'transition-[border-color,box-shadow] duration-[var(--dur-fast)]', 'focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-ring)] focus:outline-none')}/>
          {filter && (<Tooltip label={t("notes.clear_filters")} side="left">
              <button type="button" onClick={() => setListQuery('')} aria-label={t("notes.clear_filters")} className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] md:right-2 md:size-auto md:p-0.5">
                <X size={12}/>
              </button>
            </Tooltip>)}
        </div>

        {(dateFilter || selectedTags.length > 0 || Boolean(filter)) && (<div role="group" aria-label={t("notes.active_filters")} className="mt-2 flex flex-wrap items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-2 py-1.5">
            {dateFilter && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]">
                <CalendarDays size={11} className="shrink-0 text-[var(--text-quaternary)]"/>
                <button type="button" ref={rangeChipRef} aria-haspopup="dialog" aria-expanded={isRangeEditorOpen} aria-label={t("notes.range_editor_title")} onClick={() => setIsRangeEditorOpen(true)} className="min-w-0 truncate rounded-full text-left transition-colors hover:text-[var(--text-primary)]">
                  {dayFilterLabelEnd ? t("notes.filtering_by_day_range_value0", { value0: dayFilterLabel, value1: dayFilterLabelEnd }) : t("notes.filtering_by_day_value0", { value0: dayFilterLabel })}
                </button>
                {relativeFilter && (<Tooltip label={relativeFilter.direction === 'edit' ? t("notes.auto_follow_edit") : t("notes.auto_follow_today")}>
                    <span aria-hidden="true" className="shrink-0 rounded-full bg-[var(--accent-soft)] p-0.5 text-[var(--accent)]"><RotateCcw size={10}/></span>
                  </Tooltip>)}
                {gapShown && (<Tooltip label={displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_value0" : "notes.rolling_gap_value0", { value0: displayGap.days }) : ''}>
                    <button type="button" ref={gapCapsuleRef} aria-label={displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_value0" : "notes.rolling_gap_value0", { value0: displayGap.days }) : ""} onClick={() => { if (peekUsed.current) { peekUsed.current = false; return; } const relative = useUi.getState().relativeFilter; if (relative) useUi.getState().setRelativeFilter({ ...relative, direction: 'edit' }); else { const key = latestEdit?.key; if (key) useUi.getState().setDateFilter({ start: key, end: key }); } }} className={cn('shrink-0 rounded-full px-1.5 py-px text-[length:var(--text-9)] font-medium transition-colors select-none', peekRange ? 'bg-[var(--accent)] text-[var(--accent-contrast)] ring-1 ring-inset ring-[var(--accent)]' : 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]')}>
                      {displayGap ? t(displayGap.ahead ? "notes.rolling_gap_ahead_short_value0" : "notes.rolling_gap_short_value0", { value0: displayGap.days }) : ""}
                    </button>
                  </Tooltip>)}
                <Tooltip label={t("notes.clear_day_filter")}>
                  <button type="button" aria-label={t("notes.clear_day_filter")} onClick={() => useUi.getState().setDateFilter(null)} className="rounded-full p-0.5 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
                    <X size={10}/>
                  </button>
                </Tooltip>
              </span>)}
            {selectedTags.length > 0 && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]">
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
            {filter && (<span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]">
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

        {view === 'trash' && notes.length > 0 && (<button type="button" disabled={isEmptyingTrash} aria-busy={isEmptyingTrash} onClick={() => void emptyTrash()} className="mt-2 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] py-1.5 text-[length:var(--text-11\.5)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:pointer-events-none disabled:opacity-50">{t("notes.empty_trash")}{notes.length}{t("notes.notes_93aeb9")}</button>)}
      </header>
    );
}
