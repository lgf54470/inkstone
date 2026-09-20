import { memo, useState } from 'react'
import { Check, CheckSquare, ChevronDown, ChevronRight, Flag, Paperclip, Plus } from 'lucide-react'
import { t, useLocaleRepaint } from '../../../i18n'
import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import { kanbanPersonName } from '../person'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanDateBadge } from './kanban-date-badge'
import { KanbanIconBadge } from './kanban-icon-badge'
import { KanbanPersonAvatar } from './kanban-person-picker'
import { KanbanRenderTail, useKanbanRenderWindow } from './kanban-render-window'

interface KanbanListViewProps {
  data: KanbanData
  selectedIds: Set<string>
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
  onAddItem: () => void
}

interface KanbanListRowProps {
  item: KanbanItem
  statusCol?: KanbanProperty
  priorityCol?: KanbanProperty
  tagsCol?: KanbanProperty
  isSelected: boolean
  selectedTags?: string[]
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onToggleTag?: (tag: string) => void
}

function ListRowTagBadges({
  tagVals,
  tagsCol,
  selectedTags,
  onToggleTag,
}: {
  tagVals: string[]
  tagsCol?: KanbanProperty
  selectedTags?: string[]
  onToggleTag?: (tag: string) => void
}) {
  return (
    <>
      {tagVals.slice(0, 2).map((tag) => {
        const opt = tagsCol?.options?.find((o) => o.id === tag || o.label === tag)
        const color = resolveKanbanTagColor(tag, tagsCol?.options)
        const label = opt?.label ?? tag
        const isSelected = selectedTags?.includes(tag)
        return (
          <button
            key={tag}
            type='button'
            onClick={(e) => {
              e.stopPropagation()
              onToggleTag?.(tag)
            }}
            style={getKanbanTagStyle(color)}
            className={`hidden sm:inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-10)] font-semibold transition-all ${
              isSelected ? 'ring-2 ring-[var(--accent)] shadow-2xs font-bold' : ''
            }`}
          >
            {formatKanbanOptionLabel(label, 'tags')}
          </button>
        )
      })}
    </>
  )
}

function ListRowLeading({
  item,
  isSelected,
  tagVals,
  tagsCol,
  desc,
  expanded,
  selectedTags,
  onToggleExpand,
  onToggleSelect,
  onToggleTag,
  onOpen,
}: {
  item: KanbanItem
  isSelected: boolean
  tagVals: string[]
  tagsCol?: KanbanProperty
  desc?: string
  expanded?: boolean
  selectedTags?: string[]
  onToggleExpand?: () => void
  onToggleSelect: () => void
  onToggleTag?: (tag: string) => void
  onOpen: () => void
}) {
  const hasSubtasks = (item.subtasks?.length ?? 0) > 0

  return (
    <div className='flex min-w-0 flex-1 items-center gap-2'>
      {hasSubtasks && (
        <button
          type='button'
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand?.()
          }}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'preview.kanban_collapse_subtasks' : 'preview.kanban_expand_subtasks')}
          className='text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
      <input
        type='checkbox'
        checked={isSelected}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggleSelect}
        className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
        aria-label={t('preview.kanban_select_card')}
      />
      <KanbanIconBadge icon={item.icon} size={15} />
      <button
        type='button'
        onClick={(e) => { e.stopPropagation(); onOpen() }}
        className='truncate text-left cursor-pointer text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'
      >
        {item.title || t('preview.kanban_untitled')}
      </button>
      <ListRowTagBadges
        tagVals={tagVals}
        tagsCol={tagsCol}
        selectedTags={selectedTags}
        onToggleTag={onToggleTag}
      />
      {desc && (
        <span className='hidden md:inline truncate max-w-xs text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          — {desc}
        </span>
      )}
    </div>
  )
}

function ListRowSubtasksAndDate({
  item,
  subtasks,
}: {
  item: KanbanItem
  subtasks: KanbanSubtask[]
}) {
  const completedCount = subtasks.filter((s) => s.completed).length

  return (
    <>
      {subtasks.length > 0 && (
        <span className='hidden sm:inline-flex items-center gap-1 rounded-[var(--r-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[var(--text-tertiary)]'>
          <CheckSquare size={11} />
          <span>{completedCount}/{subtasks.length}</span>
        </span>
      )}
      <KanbanDateBadge item={item} variant='plain' className='hidden sm:inline-flex' />
    </>
  )
}

