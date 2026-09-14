import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/cn'
import { IconButton } from '../primitives'
import { t } from '../../lib/i18n'
import { useEscape, useLockScroll, useDialogFocus } from './hooks'
import { Tooltip } from './tooltip'



export function Modal({ open, onClose, title, description, children, footer, width = 560, className, bodyClassName, variant = 'dialog', ariaLabel }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: number
  className?: string
  bodyClassName?: string
  /** `fullscreen` fills the viewport and hands the body to a single surface (e.g. a mind map). */
  variant?: 'dialog' | 'fullscreen'
  /** Accessible name for a surface that renders its own heading instead of using `title`. */
  ariaLabel?: string
}) {
  const fullscreen = variant === 'fullscreen'
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  useEscape(open, onClose)
  useLockScroll(open)
  useDialogFocus(open, panelRef)
  if (!open)
    return null
  return createPortal(


  <div className={cn('app-viewport-fixed fixed z-[var(--z-modal)] flex items-end justify-center overflow-hidden md:items-start md:overflow-y-auto md:p-8', fullscreen && 'md:overflow-hidden md:p-0')}>
    <div className='anim-fade absolute inset-0 bg-[var(--scrim)]' onClick={onClose} aria-hidden='true'/>
    <div ref={panelRef} role='dialog' aria-modal='true' aria-labelledby={title ? titleId : undefined} aria-describedby={description ? descriptionId : undefined} aria-label={title ? undefined : ariaLabel ?? t('overlay.dialog')} tabIndex={-1} className={cn('anim-pop relative flex max-h-[calc(var(--app-viewport-height,100dvh)-env(safe-area-inset-top))] md:max-h-[calc(var(--app-viewport-height,100dvh)-4rem)] w-full flex-col rounded-t-[var(--r-2xl)] border border-b-0 border-[var(--border-default)]', 'bg-[var(--bg-overlay)] shadow-[var(--shadow-modal)] outline-none md:my-auto md:rounded-[var(--r-2xl)] md:border-b', fullscreen && 'h-full max-h-none w-full rounded-none border-0 md:my-0 md:h-full md:max-h-none md:rounded-none md:border-0', className)} style={{ maxWidth: fullscreen ? undefined : width }}>
    {(title || description) && (<div className='flex shrink-0 items-start justify-between gap-4 px-4 pt-4 pb-3 md:px-5'>
      <div className='min-w-0'>
        {title && (<h2 id={titleId} className='text-[length:var(--text-15)] font-semibold tracking-[var(--tracking-title)] text-[var(--text-primary)]'>
          {title}
        </h2>)}
        {description && (<p id={descriptionId} className="mt-1 text-[length:var(--text-12\.5)] leading-relaxed text-[var(--text-tertiary)]">
          {description}
        </p>)}
      </div>
      <Tooltip label={t('common.close')} combo='escape' side='left'>
        <IconButton label={t('common.close')} size='sm' onClick={onClose} className='-mr-1 -mt-0.5'>
        <X size={15}/>
        </IconButton>
      </Tooltip>
      </div>)}
    <div className={cn('min-h-0 overflow-y-auto px-4 pb-4 md:px-5 md:pb-5', fullscreen && 'flex min-h-0 flex-1 flex-col overflow-hidden p-0 md:p-0', bodyClassName)}>{children}</div>
    {footer && (<div className='flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:px-5 md:py-3'>
      {footer}
      </div>)}
    </div>
  </div>, document.body)
}
