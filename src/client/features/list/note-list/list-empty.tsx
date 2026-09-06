import type { ReactNode } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { prettyCombo } from '../../../lib/hotkeys'
import { Empty } from '../../../components/feedback'
import { daysBetweenKeys } from '../../../lib/time'
import { useUi } from '../../../store/ui'
import { useSession } from '../../../store/session'
import { createContextualNote } from '../../../store/notes/selectors'
import { useNotes } from '../../../store/notes'
import {
  CALENDAR_TREE,
  calendarPeriodLabel,
  calendarPeriodsForDate,
  filterTodoNotes,
  isTodoFolderId,
  isVirtualFolderId,
  parseVirtualId,
  resolveTodoTag,
  TODO_TREE,
  type CalendarNode,
  type VirtualTreeNamespace,
  virtualAncestorIds,
  virtualId,
  virtualNearestNeighbors,
  virtualPeriodKeyRange,
} from '../../../lib/calendar-tree'
import { t, useLocale } from '../../../lib/i18n'


interface ListEmptyProps {
  view: string
  folderId: string | null
  filtering: boolean
  dayFiltering: boolean
  tagFiltering: boolean
  latestEdit: { key: string; label: string } | null
  onJumpToLatest: () => void
  weekFiltered: boolean
  onJumpToLatestWeek: () => void
}

function EmptyActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-[var(--r-md)] border border-[var(--border-default)] px-3 text-[length:var(--text-12\\.5)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {icon}
      {label}
    </button>
  )
}

function SearchEmpty({ shortcut }: { shortcut: (combo: string) => string }) {
  return (
    <Empty
      art="search"
      title={t('notes.no_matching_notes')}
      description={t('notes.try_another_search_or_press_shortcut_to_search_everywhere', {
        shortcut: shortcut('mod+k'),
      })}
    />
  )
}

function DayRangeEmpty({
  weekFiltered,
  latestEdit,
  onJumpToLatestWeek,
  onJumpToLatest,
}: {
  weekFiltered: boolean
  latestEdit: { key: string; label: string } | null
  onJumpToLatestWeek: () => void
  onJumpToLatest: () => void
}) {
  const action = latestEdit && (
    <div className="flex flex-col items-center gap-2">
      {weekFiltered && (
        <EmptyActionButton
          icon={<CalendarDays size={13} />}
          label={t('notes.view_latest_week')}
          onClick={onJumpToLatestWeek}
        />
      )}
      <EmptyActionButton
        icon={<CalendarDays size={13} />}
        label={t('notes.view_latest_activity_value0', { value0: latestEdit.label })}
        onClick={onJumpToLatest}
      />
    </div>
  )
  return (
    <Empty
      art="search"
      title={weekFiltered ? t('notes.no_notes_in_this_week') : t('notes.no_notes_on_this_day')}
      description={latestEdit ? t('notes.no_notes_in_range_value0', { value0: latestEdit.label }) : t('notes.no_notes_on_this_day_desc')}
      action={action}
    />
  )
}

function TagEmpty() {
  return (
    <Empty
      art="tag"
      title={t('notes.no_notes_match_selected_tags')}
      description={t('notes.adjust_selected_tags_or_switch_match_mode')}
    />
  )
}

