import { type Dispatch, type MutableRefObject, type ReactNode, type RefObject, type SetStateAction } from 'react'
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
import { createContextualNote } from '../../../store/notes'
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

function HeaderIconAction({
  label,
  icon,
  onClick,
  buttonRef,
}: {
  label: string
  icon: ReactNode
  onClick: () => void
  buttonRef?: RefObject<HTMLButtonElement | null>
}) {
  return (
    <Tooltip label={label} side="bottom">
      <IconButton ref={buttonRef} label={label} size="sm" onClick={onClick}>
        {icon}
      </IconButton>
    </Tooltip>
  )
}

function ListHeaderActions({
  view,
  breakpoint,
  toggleNavDrawer,
  sortButtonRef,
  setIsSortMenuOpen,
  favButtonRef,
  setIsFavMenuOpen,
}: {
  view: ViewKind
  breakpoint: Breakpoint
  toggleNavDrawer: (open: boolean) => void
  sortButtonRef: RefObject<HTMLButtonElement | null>
  setIsSortMenuOpen: (open: boolean) => void
  favButtonRef: RefObject<HTMLButtonElement | null>
  setIsFavMenuOpen: (open: boolean) => void
}) {
  const showContextual = view !== 'trash' && view !== 'archived'
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {breakpoint === 'tablet' && (
        <Tooltip label={t('notes.open_navigation')} side="bottom">
          <IconButton label={t('notes.open_navigation')} size="sm" onClick={() => toggleNavDrawer(true)}>
            <PanelLeft size={14} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip label={t('notes.sort_and_display')} side="bottom">
        <IconButton ref={sortButtonRef} label={t('notes.sort_and_display')} size="sm" onClick={() => setIsSortMenuOpen(true)}>
          <ArrowDownWideNarrow size={14} />
        </IconButton>
      </Tooltip>
      {showContextual && (
        <>
          <HeaderIconAction
            label={t('templates.new_note_from_template')}
            icon={<LayoutTemplate size={14} />}
            onClick={() => useUi.getState().openPanel('templates')}
          />
          <HeaderIconAction
            label={t('templates.favorites')}
            icon={<Star size={14} />}
            onClick={() => setIsFavMenuOpen(true)}
            buttonRef={favButtonRef}
          />
          {view === 'shared' && (
            <HeaderIconAction label={t('share.manage_shares')} icon={<Share2 size={14} className="text-[var(--accent)]" />} onClick={() => useUi.getState().openPanel('share-hub')} />
          )}
          {view === 'published' && (
            <HeaderIconAction label={t('blog.blog_hub')} icon={<Globe size={14} className="text-[var(--accent)]" />} onClick={() => useUi.getState().openPanel('blog-hub')} />
          )}
          <HeaderIconAction label={t('common.new_note')} icon={<Plus size={15} />} onClick={() => void createContextualNote()} />
        </>
      )}
    </div>
  )
}

function FolderSubtitle({ view, folderId, todoTagText }: { view: ViewKind; folderId: string | null; todoTagText: string }) {
  if (view !== 'folder') return null
  const hint = isVirtualFolderId(folderId)
    ? isTodoFolderId(folderId)
      ? t('sidebar.todo_folder_hint_value0', { value0: todoTagText })
      : t('sidebar.calendar_folder_hint')
    : t('folders.includes_subfolders')
  return <p className="mt-0.5 truncate text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)]">{hint}</p>
}

function handleSearchKeyDown(
  event: React.KeyboardEvent<HTMLInputElement>,
  filter: string,
  filteredIds: string[],
  openNote: (id: string) => void,
  listRef: RefObject<HTMLDivElement | null>,
  setListQuery: (query: string) => void,
) {
  if (event.key === 'Escape') {
    if (filter) setListQuery('')
    return
  }
  if (event.key !== 'ArrowDown') return
  event.preventDefault()
  const first = filteredIds[0]
  if (first) void openNote(first)
  listRef.current?.focus()
}

function NoteSearchField({
  filter,
  setListQuery,
  listRef,
  filteredIds,
  openNote,
}: {
  filter: string
  setListQuery: (query: string) => void
  listRef: RefObject<HTMLDivElement | null>
  filteredIds: string[]
  openNote: (id: string) => void
}) {
  return (
    <div className="relative">
      <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--text-quaternary)]" />
      <input
        aria-label={t('notes.filter_in_this_view')}
        value={filter}
        onChange={(e) => setListQuery(e.target.value)}
        onKeyDown={(event) => handleSearchKeyDown(event, filter, filteredIds, openNote, listRef, setListQuery)}
        placeholder={t('notes.filter_in_this_view')}
        className={cn(
          'h-10 w-full rounded-[var(--r-md)] border border-transparent bg-[var(--bg-inset)] md:h-[30px]',
          'pr-9 pl-8 text-[length:var(--text-12\\.5)] text-[var(--text-primary)] placeholder:text-[var(--text-quaternary)] md:pr-7 md:pl-7',
          'transition-[border-color,box-shadow] duration-[var(--dur-fast)]',
          'focus:border-[var(--accent)] focus:shadow-[var(--shadow-focus)] focus:outline-none',
        )}
      />
      {filter && (
        <Tooltip label={t('notes.clear_filters')} side="left">
          <button
            type="button"
            onClick={() => setListQuery('')}
            aria-label={t('notes.clear_filters')}
            className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] md:right-2 md:size-auto md:p-0.5"
          >
            <X size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  )
}

