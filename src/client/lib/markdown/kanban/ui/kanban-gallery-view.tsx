import { memo } from 'react'
import { Plus } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanTagStyle } from '../colors'
import { formatKanbanOptionLabel } from '../i18n-helpers'
import type { KanbanData, KanbanItem, KanbanOption, KanbanProperty } from '../types'

interface KanbanGalleryViewProps {
  data: KanbanData
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
  onAddItem: () => void
}

interface GalleryCardProps {
  item: KanbanItem
  statusCol?: KanbanProperty
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onOpenDetail: (item: KanbanItem) => void
}

function GalleryCard({ item, statusCol, isSelected, onToggleSelect, onOpenDetail }: GalleryCardProps) {
  const statusVal = item.properties.status
  const statusOpt = statusCol?.options?.find((o: KanbanOption) => o.id === statusVal || o.label === statusVal)

  return (
    <div
      onClick={() => onOpenDetail(item)}
      className={`group/card flex cursor-pointer flex-col overflow-hidden rounded-[var(--r-lg)] border bg-[var(--bg-surface)] shadow-[var(--shadow-xs)] transition-[box-shadow,border-color] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] ${
        isSelected ? 'border-[var(--accent)] ring-2 ring-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'
      }`}
    >
      <div className='flex h-28 items-center justify-center bg-[var(--bg-raised)] text-3xl'>
        {item.cover ? (
          <img src={item.cover} alt={item.title} className='h-full w-full object-cover' />
        ) : (
          <span>{item.icon || '📝'}</span>
        )}
      </div>

      <div className='flex flex-col gap-2 p-3'>
        <div className='flex items-center justify-between gap-1'>
          <span className='truncate text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {item.title}
          </span>
          <input
            type='checkbox'
            checked={isSelected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect(item.id)}
            className='size-3.5 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)] opacity-0 group-hover/card:opacity-100 checked:opacity-100'
            aria-label={t('preview.kanban_select_card')}
          />
        </div>

        {statusOpt && (
          <div>
            <span
              style={getKanbanTagStyle(statusOpt.color)}
              className='inline-flex items-center rounded-[var(--r-xs)] px-2 py-0.5 text-[length:var(--text-11)] font-medium'
            >
              {formatKanbanOptionLabel(statusOpt, 'status')}
            </span>
          </div>
        )}
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
}: KanbanGalleryViewProps) {
  const statusCol = data.columns.find((c) => c.id === 'status')

  return (
    <div className='h-full w-full overflow-y-auto p-4' role='region' aria-label={t('preview.kanban_view_gallery')}>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
        {data.items.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            statusCol={statusCol}
            isSelected={selectedIds.has(item.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetail={onOpenDetail}
          />
        ))}

        <button
          type='button'
          onClick={onAddItem}
          className='flex h-44 flex-col items-center justify-center gap-2 rounded-[var(--r-lg)] border border-dashed border-[var(--border-default)] p-4 text-[var(--text-tertiary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Plus size={20} />
          <span className='text-[length:var(--text-13)] font-medium'>{t('preview.kanban_new_card')}</span>
        </button>
      </div>
    </div>
  )
})
