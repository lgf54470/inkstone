import { useState } from 'react'
import { Music } from 'lucide-react'
import { cn } from '../../lib/cn'

export function MusicArtwork({
  url,
  alt,
  className,
  iconSize = 14,
}: {
  url: string | null
  alt: string
  className?: string
  iconSize?: number
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(url) && failedUrl !== url
  return (
    <span className={cn('flex items-center justify-center overflow-hidden bg-[var(--bg-inset)]', className)}>
      {showImage
        ? (
          <img
            src={url!}
            alt={alt}
            loading='lazy'
            draggable={false}
            className='size-full object-cover'
            onError={() => setFailedUrl(url)}
          />
        )
        : <Music size={iconSize} className='text-[var(--text-quaternary)]' aria-hidden='true' />}
    </span>
  )
}