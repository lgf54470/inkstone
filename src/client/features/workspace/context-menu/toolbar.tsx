import { useRef } from 'react'
import { Copy, Redo2, Scissors, Undo2, ClipboardPaste } from 'lucide-react'
import { t } from '../../../lib/i18n'
import { prettyCombo } from '../../../lib/hotkeys'
import type { ToolbarSearchAction } from '../../../components/overlay/menu-search'

export interface ContextToolbarProps {
  onCut?: () => void
  canCut?: boolean
  onCopy?: () => void
  canCopy?: boolean
  onPaste?: () => void
  canPaste?: boolean
  onUndo?: () => void
  canUndo?: boolean
  onRedo?: () => void
  canRedo?: boolean
  onClose: () => void
}

export function getToolbarSearchActions(props: ContextToolbarProps): ToolbarSearchAction[] {
  const { onCut, canCut, onCopy, canCopy = true, onPaste, canPaste, onUndo, canUndo, onRedo, canRedo, onClose } = props
  const actions: ToolbarSearchAction[] = []

  if (canCut && onCut) {
    actions.push({
      id: 'toolbar-cut',
      label: t('contextmenu.cut'),
      icon: <Scissors size={14} />,
      combo: 'mod+x',
      onSelect: () => {
        onCut()
        onClose()
      },
    })
  }
  if (canCopy && onCopy) {
    actions.push({
      id: 'toolbar-copy',
      label: t('contextmenu.copy'),
      icon: <Copy size={14} />,
      combo: 'mod+c',
      onSelect: () => {
        onCopy()
        onClose()
      },
    })
  }
  if (canPaste && onPaste) {
    actions.push({
      id: 'toolbar-paste',
      label: t('contextmenu.paste'),
      icon: <ClipboardPaste size={14} />,
      combo: 'mod+v',
      onSelect: () => {
        onPaste()
        onClose()
      },
    })
  }
  if (canUndo && onUndo) {
    actions.push({
      id: 'toolbar-undo',
      label: t('contextmenu.undo'),
      icon: <Undo2 size={14} />,
      combo: 'mod+z',
      onSelect: () => {
        onUndo()
        onClose()
      },
    })
  }
  if (canRedo && onRedo) {
    actions.push({
      id: 'toolbar-redo',
      label: t('contextmenu.redo'),
      icon: <Redo2 size={14} />,
      combo: 'mod+shift+z',
      onSelect: () => {
        onRedo()
        onClose()
      },
    })
  }

  return actions
}

export function ContextMenuToolbar({
  onCut,
  canCut = false,
  onCopy,
  canCopy = true,
  onPaste,
  canPaste = false,
  onUndo,
  canUndo = false,
  onRedo,
  canRedo = false,
  onClose,
}: ContextToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleAction = (fn?: () => void) => {
    if (!fn) return
    fn()
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const container = containerRef.current
    if (!container) return
    const actionButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const currentBtn = e.currentTarget
    const btnPos = actionButtons.indexOf(currentBtn)
    if (btnPos === -1) return

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      const nextBtn = actionButtons[(btnPos + 1) % actionButtons.length]
      nextBtn?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      const prevBtn = actionButtons[(btnPos - 1 + actionButtons.length) % actionButtons.length]
      prevBtn?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      const menu = container.closest('[role="menu"]')
      const searchInput = menu?.querySelector<HTMLInputElement>('input')
      if (searchInput) {
        searchInput.focus()
      } else {
        const firstItem = menu?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
        firstItem?.focus()
      }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      const menu = container.closest('[role="menu"]')
      if (e.shiftKey) {
        const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])
        const lastItem = items[items.length - 1]
        if (lastItem) {
          lastItem.focus()
        } else {
          const searchInput = menu?.querySelector<HTMLInputElement>('input')
          searchInput?.focus()
        }
      } else {
        const searchInput = menu?.querySelector<HTMLInputElement>('input')
        if (searchInput) {
          searchInput.focus()
        } else {
          const firstItem = menu?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')
          firstItem?.focus()
        }
      }
    }
  }

  const buttons = [
    {
      id: 'cut',
      label: t('contextmenu.cut'),
      icon: <Scissors size={14} />,
      combo: 'mod+x',
      disabled: !canCut,
      onClick: onCut,
    },
    {
      id: 'copy',
      label: t('contextmenu.copy'),
      icon: <Copy size={14} />,
      combo: 'mod+c',
      disabled: !canCopy,
      onClick: onCopy,
    },
    {
      id: 'paste',
      label: t('contextmenu.paste'),
      icon: <ClipboardPaste size={14} />,
      combo: 'mod+v',
      disabled: !canPaste,
      onClick: onPaste,
    },
    {
      id: 'sep',
      isSep: true,
    },
    {
      id: 'undo',
      label: t('contextmenu.undo'),
      icon: <Undo2 size={14} />,
      combo: 'mod+z',
      disabled: !canUndo,
      onClick: onUndo,
    },
    {
      id: 'redo',
      label: t('contextmenu.redo'),
      icon: <Redo2 size={14} />,
      combo: 'mod+shift+z',
      disabled: !canRedo,
      onClick: onRedo,
    },
  ]

  return (
    <div
      ref={containerRef}
      role='toolbar'
      aria-label={t('contextmenu.quick_actions')}
      className='flex items-center justify-between px-1 py-1 mb-1 rounded-[calc(var(--r-lg)-2px)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]'
    >
      <div className='flex items-center gap-0.5 w-full justify-around'>
        {buttons.map((btn) => {
          if ('isSep' in btn && btn.isSep) {
            return <div key='sep' className='h-4 w-px bg-[var(--border-subtle)] mx-0.5 shrink-0' aria-hidden />
          }
          return (
            <button
              key={btn.id}
              type='button'
              disabled={btn.disabled}
              title={btn.combo ? `${btn.label} (${prettyCombo(btn.combo)})` : btn.label}
              aria-label={btn.label}
              onClick={(e) => {
                e.stopPropagation()
                handleAction(btn.onClick)
              }}
              onKeyDown={handleKeyDown}
              className='flex items-center justify-center w-7 h-7 rounded-[var(--r-sm)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed transition-[background-color,color,transform] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]'
            >
              {btn.icon}
            </button>
          )
        })}
      </div>
    </div>
  )
}
