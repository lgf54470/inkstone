import { useState, memo } from 'react'
import { Globe, icons } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface LinkDynamicIconProps {
  icon?: string | null
  name?: string
  url?: string
  size?: number
  className?: string
}

export function isEmojiString(str: string): boolean {
  if (!str) return false
  return !/^[a-zA-Z0-9_-]+$/.test(str) && (/[^\x00-\x7F]/.test(str) || /\p{Extended_Pictographic}/u.test(str))
}

export function isUrlString(str: string): boolean {
  if (!str) return false
  return /^https?:\/\//i.test(str) || str.startsWith('data:') || str.startsWith('/')
}

export const LinkDynamicIcon = memo(function LinkDynamicIcon({
  icon,
  name = '',
  size = 18,
  className = '',
}: LinkDynamicIconProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const trimmed = (icon || '').trim()

  if (!trimmed) {
    return <FallbackAvatar name={name} size={size} className={className} />
  }

  if (isUrlString(trimmed)) {
    if (imgFailed) {
      return <FallbackAvatar name={name} size={size} className={className} />
    }
    return (
      <img
        src={trimmed}
        alt={name}
        loading='lazy'
        referrerPolicy='no-referrer'
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size }}
        className={`object-contain rounded shrink-0 ${className}`}
      />
    )
  }

  if (isEmojiString(trimmed)) {
    return (
      <span
        style={{ fontSize: size, lineHeight: 1 }}
        aria-hidden
        className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
      >
        {trimmed}
      </span>
    )
  }

  const allIcons: Record<string, LucideIcon | undefined> = icons
  const Comp = allIcons[trimmed]
  if (Comp) {
    return <Comp size={size} className={`shrink-0 ${className}`} />
  }

  return <FallbackAvatar name={name} size={size} className={className} />
})

const MIN_FALLBACK_FONT_SIZE = 10
const FALLBACK_FONT_SCALE = 0.65

function FallbackAvatar({ name, size, className }: { name: string; size: number; className?: string }) {
  const char = (name.trim().charAt(0) || '').toUpperCase()
  if (char && /^[A-Z0-9\u4e00-\u9fa5]$/i.test(char)) {
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.max(MIN_FALLBACK_FONT_SIZE, Math.floor(size * FALLBACK_FONT_SCALE)) }}
        className={`inline-flex items-center justify-center rounded font-semibold text-[var(--accent)] bg-[var(--accent-subtle)] shrink-0 select-none ${className}`}
      >
        {char}
      </span>
    )
  }
  return <Globe size={size} className={`text-[var(--text-quaternary)] shrink-0 ${className}`} />
}