function ListRowTrailing({
  item,
  statusOpt,
  priorityOpt,
}: {
  item: KanbanItem
  statusOpt?: KanbanOption
  priorityOpt?: KanbanOption
}) {
  const subtasks = item.subtasks ?? []
  const filesCount = item.files?.length ?? 0
  const assignee = kanbanPersonName(item.properties.assignee)

  return (
    <div className='flex shrink-0 items-center gap-2 text-[length:var(--text-11)]'>
      <ListRowSubtasksAndDate item={item} subtasks={subtasks} />
      {statusOpt && (
        <span
          style={getKanbanTagStyle(statusOpt.color)}
          className='inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5 font-medium'
        >
          {formatKanbanOptionLabel(statusOpt, 'status')}
        </span>
      )}
      {priorityOpt && (
        <span
          style={getKanbanTagStyle(priorityOpt.color)}
          className='hidden sm:inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-0.5 font-medium'
        >
          <Flag size={11} />
          <span>{formatKanbanOptionLabel(priorityOpt, 'priority')}</span>
        </span>
      )}
      {filesCount > 0 && (
        <span className='hidden sm:inline-flex items-center gap-0.5 text-[var(--text-tertiary)]'>
          <Paperclip size={11} />
          <span>{filesCount}</span>
        </span>
      )}
      {assignee && <KanbanPersonAvatar name={assignee} />}
    </div>
  )
}

function ListSubtasksExpanded({ subtasks }: { subtasks: KanbanSubtask[] }) {
  return (
    <div className='flex flex-col gap-1 border-t border-[var(--border-subtle)] bg-[var(--bg-inset)]/50 py-2 pl-12 pr-4'>
      {subtasks.map((st) => (
        <div key={st.id} className='flex items-center gap-2 text-[length:var(--text-12)]'>
          <span
            className={`flex size-3.5 shrink-0 items-center justify-center rounded-[var(--r-xs)] border ${
              st.completed ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-[var(--border-default)]'
            }`}
          >
            {st.completed && <Check size={10} />}
          </span>
          {st.icon && <KanbanIconBadge icon={st.icon} size={13} />}
          <span className={`truncate ${st.completed ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-primary)]'}`}>
            {st.title}
          </span>
          {st.description && (
            <span className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
              — {st.description}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function getListItemDisplay(item: KanbanItem, statusCol?: KanbanProperty, priorityCol?: KanbanProperty) {
  const statusVal = item.properties.status
  const statusOpt = statusCol?.options?.find((o: KanbanOption) => o.id === statusVal || o.label === statusVal)
  const priorityVal = item.properties.priority
  const priorityOpt = priorityCol?.options?.find((o: KanbanOption) => o.id === priorityVal || o.label === priorityVal)
  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const desc = item.content || item.description || (typeof item.properties.description === 'string' ? item.properties.description : undefined)
  return { statusOpt, priorityOpt, tagVals, desc }
}

function KanbanListRow({
  item,
  statusCol,
  priorityCol,
  tagsCol,
  isSelected,
  selectedTags,
  onToggleSelect,
  onOpenDetail,
  onToggleTag,
}: KanbanListRowProps) {
  const [expanded, setExpanded] = useState(false)
  const { statusOpt, priorityOpt, tagVals, desc } = getListItemDisplay(item, statusCol, priorityCol)
  const subtasks = item.subtasks ?? []

  return (
    <div data-item-id={item.id} className='flex flex-col border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] last:border-b-0'>
      <div
        onClick={() => onOpenDetail(item)}
        className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)] ${
          isSelected ? 'bg-[var(--accent-softer)]' : ''
        }`}
      >
        <ListRowLeading
          item={item}
          isSelected={isSelected}
          tagVals={tagVals}
          tagsCol={tagsCol}
          desc={desc}
          expanded={expanded}
          selectedTags={selectedTags}
          onToggleExpand={() => setExpanded((x) => !x)}
          onToggleSelect={() => onToggleSelect(item.id)}
          onToggleTag={onToggleTag}
          onOpen={() => onOpenDetail(item)}
        />
        <ListRowTrailing
          item={item}
          statusOpt={statusOpt}
          priorityOpt={priorityOpt}
        />
      </div>

      {expanded && subtasks.length > 0 && <ListSubtasksExpanded subtasks={subtasks} />}
    </div>
  )
}

export const KanbanListView = memo(function KanbanListView({
  data,
  selectedIds,
  selectedTags,
  onToggleSelect,
  onOpenDetail,
  onToggleTag,
  onAddItem,
}: KanbanListViewProps) {
  useLocaleRepaint()
  const { visible, hiddenCount, setTailElement, revealMore } = useKanbanRenderWindow(data.items)
  const statusCol = data.columns.find((c) => c.id === 'status')
  const priorityCol = data.columns.find((c) => c.id === 'priority')
  const tagsCol = data.columns.find((c) => c.id === 'tags')

  return (
    <div className='flex h-full w-full flex-col overflow-y-auto p-4'>
      <div className='divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
        {visible.map((item) => (
          <KanbanListRow
            key={item.id}
            item={item}
            statusCol={statusCol}
            priorityCol={priorityCol}
            tagsCol={tagsCol}
            isSelected={selectedIds.has(item.id)}
            selectedTags={selectedTags}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
            onToggleTag={onToggleTag}
          />
        ))}

        <KanbanRenderTail hiddenCount={hiddenCount} setTailElement={setTailElement} onReveal={revealMore} />

        <div className='p-2'>
          <button
            type='button'
            onClick={onAddItem}
            className='flex items-center gap-1.5 rounded-[var(--r-md)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          >
            <Plus size={13} />
            <span>{t('preview.kanban_new_item')}</span>
          </button>
        </div>
      </div>
    </div>
  )
})