function FilterChipFrame({
  icon,
  children,
  clearLabel,
  onClear,
}: {
  icon: ReactNode
  children: ReactNode
  clearLabel: string
  onClear: () => void
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--bg-surface)] py-0.5 pr-1 pl-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]">
      {icon}
      {children}
      <Tooltip label={clearLabel}>
        <button type="button" aria-label={clearLabel} onClick={onClear} className="rounded-full p-0.5 text-[var(--text-quaternary)] transition-colors hover:text-[var(--text-secondary)]">
          <X size={10} />
        </button>
      </Tooltip>
    </span>
  )
}

function DayFilterChip(props: Pick<NoteListHeaderProps, 'dateFilter' | 'rangeChipRef' | 'isRangeEditorOpen' | 'setIsRangeEditorOpen' | 'dayFilterLabel' | 'dayFilterLabelEnd' | 'relativeFilter' | 'gapShown' | 'displayGap' | 'gapCapsuleRef' | 'peekUsed' | 'peekRange' | 'latestEdit'>) {
  const { dateFilter } = props
  if (!dateFilter) return null
  return (
    <FilterChipFrame
      icon={<CalendarDays size={11} className="shrink-0 text-[var(--text-quaternary)]" />}
      clearLabel={t('notes.clear_day_filter')}
      onClear={() => useUi.getState().setDateFilter(null)}
    >
      <button
        type="button"
        ref={props.rangeChipRef}
        aria-haspopup="dialog"
        aria-expanded={props.isRangeEditorOpen}
        aria-label={t('notes.range_editor_title')}
        onClick={() => props.setIsRangeEditorOpen(true)}
        className="min-w-0 truncate rounded-full text-left transition-colors hover:text-[var(--text-primary)]"
      >
        {props.dayFilterLabelEnd
          ? t('notes.filtering_by_day_range_value0', { value0: props.dayFilterLabel, value1: props.dayFilterLabelEnd })
          : t('notes.filtering_by_day_value0', { value0: props.dayFilterLabel })}
      </button>
      {props.relativeFilter && <RelativeFollowBadge direction={props.relativeFilter.direction} />}
      {props.gapShown && <GapCapsule {...props} />}
    </FilterChipFrame>
  )
}

function RelativeFollowBadge({ direction }: { direction: 'edit' | 'today' }) {
  const label = direction === 'edit' ? t('notes.auto_follow_edit') : t('notes.auto_follow_today')
  return (
    <Tooltip label={label}>
      <span aria-hidden="true" className="shrink-0 rounded-full bg-[var(--accent-soft)] p-0.5 text-[var(--accent)]">
        <RotateCcw size={10} />
      </span>
    </Tooltip>
  )
}

