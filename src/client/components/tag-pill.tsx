import { memo } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'
import { Hash, X } from 'lucide-react'
import { cn } from '../lib/cn'
import { t } from '../lib/i18n'


interface TagPillProps {
  tag: string
  color?: string | null
  size?: 'sm' | 'md'
  removable?: boolean
  removeLabel?: string
  onClick?: (e?: MouseEvent) => void
  onRemove?: (e?: MouseEvent) => void
  className?: string
}

function pillStyleOf(color?: string | null): CSSProperties {
  return color
    ? {
        backgroundColor: `${color}18`,
        color,
        borderColor: `${color}38`,
      }
    : {
        backgroundColor: 'var(--accent-softer)',
        color: 'var(--accent)',
        borderColor: 'var(--border-subtle)',
      }
}

function handlePillKeyDown(e: KeyboardEvent, onClick?: (e?: MouseEvent) => void) {
  if (onClick && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault()
    onClick()
  }
}

function TagPillRemove({
  isSm,
  label,
  onRemove,
}: {
  isSm: boolean
  label?: string
  onRemove: (e?: MouseEvent) => void
}) {
  const ariaLabel = label ?? t('tags.remove_from_note')
  return (
    <button
      type='button'
      tabIndex={0}
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={(e) => {
        e.stopPropagation()
        onRemove(e)
      }}
      className={cn(
        'flex items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/15',
        isSm ? 'size-3.5 -mr-1 ml-0.5' : 'size-4 -mr-1 ml-0.5',
      )}
    >
      <X size={isSm ? 9 : 11} />
    </button>
  )
}

export const TagPill = memo(function TagPill({
  tag,
  color,
  size = 'sm',
  removable = false,
  removeLabel,
  onClick,
  onRemove,
  className,
}: TagPillProps) {
  const isSm = size === 'sm'

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => handlePillKeyDown(e, onClick)}
      title={onClick ? t('tags.filter_by_tag', { value0: tag }) : `#${tag}`}
      style={pillStyleOf(color)}
      className={cn(
        'group/tag inline-flex items-center rounded-full border transition-all select-none',
        isSm ? 'h-5 gap-0.5 px-2 text-[length:var(--text-10\\.5)] font-medium' : 'h-6 gap-1 px-2.5 text-[length:var(--text-12)] font-medium',
        onClick && 'cursor-pointer hover:brightness-95 dark:hover:brightness-110 active:scale-[0.98]',
        className,
      )}
    >
      <Hash size={isSm ? 10 : 12} className='shrink-0 opacity-70' />
      <span className='truncate max-w-37.5'>{tag}</span>
      {removable && onRemove && <TagPillRemove isSm={isSm} label={removeLabel} onRemove={onRemove} />}
    </span>
  )
})
