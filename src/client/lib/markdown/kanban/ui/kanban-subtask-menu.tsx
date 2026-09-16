import { useEffect, useRef } from 'react'
import { ArrowUpRight, Copy, CornerDownRight, ExternalLink, Trash2 } from 'lucide-react'
import { t } from '../../../i18n'
import type { KanbanSubtask } from '../types'

interface KanbanSubtaskMenuProps {
  open: boolean
  subtask: KanbanSubtask
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onOpen?: () => void
  onDuplicate: () => void
  onConvertToItem: () => void
  onDelete: () => void
}

function useMenuClickOutside(
  open: boolean,
  onClose: () => void,
  menuRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open, onClose, anchorRef, menuRef])
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
  onOpen,
  onDuplicate,
  onConvertToItem,
  onDelete,
  onClose,
}: {
  subtask: KanbanSubtask
  onOpen?: () => void
  onDuplicate: () => void
  onConvertToItem: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const copyName = () => {
    void navigator.clipboard.writeText(subtask.title)
    onClose()
  }

  return (
    <>
      {onOpen && (
        <SubtaskMenuItem
          icon={ExternalLink}
          label={t('preview.kanban_open_subitem')}
          onClick={() => { onOpen(); onClose() }}
        />
      )}
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
      <SubtaskMenuItem
        icon={ArrowUpRight}
        label={t('preview.kanban_convert_to_item')}
        onClick={() => { onConvertToItem(); onClose() }}
      />
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
  onOpen,
  onDuplicate,
  onConvertToItem,
  onDelete,
}: KanbanSubtaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useMenuClickOutside(open, onClose, menuRef, anchorRef)

  if (!open) return null

  return (
    <div
      ref={menuRef}
      role='menu'
      className='absolute right-0 z-50 mt-1 w-44 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'
    >
      <SubtaskMenuItems
        subtask={subtask}
        onOpen={onOpen}
        onDuplicate={onDuplicate}
        onConvertToItem={onConvertToItem}
        onDelete={onDelete}
        onClose={onClose}
      />
    </div>
  )
}
