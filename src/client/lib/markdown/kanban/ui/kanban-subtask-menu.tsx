import { useRef } from 'react'
import { ArrowUpRight, Copy, CornerDownRight, Trash2 } from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { t } from '../../../i18n'
import { useUi } from '../../../../store/ui'
import type { KanbanSubtask } from '../types'

interface KanbanSubtaskMenuProps {
  open: boolean
  subtask: KanbanSubtask
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onDuplicate: () => void
  onConvertToItem?: () => void
  onDelete: () => void
}

function SubtaskMenuItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      role='menuitem'
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[var(--r-xs)] px-2 py-1 text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] ${
        danger ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'
      }`}
    >
      <Icon size={13} className={danger ? '' : 'text-[var(--text-tertiary)]'} />
      <span>{label}</span>
    </button>
  )
}

function SubtaskMenuItems({
  subtask,
  onDuplicate,
  onConvertToItem,
  onDelete,
  onClose,
}: {
  subtask: KanbanSubtask
  onDuplicate: () => void
  onConvertToItem?: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const copyName = () => {
    const fail = () => useUi.getState().toast({ title: t('preview.could_not_copy'), tone: 'danger' })
    if (!navigator.clipboard?.writeText) {
      fail()
    } else {
      navigator.clipboard
        .writeText(subtask.title)
        .then(() => useUi.getState().toast({ title: t('common.copied'), tone: 'success' }))
        .catch(fail)
    }
    onClose()
  }

  return (
    <>
      <SubtaskMenuItem
        icon={Copy}
        label={t('preview.kanban_duplicate_subitem')}
        onClick={() => { onDuplicate(); onClose() }}
      />
      <SubtaskMenuItem
        icon={CornerDownRight}
        label={t('preview.kanban_copy_subitem_name')}
        onClick={copyName}
      />
      {onConvertToItem && (
        <SubtaskMenuItem
          icon={ArrowUpRight}
          label={t('preview.kanban_convert_to_item')}
          onClick={() => { onConvertToItem(); onClose() }}
        />
      )}
      <div className='my-1 h-px bg-[var(--border-subtle)]' />
      <SubtaskMenuItem
        icon={Trash2}
        label={t('preview.kanban_delete_subitem')}
        danger
        onClick={() => { onDelete(); onClose() }}
      />
    </>
  )
}

export function KanbanSubtaskMenu({
  open,
  subtask,
  anchorRef,
  onClose,
  onDuplicate,
  onConvertToItem,
  onDelete,
}: KanbanSubtaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useClickOutside([menuRef, anchorRef], open, onClose)
  useEscape(open, onClose)

  if (!open) return null

  return (
    <div
      ref={menuRef}
      role='menu'
      className='absolute right-0 z-[var(--z-popover)] mt-1 w-44 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'
    >
      <SubtaskMenuItems
        subtask={subtask}
        onDuplicate={onDuplicate}
        onConvertToItem={onConvertToItem}
        onDelete={onDelete}
        onClose={onClose}
      />
    </div>
  )
}
