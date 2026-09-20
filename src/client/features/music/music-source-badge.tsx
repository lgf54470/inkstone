import { Cloud, Server } from 'lucide-react'
import type { MusicSource } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'

export function MusicSourceBadge({ source, className }: { source: MusicSource; className?: string }) {
  const isRemote = source === 'webdav'
  const Icon = isRemote ? Server : Cloud
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
      title={isRemote ? t('music.source_webdav') : t('music.source_r2')}
    >
      <Icon size={9} aria-hidden='true' />
      {isRemote ? t('music.source_webdav') : t('music.source_r2')}
    </span>
  )
}