function GapCapsule(props: Pick<NoteListHeaderProps, 'displayGap' | 'gapCapsuleRef' | 'peekUsed' | 'peekRange' | 'latestEdit'>) {
  const { displayGap } = props
  const label = displayGap
    ? displayGap.ahead
      ? t('notes.rolling_gap_ahead_value0', { value0: displayGap.days })
      : t('notes.rolling_gap_value0', { value0: displayGap.days })
    : ''
  const onClick = () => {
    if (props.peekUsed.current) {
      props.peekUsed.current = false
      return
    }
    const relative = useUi.getState().relativeFilter
    if (relative) {
      useUi.getState().setRelativeFilter({ ...relative, direction: 'edit' })
    } else {
      const latestKey = props.latestEdit?.key
      if (latestKey) useUi.getState().setDateFilter({ start: latestKey, end: latestKey })
    }
  }
  return (
    <Tooltip label={label}>
      <button
        type="button"
        ref={props.gapCapsuleRef}
        aria-label={label}
        onClick={onClick}
        className={cn(
          'shrink-0 rounded-full px-1.5 py-px text-[length:var(--text-9)] font-medium transition-colors select-none',
          props.peekRange
            ? 'bg-[var(--accent)] text-[var(--accent-contrast)] ring-1 ring-inset ring-[var(--accent)]'
            : 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)]',
        )}
      >
        {displayGap
          ? displayGap.ahead
            ? t('notes.rolling_gap_ahead_short_value0', { value0: displayGap.days })
            : t('notes.rolling_gap_short_value0', { value0: displayGap.days })
          : ''}
      </button>
    </Tooltip>
  )
}

function TagFilterChip({
  tagColors,
  selectedTags,
}: {
  tagColors: Map<string, string | null>
  selectedTags: string[]
}) {
  if (selectedTags.length === 0) return null
  return (
    <FilterChipFrame
      icon={<Hash size={11} className="shrink-0 text-[var(--text-quaternary)]" />}
      clearLabel={t('notes.clear_tag_filter')}
      onClear={() => useUi.getState().clearTagSelection()}
    >
      <span className="flex shrink-0 items-center">
        {selectedTags.slice(0, 5).map((tag) => (
          <span key={tag} aria-hidden="true" className="size-[7px] rounded-full ring-1 ring-[var(--border-subtle)] first:ml-0 -ml-0.5" style={{ backgroundColor: tagColors.get(tag) ?? 'var(--text-quaternary)' }} />
        ))}
      </span>
      <span className="truncate">{t('notes.tag_filter_value0', { value0: selectedTags.length })}</span>
    </FilterChipFrame>
  )
}

function QueryFilterChip({ filter, setListQuery }: { filter: string; setListQuery: (query: string) => void }) {
  if (!filter) return null
  return (
    <FilterChipFrame
      icon={<Search size={10} className="shrink-0 text-[var(--text-quaternary)]" />}
      clearLabel={t('notes.clear_search_query')}
      onClear={() => setListQuery('')}
    >
      <span className="max-w-36 truncate">{t('notes.search_query_value0', { value0: filter })}</span>
    </FilterChipFrame>
  )
}

function TagMatchToggle({
  selectedTags,
  selectedTagsMatch,
  setSelectedTagsMatch,
}: {
  selectedTags: string[]
  selectedTagsMatch: 'any' | 'all'
  setSelectedTagsMatch: (match: 'any' | 'all') => void
}) {
  if (selectedTags.length === 0) return null
  return (
    <div role="group" aria-label={t('notes.selected_tags_match')} className="flex shrink-0 overflow-hidden rounded-full border border-[var(--border-default)]">
      <button type="button" aria-pressed={selectedTagsMatch === 'any'} onClick={() => setSelectedTagsMatch('any')} className="px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
        {t('notes.tag_match_any')}
      </button>
      <button type="button" aria-pressed={selectedTagsMatch === 'all'} onClick={() => setSelectedTagsMatch('all')} className="border-l border-[var(--border-default)] px-1.5 py-0.5 transition-colors aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
        {t('notes.tag_match_all')}
      </button>
    </div>
  )
}

