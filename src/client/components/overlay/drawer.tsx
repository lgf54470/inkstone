import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from '../primitives'
import { t } from '../../lib/i18n'
import { Z_INDEX } from '../../lib/z-index'
import { useEscape, useLockScroll, useDialogFocus } from './hooks'
import { Tooltip } from './tooltip'

const DRAWER_FIT_BREAKPOINT = 768
const DRAWER_SIDE_GAP = 32


export function Drawer({ open, onClose, side = 'right', width = 380, children, title, zIndex = Z_INDEX.drawer, }: {
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  width?: number
  children: ReactNode
  title?: ReactNode
  zIndex?: number
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef)
  if (!open)
    return null
  // A `div` with `role=dialog` rather than an `aside`: `dialog` is not an allowed role on `aside`, and
  // a titled aside is a second banner landmark. Both were read by axe on the phone outline drawer,
  // where this shell is a drawer instead of a column (see the phone pass in scripts/check-contrast.mjs).
  return createPortal(<div className='app-viewport-fixed fixed' style={{ zIndex }}>
    <div className='anim-fade absolute inset-0 bg-[var(--scrim)]' onClick={onClose} aria-hidden='true'/>
    <div ref={panelRef} role='dialog' aria-modal='true' aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : t('overlay.side_panel')} tabIndex={-1} data-surface='drawer' className={cn('absolute top-0 bottom-0 flex flex-col border-[var(--border-default)] bg-[var(--bg-surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-modal)] outline-none md:py-0', side === 'right' ? 'right-0 border-l' : 'left-0 border-r')} style={{
      width: Math.min(width, window.innerWidth < DRAWER_FIT_BREAKPOINT ? window.innerWidth : window.innerWidth - DRAWER_SIDE_GAP),
      animation: `ink-slide-in-${side} var(--dur-slow) var(--ease-out) both`,
    }}>
    {title && (<div className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3'>
      <span id={titleId} className='text-[length:var(--text-13)] font-semibold'>{title}</span>
      <Tooltip label={t('common.close')} combo='escape' side='left'>
        <IconButton label={t('common.close')} size='sm' onClick={onClose}>
        <X size={15}/>
        </IconButton>
      </Tooltip>
      </div>)}
    <div className='min-h-0 flex-1 overflow-y-auto'>{children}</div>
    </div>
  </div>, document.body)
}
