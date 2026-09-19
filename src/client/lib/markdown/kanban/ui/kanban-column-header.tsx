import { useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import type { groupKanbanItems } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanColorName } from '../types'
import { KanbanColumnMenu } from './kanban-column-menu'

export function ColumnHeaderTitle({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color?: KanbanColorName
}) {
  const dotColor = getKanbanDotColor(color)
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='size-2.5 shrink-0 rounded-full' style={{ backgroundColor: dotColor }} />
      <span className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {label}
      </span>
      <span className='shrink-0 rounded-full bg-[var(--bg-inset)] px-2 py-0.5 text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {count}
      </span>
    </div>
  )
}

export function KanbanColumnHeader({
  groupKey,
  label,
  count,
  color,
  onDragStart,
  onRename,
  onChangeColor,
  onCollapse,
  onDelete,
}: {
  groupKey: string
  label: string
  count: number
  color?: KanbanColorName
  onDragStart: (e: React.DragEvent) => void
  onRename: (newLabel: string) => void
  onChangeColor: (newColor: KanbanColorName) => void
  onCollapse: () => void
  onDelete?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const localizedLabel = formatKanbanGroupLabel(groupKey, label)

  return (
    <div
      draggable={groupKey !== '__none__'}
      onDragStart={onDragStart}
      className='relative flex cursor-grab items-center justify-between px-2 py-1.5 active:cursor-grabbing'
    >
      <ColumnHeaderTitle label={localizedLabel} count={count} color={color} />
      <button
        ref={menuBtnRef}
        type='button'
        onClick={() => setMenuOpen((o) => !o)}
        className='rounded-[var(--r-xs)] p-0.5 text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        aria-label={localizedLabel}
        aria-haspopup='dialog'
        aria-expanded={menuOpen}
        {...(menuOpen ? { 'aria-controls': panelId } : {})}
      >
        <MoreHorizontal size={14} />
      </button>
      <KanbanColumnMenu
        open={menuOpen}
        panelId={panelId}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuBtnRef}
        groupKey={groupKey}
        label={label}
        color={color}
        onRename={onRename}
        onChangeColor={onChangeColor}
        onCollapse={onCollapse}
        onDelete={onDelete}
      />
    </div>
  )
}

export function CollapsedColumn({
  group,
  onExpand,
  onDrop,
  onDragOver,
  isDragOver,
}: {
  group: ReturnType<typeof groupKanbanItems>[number]
  onExpand: () => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  isDragOver: boolean
}) {
  const dotColor = getKanbanDotColor(group.color)
  const localizedLabel = formatKanbanGroupLabel(group.groupKey, group.label)

  return (
    <button
      type='button'
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onExpand}
      aria-label={`${t('preview.kanban_expand_column')}: ${localizedLabel}`}
      className={`flex w-10 shrink-0 cursor-pointer flex-col items-center rounded-[var(--r-lg)] border py-3 transition-colors ${
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <span className='flex flex-col items-center gap-2'>
        {dotColor && <span className='size-2.5 rounded-full' style={{ backgroundColor: dotColor }} />}
        <span className='rounded-[var(--r-full)] bg-[var(--bg-surface)] px-1 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
          {group.items.length}
        </span>
      </span>
      <span className='mt-4 flex flex-1 items-center justify-center [writing-mode:vertical-rl] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {localizedLabel}
      </span>
    </button>
  )
}