function RememberFilterRow({
  rememberFilters,
  setRememberFilters,
  clearAllFilters,
}: {
  rememberFilters: boolean
  setRememberFilters: Dispatch<SetStateAction<boolean>>
  clearAllFilters: () => void
}) {
  return (
    <>
      <button type="button" aria-pressed={rememberFilters} onClick={() => setRememberFilters((value) => !value)} className="ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-secondary)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]">
        {rememberFilters ? <Check size={11} /> : <Bookmark size={11} />}
        {t('notes.remember_filters')}
      </button>
      <Tooltip label={t('notes.clear_all_filters')}>
        <button type="button" aria-label={t('notes.clear_all_filters')} onClick={clearAllFilters} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--danger)]">
          <X size={11} />
          {t('notes.clear_all_filters')}
        </button>
      </Tooltip>
    </>
  )
}

function EmptyTrashButton({ notes, isEmptyingTrash, emptyTrash }: { notes: NoteSummary[]; isEmptyingTrash: boolean; emptyTrash: () => Promise<void> }) {
  if (notes.length === 0) return null
  return (
    <button
      type="button"
      disabled={isEmptyingTrash}
      aria-busy={isEmptyingTrash}
      onClick={() => void emptyTrash()}
      className="mt-2 w-full rounded-[var(--r-md)] border border-[var(--border-subtle)] py-1.5 text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:pointer-events-none disabled:opacity-50"
    >
      {t('notes.empty_trash')}
      {notes.length}
      {t('notes.notes_93aeb9')}
    </button>
  )
}

export function NoteListHeader(props: NoteListHeaderProps) {
  const {
    title, view, folderId, todoTagText, dateFilter, selectedTags, filter,
    selectedTagsMatch, setSelectedTagsMatch, rememberFilters, setRememberFilters, clearAllFilters, isEmptyingTrash, emptyTrash, notes,
  } = props
  const hasActiveFilters = Boolean(dateFilter || selectedTags.length > 0 || filter)
  return (
    <header className="shrink-0 px-3 pt-3 pb-2">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[length:var(--text-14\\.5)] font-semibold tracking-[-0.016em] text-[var(--text-primary)]">{title}</h2>
          <FolderSubtitle view={view} folderId={folderId} todoTagText={todoTagText} />
        </div>
        <ListHeaderActions view={view} breakpoint={props.breakpoint} toggleNavDrawer={props.toggleNavDrawer} sortButtonRef={props.sortButtonRef} setIsSortMenuOpen={props.setIsSortMenuOpen} favButtonRef={props.favButtonRef} setIsFavMenuOpen={props.setIsFavMenuOpen} />
      </div>

      <NoteSearchField filter={filter} setListQuery={props.setListQuery} listRef={props.listRef} filteredIds={props.filteredIds} openNote={props.openNote} />

      {hasActiveFilters && (
        <div role="group" aria-label={t('notes.active_filters')} className="mt-2 flex flex-wrap items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)] px-2 py-1.5">
          <DayFilterChip {...props} />
          <TagFilterChip tagColors={props.tagColors} selectedTags={selectedTags} />
          <QueryFilterChip filter={filter} setListQuery={props.setListQuery} />
          <TagMatchToggle selectedTags={selectedTags} selectedTagsMatch={selectedTagsMatch} setSelectedTagsMatch={setSelectedTagsMatch} />
          <RememberFilterRow rememberFilters={rememberFilters} setRememberFilters={setRememberFilters} clearAllFilters={clearAllFilters} />
        </div>
      )}

      {view === 'trash' && <EmptyTrashButton notes={notes} isEmptyingTrash={isEmptyingTrash} emptyTrash={emptyTrash} />}
    </header>
  )
}