function PeriodNeighborButton({ label, count, leading, onClick }: { label: string; count: number; leading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-7 items-center gap-1 rounded-[var(--r-md)] border border-[var(--border-default)] px-2.5 text-[length:var(--text-11\\.5)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {leading && <ChevronLeft size={12} />}
      {label} · {t('common.value0_notes', { value0: count })}
      {!leading && <ChevronRight size={12} />}
    </button>
  )
}

function PeriodActions({
  nearest,
  prev,
  next,
  targetId,
  targetLabelKey,
  labelOf,
  openCalendarId,
}: {
  nearest: CalendarNode | null
  prev: CalendarNode | null
  next: CalendarNode | null
  targetId: string
  targetLabelKey: 'notes.view_this_week' | 'notes.view_this_month'
  labelOf: (node: CalendarNode) => string
  openCalendarId: (id: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      {nearest && (
        <EmptyActionButton
          icon={<CalendarDays size={13} />}
          label={t('notes.jump_to_nearest_period')}
          onClick={() => openCalendarId(nearest.id)}
        />
      )}
      <EmptyActionButton icon={<CalendarDays size={13} />} label={t(targetLabelKey)} onClick={() => openCalendarId(targetId)} />
      <EmptyActionButton icon={<Plus size={13} />} label={t('common.new_note')} onClick={() => void createContextualNote()} />
      {(prev || next) && (
        <div className="flex items-center gap-1.5">
          {prev && <PeriodNeighborButton label={labelOf(prev)} count={prev.count} leading onClick={() => openCalendarId(prev.id)} />}
          {next && <PeriodNeighborButton label={labelOf(next)} count={next.count} leading={false} onClick={() => openCalendarId(next.id)} />}
        </div>
      )}
    </div>
  )
}

function closestNeighbor(prev: CalendarNode | null, next: CalendarNode | null, targetStart: string | undefined, ns: VirtualTreeNamespace): CalendarNode | null {
  if (!prev || !next || !targetStart) return prev ?? next
  const prevStart = virtualPeriodKeyRange(prev.id, ns)?.start
  const nextStart = virtualPeriodKeyRange(next.id, ns)?.start
  if (!prevStart || !nextStart) return prev
  return Math.abs(daysBetweenKeys(targetStart, prevStart)) <= Math.abs(daysBetweenKeys(targetStart, nextStart)) ? prev : next
}

function PeriodEmpty({ folderId }: { folderId: string | null }) {
  const isTodo = isTodoFolderId(folderId)
  const ns = isTodo ? TODO_TREE : CALENDAR_TREE
  const period = isVirtualFolderId(folderId) ? parseVirtualId(folderId, ns) : null
  if (!period) return null
  const openView = useUi((s) => s.openView)
  const todoTagText = resolveTodoTag(useSession((s) => s.settings.notes?.todoTag), useLocale())
  const notes = useNotes((s) => s.notes)
  const periodNotes = isTodo ? filterTodoNotes(Object.values(notes ?? {}), todoTagText) : Object.values(notes ?? {})
  const label = calendarPeriodLabel(period)
  const range = virtualPeriodKeyRange(virtualId(period, ns), ns)
  const at = calendarPeriodsForDate(new Date())
  const target = period.kind === 'week' ? at.week : at.month
  const { prev, next } = virtualNearestNeighbors(period, periodNotes, ns)
  const nearest = closestNeighbor(prev, next, range?.start, ns)
  const openCalendarId = (id: string) => {
    const ancestors = virtualAncestorIds(id, ns)
    if (ancestors.length) {
      useUi.setState((state) => ({ expandedFolders: [...new Set([...state.expandedFolders, ...ancestors])] }))
    }
    openView('folder', { folderId: id })
  }
  const labelOf = (node: CalendarNode) => {
    const parsed = parseVirtualId(node.id, ns)
    return (parsed ? calendarPeriodLabel(parsed) : null) ?? node.name
  }
  return (
    <Empty
      art="folder"
      title={t('notes.no_notes_in_this_period')}
      description={range && label ? `${label} · ${t('notes.calendar_period_range_value0', { value0: `${range.start} ~ ${range.end}` })}` : undefined}
      action={
        <PeriodActions nearest={nearest} prev={prev} next={next} targetId={virtualId(target, ns)} targetLabelKey={period.kind === 'week' ? 'notes.view_this_week' : 'notes.view_this_month'} labelOf={labelOf} openCalendarId={openCalendarId} />
      }
    />
  )
}

function StaticEmpty({ view, shortcut }: { view: string; shortcut: (combo: string) => string }) {
  const config: Record<string, { art: 'notes' | 'starred' | 'trash' | 'archive' | 'folder' | 'tag'; title: string; desc: string }> = {
    all: { art: 'notes', title: t('notes.no_notes_yet'), desc: t('notes.press_shortcut_or_the_plus_button_to_write_your_first_note', { shortcut: shortcut('mod+n') }) },
    recent: { art: 'notes', title: t('notes.nothing_has_been_edited_recently'), desc: t('notes.write_something_and_it_will_appear_here') },
    starred: { art: 'starred', title: t('notes.no_favorites_yet'), desc: t('notes.right_click_a_note_or_press_shortcut_to_favorite_it', { shortcut: shortcut('mod+d') }) },
    pinned: { art: 'notes', title: t('notes.no_pinned_notes'), desc: t('notes.no_pinned_notes_desc') },
    shared: { art: 'notes', title: t('notes.no_shared_notes'), desc: t('notes.no_shared_notes_desc') },
    unfiled: { art: 'folder', title: t('notes.every_note_is_filed'), desc: t('notes.everything_is_neatly_organized') },
    archived: { art: 'archive', title: t('notes.archive_is_empty'), desc: t('notes.keep_notes_here_when_you_want_them_out_of_the_way_but_not_deleted') },
    trash: { art: 'trash', title: t('notes.trash_is_empty'), desc: t('notes.deleted_notes_remain_until_you_restore_or_clear_them') },
    folder: { art: 'folder', title: t('notes.this_folder_is_still_empty'), desc: t('notes.drag_notes_in_or_create_new_ones_here') },
    tag: { art: 'tag', title: t('notes.there_are_no_notes_with_this_tag'), desc: t('notes.write_tags_in_the_note_to_link_them_automatically') },
    untagged: { art: 'tag', title: t('tags.no_untagged_notes'), desc: t('tags.no_untagged_notes_desc') },
  }
  const item = config[view] ?? config.all!
  const canCreate = view !== 'trash' && view !== 'archived'
  return (
    <Empty
      art={item.art}
      title={item.title}
      description={item.desc}
      action={
        canCreate ? <EmptyActionButton icon={<Plus size={13} />} label={t('common.new_note')} onClick={() => void createContextualNote()} /> : undefined
      }
    />
  )
}

export function ListEmpty({ view, folderId, filtering, dayFiltering, tagFiltering, latestEdit, onJumpToLatest, weekFiltered, onJumpToLatestWeek }: ListEmptyProps) {
  const shortcut = (combo: string) => prettyCombo(combo).join('+')
  if (filtering) {
    return <SearchEmpty shortcut={shortcut} />
  }
  if (dayFiltering) {
    return (
      <DayRangeEmpty
        weekFiltered={weekFiltered}
        latestEdit={latestEdit}
        onJumpToLatestWeek={onJumpToLatestWeek}
        onJumpToLatest={onJumpToLatest}
      />
    )
  }
  if (tagFiltering) {
    return <TagEmpty />
  }
  const ns = isTodoFolderId(folderId) ? TODO_TREE : CALENDAR_TREE
  if (isVirtualFolderId(folderId) && parseVirtualId(folderId, ns)) {
    return <PeriodEmpty folderId={folderId} />
  }
  return <StaticEmpty view={view} shortcut={shortcut} />
}
