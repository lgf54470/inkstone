import { useEffect, useRef } from 'react'
import { Check } from 'lucide-react'
import { t } from '../../../i18n'
import { KANBAN_COLOR_NAMES } from '../colors'
import type { KanbanColorName } from '../types'

interface KanbanColorPickerProps {
  open: boolean
  color?: KanbanColorName | string | null
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onSelectColor: (color: KanbanColorName) => void
}

function ColorSwatches({
  selectedColor,
  onSelectColor,
  onClose,
}: {
  selectedColor?: KanbanColorName | string | null
  onSelectColor: (color: KanbanColorName) => void
  onClose: () => void
}) {
  return (
    <div className='grid grid-cols-6 gap-1.5 p-2'>
      {KANBAN_COLOR_NAMES.map((c) => {
        const isSelected = selectedColor === c
        return (
          <button
            key={c}
            type='button'
            onClick={() => {
              onSelectColor(c)
              onClose()
            }}
            title={c}
            aria-label={c}
            className='relative flex size-6 items-center justify-center rounded-[var(--r-full)] transition-transform hover:scale-110'
            style={{ backgroundColor: `var(--kanban-tag-${c}-fg)` }}
          >
            {isSelected && <Check size={12} className='text-[var(--accent-contrast)]' />}
          </button>
        )
      })}
    </div>
  )
}

export function KanbanColorPicker({
  open,
  color,
  anchorRef,
  onClose,
  onSelectColor,
}: KanbanColorPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        anchorRef.current?.contains(e.target as Node)
      ) {
        return
      }
      onClose()
    }
    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      role='dialog'
      aria-label={t('preview.kanban_color_picker')}
      className='absolute z-50 mt-1 w-48 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-pop)]'
    >
      <div className='border-b border-[var(--border-subtle)] px-2.5 py-1.5 text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
        {t('preview.kanban_color_picker')}
      </div>
      <ColorSwatches selectedColor={color} onSelectColor={onSelectColor} onClose={onClose} />
    </div>
  )
}
