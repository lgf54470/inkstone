import { useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { t } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import { kanbanWipOver, type KanbanGroup } from '../filter-sort'
import { formatKanbanGroupLabel } from '../i18n-helpers'
import type { KanbanColorName } from '../types'
import { KanbanColumnCount } from './kanban-column-count'
import { KanbanColumnMenu } from './kanban-column-menu'

export function ColumnHeaderTitle({
  label,
  count,
  color,
  wipLimit,
}: {
  label: string
  count: number
  color?: KanbanColorName
  wipLimit?: number
}) {
  const dotColor = getKanbanDotColor(color)
  return (
    <div className='flex min-w-0 items-center gap-2'>
      <span className='size-2.5 shrink-0 rounded-full' style={{ backgroundColor: dotColor }} />
      <span className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {label}
      </span>
      <KanbanColumnCount
        count={count}
        limit={wipLimit}
        className='shrink-0 rounded-[var(--r-full)] bg-[var(--bg-inset)] px-2 py-0.5 text-[length:var(--text-11)] font-medium'
      />
    </div>
  )
}

export function KanbanColumnHeader({
  groupKey,
  label,
  count,
  color,
  wipLimit,
  onDragStart,
  onRename,
  onChangeColor,
  onChangeWipLimit,
  onCollapse,
  onDelete,
}: {
  groupKey: string
  label: string
  count: number
  color?: KanbanColorName
  wipLimit?: number
  onDragStart: (e: React.DragEvent) => void
  onRename: (newLabel: string) => void
  onChangeColor: (newColor: KanbanColorName) => void
  onChangeWipLimit: (limit: number | undefined) => void
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
      <ColumnHeaderTitle label={localizedLabel} count={count} color={color} wipLimit={wipLimit} />
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
        wipLimit={wipLimit}
        onRename={onRename}
        onChangeColor={onChangeColor}
        onChangeWipLimit={onChangeWipLimit}
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
  group: KanbanGroup
  onExpand: () => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  isDragOver: boolean
}) {
  const dotColor = getKanbanDotColor(group.color)
  const localizedLabel = formatKanbanGroupLabel(group.groupKey, group.label)
  // The strip's own label replaces everything inside the button, so the state the pill shows has to
  // be said here too or a screen reader gets the count of no column at all.
  const over = kanbanWipOver(group.items.length, group.wipLimit)

  return (
    <button
      type='button'
      data-kanban-group={group.groupKey}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onExpand}
      aria-label={over > 0
        ? t('preview.kanban_expand_column_over', { name: localizedLabel, over, limit: group.wipLimit ?? 0 })
        : t('preview.kanban_expand_column_named', { name: localizedLabel })}
      className={`flex w-10 shrink-0 cursor-pointer flex-col items-center rounded-[var(--r-lg)] border py-3 transition-colors ${
        isDragOver
          ? 'border-[var(--accent)] bg-[var(--accent-softer)]'
          : 'border-[var(--border-subtle)] bg-[var(--bg-raised)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <span className='flex flex-col items-center gap-2'>
        {dotColor && <span className='size-2.5 rounded-full' style={{ backgroundColor: dotColor }} />}
        <KanbanColumnCount
          count={group.items.length}
          limit={group.wipLimit}
          className='rounded-[var(--r-full)] bg-[var(--bg-surface)] px-1 py-0.5 text-[length:var(--text-10)]'
        />
      </span>
      <span className='mt-4 flex flex-1 items-center justify-center [writing-mode:vertical-rl] text-[length:var(--text-12)] font-medium text-[var(--text-secondary)]'>
        {localizedLabel}
      </span>
    </button>
  )
}
