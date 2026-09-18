import { memo } from 'react'
import { Calendar, Flag, Paperclip, Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle, resolveKanbanTagColor } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty, KanbanSubtask } from '../types'
import { KanbanCardSubtasks } from './kanban-card-subtasks'
import { KanbanIconBadge } from './kanban-icon-badge'

interface KanbanGalleryViewProps {
  data: KanbanData
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
}

interface GalleryCardProps {
  item: KanbanItem
  statusCol?: KanbanProperty
  priorityCol?: KanbanProperty
  tagsCol?: KanbanProperty
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onUpdateSubtasks?: (itemId: string, nextSubtasks: KanbanSubtask[]) => void
}

function GalleryCover({ item }: { item: KanbanItem }) {
  const imageFile = item.files?.find(
    (f) => f.mime?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name),
  )
  const coverUrl = item.cover || imageFile?.url

  if (coverUrl) {
    return (
      <div className='h-32 w-full overflow-hidden bg-[var(--bg-inset)]'>
        <img
          src={coverUrl}
          alt={item.title}
          className='h-full w-full object-cover transition-transform duration-300 hover:scale-105'
        />
      </div>
    )
  }

  return (
    <div className='h-2.5 w-full bg-gradient-to-r from-[var(--accent-soft)] via-[var(--bg-raised)] to-[var(--bg-inset)]' />
  )
}

