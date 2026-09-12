import type { ReactNode } from 'react'

interface IconButtonProps {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  variant?: 'ghost' | 'primary'
  className?: string
  children: ReactNode
}

/** 播放器与音乐中心的图标按钮：形状与笔记应用一致（圆角方块），统一 aria-label 与设计令牌 */
export function MusicIconButton({ label, onClick, active, disabled, variant = 'ghost', className = '', children }: IconButtonProps) {
  const tone = variant === 'primary'
    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent)]'
    : active
      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
  return (
    <button
      type='button'
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-[var(--r-md)] transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] disabled:opacity-40 ${tone} ${className}`}
    >
      {children}
    </button>
  )
}

interface SeekBarProps {
  valueMs: number
  durationMs: number
  onSeek: (ms: number) => void
  label: string
  className?: string
}

export function MusicSeekBar({ valueMs, durationMs, onSeek, label, className = '' }: SeekBarProps) {
  const max = Math.max(1, Math.round(durationMs))
  return (
    <input
      type='range'
      min={0}
      max={max}
      value={Math.min(Math.round(valueMs), max)}
      aria-label={label}
      onChange={(event) => onSeek(Number(event.target.value))}
      className={`h-1 w-full cursor-pointer appearance-none rounded-full bg-[var(--border-default)] accent-[var(--accent)] ${className}`}
    />
  )
}
