import { Cloud, Link, Server } from 'lucide-react'
import type { MusicSource } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

// Reference rows must not masquerade as the R2 cloud badge: webdav/alist/external
// each carry their own label, and the accent tint stays a webdav-only distinction.
const BADGE_LABELS: Record<MusicSource, 'music.source_r2' | 'music.source_webdav' | 'music.source_external' | 'music.source_alist' | 'music.source_online'> = {
  r2: 'music.source_r2',
  webdav: 'music.source_webdav',
  external: 'music.source_external',
  alist: 'music.source_alist',
  provider: 'music.source_online',
}

export function MusicSourceBadge({ source, className }: { source: MusicSource; className?: string }) {
  // The badge is part of the reading surface, so the switch that turns it off lives with the
  // other surface preferences rather than as a prop on every row and card that draws one.
  const visible = useMusic((state) => state.showSourceBadge)
  if (!visible) return null
  const label = BADGE_LABELS[source]
  const isRemote = source === 'webdav'
  const isLinked = source === 'external' || source === 'alist' || source === 'provider'
  const Icon = isRemote ? Server : isLinked ? Link : Cloud
  return (
    <span
      className={cn(
        // The label wraps inside a narrow column and inflates the row, so it never breaks.
        'inline-flex items-center gap-[var(--sp-1)] whitespace-nowrap rounded-[var(--r-full)] px-[var(--sp-1\\.5)] py-[var(--sp-0\\.5)] text-[length:var(--text-10)]',
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
