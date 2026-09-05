import { useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { extractCoverUrl } from '@shared/markdown-utils'

export function PostCoverImage({
  src,
  alt,
  className = 'size-full object-cover transition-transform duration-300 group-hover:scale-105',
  fallbackIconSize = 28,
}: {
  src?: string
  alt: string
  className?: string
  fallbackIconSize?: number
}) {
  const [isError, setIsError] = useState(false)
  const clean = src ? extractCoverUrl(src) : ''
  const isValid = Boolean(
    clean &&
      (clean.startsWith('http://') ||
        clean.startsWith('https://') ||
        clean.startsWith('/') ||
        clean.startsWith('data:image/')),
  )

  if (!isValid || isError) {
    return (
      <div className="flex size-full items-center justify-center text-[var(--text-quaternary)]">
        <ImageIcon size={fallbackIconSize} className="opacity-40" />
      </div>
    )
  }

  return (
    <img
      src={clean}
      alt={alt}
      onError={() => setIsError(true)}
      className={className}
    />
  )
}

