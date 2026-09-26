import { Cloud, Link, Server } from 'lucide-react'
import type { MusicSource } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

// Reference rows must not masquerade as the R2 cloud badge: webdav/alist/external
// each carry their own label, and the accent tint stays a webdav-only distinction.
const BADGE_LABELS: Record<MusicSource, 'music.source_r2' | 'music.source_webdav' | 'music.source_external' | 'music.source_alist'> = {
  r2: 'music.source_r2',
  webdav: 'music.source_webdav',
  external: 'music.source_external',
  alist: 'music.source_alist',
}

export function MusicSourceBadge({ source, className }: { source: MusicSource; className?: string }) {
  const label = BADGE_LABELS[source]
  const isRemote = source === 'webdav'
  const isLinked = source === 'external' || source === 'alist'
  const Icon = isRemote ? Server : isLinked ? Link : Cloud
  return (
    <span
      className={cn(
        // The label wraps inside a narrow column and inflates the row, so it never breaks.
        'inline-flex items-center gap-1 whitespace-nowrap rounded-[var(--r-full)] px-1.5 py-0.5 text-[length:var(--text-10)]',
        isRemote
          ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
          : 'bg-[var(--bg-inset)] text-[var(--text-secondary)]',
        className,
      )}
      title={t(label)}
    >
      <Icon size={9} aria-hidden='true' />
      {t(label)}
    </span>
  )
}