function GalleryTagsHeader({
  isSelected,
  tagVals,
  tagsCol,
  onToggleSelect,
}: {
  isSelected: boolean
  tagVals: string[]
  tagsCol?: KanbanProperty
  onToggleSelect: () => void
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1.5 ${
        tagVals.length === 0 ? 'absolute left-3 top-3' : ''
      }`}
    >
      <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <input
          type='checkbox'
          checked={isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelect}
          className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)] opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 checked:opacity-100'
          aria-label={t('preview.kanban_select_card')}
        />
        {tagVals.slice(0, 3).map((tag) => {
          const opt = tagsCol?.options?.find((o) => o.id === tag || o.label === tag)
          const color = resolveKanbanTagColor(tag, tagsCol?.options)
          const label = opt?.label ?? tag
          return (
            <span
              key={tag}
              style={getKanbanTagStyle(color)}
              className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-semibold'
            >
              {formatKanbanOptionLabel(label, 'tags')}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function GalleryFooterMeta({
  statusOpt,
  priorityOpt,
  dueDate,
  filesCount,
  assignee,
}: {
  statusOpt?: KanbanOption
  priorityOpt?: KanbanOption
  dueDate?: string
  filesCount: number
  assignee?: string
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-1.5 border-t border-[var(--border-subtle)] pt-2 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      <div className='flex flex-wrap items-center gap-1.5'>
        {statusOpt && (
          <span
            style={getKanbanTagStyle(statusOpt.color)}
            className='inline-flex items-center rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            {formatKanbanOptionLabel(statusOpt, 'status')}
          </span>
        )}
        {priorityOpt && (
          <span
            style={getKanbanTagStyle(priorityOpt.color)}
            className='inline-flex items-center gap-1 rounded-[var(--r-xs)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
          >
            <Flag size={11} />
            <span>{formatKanbanOptionLabel(priorityOpt, 'priority')}</span>
          </span>
        )}
        {dueDate && (
          <span className='inline-flex items-center gap-1 rounded-[var(--r-xs)] bg-[var(--bg-inset)] px-1.5 py-0.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
            <Calendar size={11} className='text-[var(--text-tertiary)]' />
            <span>{dueDate}</span>
          </span>
        )}
        {filesCount > 0 && (
          <span className='inline-flex items-center gap-0.5 text-[var(--text-tertiary)]'>
            <Paperclip size={11} />
            <span>{filesCount}</span>
          </span>
        )}
      </div>
      {assignee && (
        <div
          title={assignee}
          className='flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[length:var(--text-10)] font-bold text-[var(--accent)]'
        >
          {assignee.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  )
}

function GalleryCardTitleDesc({
  title,
  icon,
  desc,
}: {
  title: string
  icon?: string
  desc?: string
}) {
  return (
    <div className='min-w-0 flex-1'>
      <h4 className='flex items-start gap-1.5 text-[length:var(--text-14)] font-semibold text-[var(--text-primary)] leading-snug'>
        {icon && (
          <span className='mt-0.5 shrink-0'>
            <KanbanIconBadge icon={icon} size={15} />
          </span>
        )}
        <span className='line-clamp-2'>{title || t('preview.kanban_untitled')}</span>
      </h4>
      {desc && (
        <p className='mt-1 line-clamp-2 text-[length:var(--text-12)] text-[var(--text-tertiary)] leading-normal'>
          {desc}
        </p>
      )}
    </div>
  )
}

function GalleryCard({
  item,
  statusCol,
  priorityCol,
  tagsCol,
  isSelected,
  onToggleSelect,
  onOpenDetail,
  onUpdateSubtasks,
}: GalleryCardProps) {
  const statusVal = item.properties.status
  const statusOpt = statusCol?.options?.find((o) => o.id === statusVal || o.label === statusVal)
  const priorityVal = item.properties.priority
  const priorityOpt = priorityCol?.options?.find((o) => o.id === priorityVal || o.label === priorityVal)
  const tagVals = Array.isArray(item.properties.tags) ? (item.properties.tags as string[]) : []
  const desc = item.content || item.description || (typeof item.properties.description === 'string' ? item.properties.description : undefined)
  const dueDate = String(item.properties.dueDate || item.properties.startDate || '')
  const assignee = String(item.properties.assignee || '')
  const filesCount = item.files?.length ?? 0

  return (
    <div
      role='button'
      tabIndex={0}
      data-item-id={item.id}
      onClick={() => onOpenDetail(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenDetail(item)
      }}
      className={`group/card relative flex cursor-pointer flex-col overflow-hidden rounded-[var(--r-lg)] border bg-[var(--bg-surface)] text-left shadow-[var(--shadow-xs)] transition-[box-shadow,border-color] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <GalleryCover item={item} />
      <div className='flex flex-1 flex-col gap-2 p-3'>
        <GalleryTagsHeader
          isSelected={isSelected}
          tagVals={tagVals}
          tagsCol={tagsCol}
          onToggleSelect={() => onToggleSelect(item.id)}
        />
        <GalleryCardTitleDesc title={item.title} icon={item.icon} desc={desc} />
        <KanbanCardSubtasks
          itemId={item.id}
          subtasks={item.subtasks || []}
          onUpdateSubtasks={onUpdateSubtasks}
        />
        <GalleryFooterMeta
          statusOpt={statusOpt}
          priorityOpt={priorityOpt}
          dueDate={dueDate || undefined}
          filesCount={filesCount}
          assignee={assignee || undefined}
        />
      </div>
    </div>
  )
}

export const KanbanGalleryView = memo(function KanbanGalleryView({
  data,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onAddItem,
  onUpdateSubtasks,
}: KanbanGalleryViewProps) {
  const statusCol = data.columns.find((c) => c.id === 'status')
  const priorityCol = data.columns.find((c) => c.id === 'priority')
  const tagsCol = data.columns.find((c) => c.id === 'tags')

  return (
    <div className='h-full w-full overflow-y-auto p-4' role='region' aria-label={t('preview.kanban_view_gallery')}>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
        {data.items.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            statusCol={statusCol}
            priorityCol={priorityCol}
            tagsCol={tagsCol}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
            onUpdateSubtasks={onUpdateSubtasks}
          />
        ))}

        <button
          type='button'
          onClick={onAddItem}
          className='flex min-h-44 flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-4 text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Plus size={20} />
          <span className='text-[length:var(--text-13)] font-medium'>{t('preview.kanban_new_card')}</span>
        </button>
      </div>
    </div>
  )
})
