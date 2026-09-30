import { useState, memo } from 'react'
import type { ReactNode } from 'react'
import { Globe } from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import { safeExternalUrl } from '@shared/url-safety'
import { PRESET_LINK_ICONS, lucideSlugOf } from './link-icons'

export interface LinkDynamicIconProps {
  icon?: string | null
  name?: string
  url?: string
  size?: number
  className?: string
  fallback?: ReactNode
}

export function isEmojiString(str: string): boolean {
  if (!str) return false
  return !/^[a-zA-Z0-9_-]+$/.test(str) && (/[^\x00-\x7F]/.test(str) || /\p{Extended_Pictographic}/u.test(str))
}

export function isUrlString(str: string): boolean {
  if (!str) return false
  return /^https?:\/\//i.test(str) || str.startsWith('data:') || str.startsWith('/')
}

export function extractDomain(url?: string | null): string {
  if (!url) return ''
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return parsed.hostname
  } catch {
    return ''
  }
}

export const LinkDynamicIcon = memo(function LinkDynamicIcon({
  icon,
  name = '',
  size = 18,
  className = '',
  fallback,
}: LinkDynamicIconProps) {
  const trimmed = (icon || '').trim()
  const spare = () => (fallback ? <>{fallback}</> : <FallbackAvatar name={name} size={size} className={className} />)

  if (!trimmed) return spare()

  if (isUrlString(trimmed)) {
    // A reader may have supplied this picture: an address that is not an image source this app will
    // fetch is treated like a load that failed, so the initial is drawn instead of it.
    const src = safeExternalUrl(trimmed, 'image')
    return src ? <IconImage src={src} name={name} size={size} className={className} spare={spare} /> : spare()
  }

  if (isEmojiString(trimmed)) return <IconEmoji value={trimmed} size={size} className={className} />

  const PresetIcon = PRESET_LINK_ICONS[trimmed]
  if (PresetIcon) return <PresetIcon size={size} className={`shrink-0 ${className}`} />

  // Picked from a search rather than from the presets: only this icon's own module is fetched, and
  // the library draws nothing until it arrives. A value no lucide version knows keeps the avatar,
  // like an empty one.
  const slug = lucideSlugOf(trimmed)
  if (slug) return <DynamicIcon name={slug} size={size} className={`shrink-0 ${className}`} />

  return spare()
})

function IconImage({
  src,
  name,
  size,
  className,
  spare,
}: {
  src: string
  name: string
  size: number
  className: string
  spare: () => ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{spare()}</>
  return (
    <img
      src={src}
      alt={name}
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`object-contain rounded shrink-0 ${className}`}
    />
  )
}

function IconEmoji({ value, size, className }: { value: string; size: number; className: string }) {
  return (
    <span
      style={{ fontSize: size, lineHeight: 1 }}
      aria-hidden
      className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
    >
      {value}
    </span>
  )
}

const MIN_FALLBACK_FONT_SIZE = 10
const FALLBACK_FONT_SCALE = 0.65

function FallbackAvatar({ name, size, className }: { name: string; size: number; className?: string }) {
  const char = (name.trim().charAt(0) || '').toUpperCase()
  if (char && /^[A-Z0-9\u4e00-\u9fa5]$/i.test(char)) {
    return (
      <span
        style={{ width: size, height: size, fontSize: Math.max(MIN_FALLBACK_FONT_SIZE, Math.floor(size * FALLBACK_FONT_SCALE)) }}
        className={`inline-flex items-center justify-center rounded font-semibold text-[var(--accent)] bg-[var(--accent-soft)] shrink-0 select-none ${className}`}
      >
        {char}
      </span>
    )
  }
  return <Globe size={size} className={`text-[var(--text-quaternary)] shrink-0 ${className}`} />
}
