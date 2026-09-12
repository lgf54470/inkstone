import { memo } from 'react'
import { Clock3, FolderHeart, Heart, Library, Pin } from 'lucide-react'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { MusicHubPlaylists } from './music-hub-playlists'
import { MusicHubTags } from './music-hub-tags'
import { useMusic } from './music-store'
import type { MusicScope } from './music-store'
import { formatBytes, formatTotalDuration } from './music-utils'

export const MusicHubSidebar = memo(function MusicHubSidebar({
  onCreatePlaylist,
  onManageTags,
}: {
  onCreatePlaylist: () => void
  onManageTags: () => void
}) {
  return (
    <aside className='flex w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] select-none'>
      <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3'>
        <CollectionNav />
        <MusicHubTags onManage={onManageTags} />
        <MusicHubPlaylists onCreate={onCreatePlaylist} />
      </div>
      <SidebarStats />
    </aside>
  )
})

function recentCount(): number {
  return useMusic.getState().recentIds.length
}

function CollectionNav() {
  const stats = useMusic((state) => state.stats)
  const scope = useMusic((state) => state.scope)
  const setScope = useMusic((state) => state.setScope)
  const items: { scope: MusicScope; icon: React.ReactNode; label: string; count: number }[] = [
    { scope: { kind: 'all' }, icon: <Library size={13} />, label: t('music.all_tracks'), count: stats?.trackCount ?? 0 },
    { scope: { kind: 'favorites' }, icon: <Heart size={13} />, label: t('music.favorites'), count: stats?.favoriteCount ?? 0 },
    { scope: { kind: 'pinned' }, icon: <Pin size={13} />, label: t('music.pinned'), count: stats?.pinnedCount ?? 0 },
    { scope: { kind: 'recent' }, icon: <Clock3 size={13} />, label: t('music.recently_played'), count: recentCount() },
  ]
  return (
    <div className='space-y-0.5'>
      {items.map((item) => {
        const active = scope.kind === item.scope.kind
        return (
          <button
            key={item.scope.kind}
            type='button'
            onClick={() => setScope(item.scope)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex h-8 w-full items-center justify-between rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] font-medium transition-colors',
              active
                ? 'bg-[var(--accent-subtle)] font-semibold text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            <span className='flex min-w-0 items-center gap-2'>
              {item.icon}
              <span className='truncate'>{item.label}</span>
            </span>
            <span className='tabular shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}

function SidebarStats() {
  const stats = useMusic((state) => state.stats)
  const rows = [
    { label: t('music.stats_tracks'), value: String(stats?.trackCount ?? 0) },
    { label: t('music.stats_duration'), value: formatTotalDuration(stats?.totalDurationMs ?? 0) },
    { label: t('music.stats_size'), value: formatBytes(stats?.totalBytes ?? 0) },
  ]
  return (
    <div className='space-y-1 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3'>
      <div className='mb-1 flex items-center gap-1.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        <Tooltip label={t('music.storage_quota')} side='top'><FolderHeart size={12} /></Tooltip>
        <span>{t('music.section_library')}</span>
      </div>
      {rows.map((row) => (
        <div key={row.label} className='flex items-center justify-between text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          <span>{row.label}</span>
          <span className='tabular font-semibold text-[var(--text-primary)]'>{row.value}</span>
        </div>
      ))}
    </div>
  )
}