import { memo, useRef, useState } from 'react'
import { ChevronLeft, Palette, Trash2 } from 'lucide-react'
import { useClickOutside, useEscape } from '../../../../components/overlay'
import { t, useLocaleRepaint } from '../../../i18n'
import { getKanbanDotColor } from '../colors'
import type { KanbanColorName } from '../types'

interface KanbanColumnMenuProps {
  open: boolean
  panelId: string
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  groupKey: string
  label: string
  color?: KanbanColorName
  onRename: (newLabel: string) => void
  onChangeColor: (newColor: KanbanColorName) => void
  onCollapse: () => void
  onDelete?: () => void
}

const AVAILABLE_COLORS: KanbanColorName[] = [
  'gray',
  'blue',
  'green',
  'yellow',
  'orange',
  'purple',
  'pink',
  'red',
]

function ColorPaletteRow({
  activeColor,
  onChangeColor,
}: {
  activeColor?: KanbanColorName
  onChangeColor: (color: KanbanColorName) => void
}) {
  return (
    <div className='flex items-center gap-1.5 px-2 py-1'>
      <Palette size={13} className='text-[var(--text-tertiary)]' />
      <span className='text-[length:var(--text-11)] text-[var(--text-secondary)]'>
        {t('preview.kanban_column_color')}
      </span>
      <div className='ml-auto flex items-center gap-1'>
        {AVAILABLE_COLORS.map((c) => (
          <button
            key={c}
            type='button'
            onClick={() => onChangeColor(c)}
            style={{ backgroundColor: getKanbanDotColor(c) }}
            className={`size-3.5 rounded-full transition-transform hover:scale-125 ${
              activeColor === c ? 'ring-2 ring-[var(--accent)] ring-offset-1' : ''
            }`}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  )
}

function ColumnRenameInput({
  initialName,
  onRename,
  onClose,
}: {
  initialName: string
  onRename: (newLabel: string) => void
  onClose: () => void
}) {
  const [editingName, setEditingName] = useState(initialName)

  const handleRenameSubmit = () => {
    if (editingName.trim() && editingName !== initialName) {
      onRename(editingName.trim())
    }
  }

  return (
    <div className='px-1 py-1'>
      <input
        type='text'
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onBlur={handleRenameSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleRenameSubmit()
            onClose()
          }
        }}
        placeholder={t('preview.kanban_column_name_placeholder')}
        className='w-full rounded-[var(--r-sm)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2 py-1 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'
      />
    </div>
  )
}

function ColumnActionButtons({
  onCollapse,
  onDelete,
  onClose,
  isNoneGroup,
}: {
  onCollapse: () => void
  onDelete?: () => void
  onClose: () => void
  isNoneGroup: boolean
}) {
  return (
    <>
      <button
        type='button'
        onClick={() => {
          onCollapse()
          onClose()
        }}
        className='flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      >
        <ChevronLeft size={14} />
        <span>{t('preview.kanban_collapse_column')}</span>
      </button>

      {onDelete && !isNoneGroup && (
        <button
          type='button'
          onClick={() => {
            onDelete()
            onClose()
          }}
          className='flex items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-[length:var(--text-12)] text-[var(--danger)] hover:bg-[var(--bg-hover)]'
        >
          <Trash2 size={14} />
          <span>{t('preview.kanban_delete_column')}</span>
        </button>
      )}
    </>
  )
}

export const KanbanColumnMenu = memo(function KanbanColumnMenu({
  open,
  onClose,
  anchorRef,
  groupKey,
  label,
  color,
  onRename,
  onChangeColor,
  onCollapse,
  onDelete,
  panelId,
}: KanbanColumnMenuProps) {
  useLocaleRepaint()
  const panelRef = useRef<HTMLDivElement>(null)
  useClickOutside([panelRef, anchorRef], open, onClose)
  useEscape(open, onClose)

  if (!open) return null

  const isNoneGroup = groupKey === '__none__'

  return (
    <div
      id={panelId}
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_rename_column')}
      className='absolute right-0 top-full z-[var(--z-menu)] mt-1 flex w-56 flex-col gap-1 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-1.5 shadow-[var(--shadow-pop)]'
    >
      {!isNoneGroup && (
        <ColumnRenameInput initialName={label} onRename={onRename} onClose={onClose} />
      )}
      {!isNoneGroup && (
        <ColorPaletteRow activeColor={color} onChangeColor={onChangeColor} />
      )}
      <ColumnActionButtons
        onCollapse={onCollapse}
        onDelete={onDelete}
        onClose={onClose}
        isNoneGroup={isNoneGroup}
      />
    </div>
  )
})
