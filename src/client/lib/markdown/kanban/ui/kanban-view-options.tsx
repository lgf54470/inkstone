import { memo, useRef } from 'react'
import { Settings2, Sliders } from 'lucide-react'
import { useClickOutside } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { formatKanbanPropertyName } from '../i18n-helpers'
import type { KanbanProperty } from '../types'

export type CardSize = 'small' | 'medium' | 'large'

interface KanbanViewOptionsProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  columns: KanbanProperty[]
  groupBy: string
  cardSize: CardSize
  onChangeGroupBy: (propId: string) => void
  onChangeCardSize: (size: CardSize) => void
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

export const KanbanViewOptions = memo(function KanbanViewOptions({
  open,
  onClose,
  anchorRef,
  columns,
  groupBy,
  cardSize,
  onChangeGroupBy,
  onChangeCardSize,
}: KanbanViewOptionsProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)

  if (!open) return null

  return (
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_group_by')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1 flex w-60 flex-col gap-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 shadow-[var(--shadow-pop)]'
    >
      <GroupBySection groupBy={groupBy} columns={columns} onChangeGroupBy={onChangeGroupBy} />
      <CardSizeSection cardSize={cardSize} onChangeCardSize={onChangeCardSize} />
    </div>
  )
})
