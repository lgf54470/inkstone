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
        'inline-flex items-center gap-1 rounded-[var(--r-full)] px-1.5 py-0.5 text-[length:var(--text-10)]',
        isRemote
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)]'
          : 'bg-[var(--bg-inset)] text-[var(--text-tertiary)]',
        className,
      )}
      title={isRemote ? t('music.source_webdav') : t('music.source_r2')}
    >
      <Icon size={9} aria-hidden='true' />
      {isRemote ? t('music.source_webdav') : t('music.source_r2')}
    </span>
  )
}
