import { memo, useRef } from 'react'
import { Columns3, Settings2, Sliders } from 'lucide-react'
import { useClickOutside } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanProperty } from '../types'
import { kanbanPropertyColumns } from './kanban-property-cell'

export type CardSize = 'small' | 'medium' | 'large'

interface KanbanViewOptionsProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  columns: KanbanProperty[]
  groupBy?: string
  cardSize?: CardSize
  hiddenColumns?: string[]
  onChangeGroupBy?: (propId: string) => void
  onChangeCardSize?: (size: CardSize) => void
  onToggleHiddenColumn?: (propertyId: string) => void
}

const CARD_SIZES: { id: CardSize; labelKey: 'preview.kanban_card_size_small' | 'preview.kanban_card_size_medium' | 'preview.kanban_card_size_large' }[] = [
  { id: 'small', labelKey: 'preview.kanban_card_size_small' },
  { id: 'medium', labelKey: 'preview.kanban_card_size_medium' },
  { id: 'large', labelKey: 'preview.kanban_card_size_large' },
]

function GroupBySection({
  groupBy,
  columns,
  onChangeGroupBy,
}: {
  groupBy: string
  columns: KanbanProperty[]
  onChangeGroupBy: (propId: string) => void
}) {
  const eligibleColumns = columns.filter((c) => c.id !== 'title')
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Sliders size={13} />
        <span>{t('preview.kanban_group_by')}</span>
      </div>
      <select
        value={groupBy}
        onChange={(e) => onChangeGroupBy(e.target.value)}
        className='h-8 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      >
        {eligibleColumns.map((col) => (
          <option key={col.id} value={col.id}>
            {formatKanbanPropertyName(col)}
          </option>
        ))}
      </select>
    </div>
  )
}

function CardSizeSection({
  cardSize,
  onChangeCardSize,
}: {
  cardSize: CardSize
  onChangeCardSize: (size: CardSize) => void
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <div className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Settings2 size={13} />
        <span>{t('preview.kanban_card_size')}</span>
      </div>
      <div className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] p-0.5 bg-[var(--bg-raised)]'>
        {CARD_SIZES.map(({ id, labelKey }) => (
          <button
            key={id}
            type='button'
            onClick={() => onChangeCardSize(id)}
            className={`flex-1 rounded-[var(--r-sm)] py-1 text-center text-[length:var(--text-11)] font-medium transition-colors ${
              cardSize === id
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] font-semibold shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

function ColumnsSection({
  columns,
  hiddenColumns,
  onToggleHiddenColumn,
}: {
  columns: KanbanProperty[]
  hiddenColumns: string[]
  onToggleHiddenColumn: (propertyId: string) => void
}) {
  return (
    <fieldset className='flex min-w-0 flex-col gap-1.5'>
      <legend className='flex items-center gap-1.5 text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        <Columns3 size={13} />
        {t('preview.kanban_columns')}
      </legend>
      <div className='flex max-h-56 flex-col gap-0.5 overflow-auto'>
        {kanbanPropertyColumns(columns).map((column) => (
          <label
            key={column.id}
            className='flex cursor-pointer items-center gap-2 rounded-[var(--r-sm)] px-1 py-1 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          >
            <input
              type='checkbox'
              checked={!hiddenColumns.includes(column.id)}
              onChange={() => onToggleHiddenColumn(column.id)}
              className='size-3.5 shrink-0 rounded-[var(--r-xs)] border-[var(--border-default)] accent-[var(--accent)]'
            />
            <span>{formatKanbanPropertyName(column)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export const KanbanViewOptions = memo(function KanbanViewOptions({
  open,
  onClose,
  anchorRef,
  columns,
  groupBy,
  cardSize,
  hiddenColumns,
  onChangeGroupBy,
  onChangeCardSize,
  onToggleHiddenColumn,
}: KanbanViewOptionsProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)

  if (!open) return null

  // Each section renders when the caller wired it: the board gets grouping and
  // card size, the table gets column visibility, neither sees the other's controls.
  return (
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t(onToggleHiddenColumn ? 'preview.kanban_columns' : 'preview.kanban_group_by')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1 flex w-60 flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-pop)]'
    >
      {onChangeGroupBy && groupBy !== undefined && (
        <GroupBySection groupBy={groupBy} columns={columns} onChangeGroupBy={onChangeGroupBy} />
      )}
      {onChangeCardSize && cardSize !== undefined && (
        <CardSizeSection cardSize={cardSize} onChangeCardSize={onChangeCardSize} />
      )}
      {onToggleHiddenColumn && (
        <ColumnsSection
          columns={columns}
          hiddenColumns={hiddenColumns ?? []}
          onToggleHiddenColumn={onToggleHiddenColumn}
        />
      )}
    </div>
  )
})
