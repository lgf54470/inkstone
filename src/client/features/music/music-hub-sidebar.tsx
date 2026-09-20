import { memo, useMemo } from 'react'
import { Clock3, Copy, Disc, FolderHeart, Heart, Library, Pin, Users } from 'lucide-react'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { formatBytes, formatTotalDuration } from '../../lib/time'
import { MusicHubPlaylists } from './music-hub-playlists'
import { redundantTrackCount } from './music-duplicates'
import { buildGroups } from './music-grouping'
import { MusicHubTags } from './music-hub-tags'
import { useMusic } from './music-store'
import type { MusicScope } from './music-store'

export const MusicHubSidebar = memo(function MusicHubSidebar({
  onCreatePlaylist,
  onManageTags,
}: {
  onCreatePlaylist: () => void
  onManageTags: () => void
}) {
  return (
    <aside aria-label={t('music.hub_sidebar')} className='flex w-56 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] select-none'>
      <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-2 py-3'>
        <CollectionNav />
        <MusicHubTags onManage={onManageTags} />
        <MusicHubPlaylists onCreate={onCreatePlaylist} />
      </div>
      <SidebarStats />
    </aside>
  )
})

function CollectionNav() {
  const stats = useMusic((state) => state.stats)
  const scope = useMusic((state) => state.scope)
  const setScope = useMusic((state) => state.setScope)
  const recentCount = useMusic((state) => state.tracks.reduce((count, track) => count + (track.lastPlayedAt === null ? 0 : 1), 0))
  const tracks = useMusic((state) => state.tracks)
  const albumCount = useMemo(() => buildGroups(tracks, 'albums').length, [tracks])
  const artistCount = useMemo(() => buildGroups(tracks, 'artists').length, [tracks])
  const duplicateCount = useMemo(() => redundantTrackCount(tracks), [tracks])
  const items: { scope: MusicScope; icon: React.ReactNode; label: string; count: number }[] = [
    { scope: { kind: 'all' }, icon: <Library size={13} />, label: t('music.all_tracks'), count: stats?.trackCount ?? 0 },
    { scope: { kind: 'favorites' }, icon: <Heart size={13} />, label: t('music.favorites'), count: stats?.favoriteCount ?? 0 },
    { scope: { kind: 'pinned' }, icon: <Pin size={13} />, label: t('music.pinned'), count: stats?.pinnedCount ?? 0 },
    { scope: { kind: 'recent' }, icon: <Clock3 size={13} />, label: t('music.recently_played'), count: recentCount },
    { scope: { kind: 'albums' }, icon: <Disc size={13} />, label: t('music.albums'), count: albumCount },
    { scope: { kind: 'artists' }, icon: <Users size={13} />, label: t('music.artists'), count: artistCount },
    { scope: { kind: 'duplicates' }, icon: <Copy size={13} />, label: t('music.duplicates'), count: duplicateCount },
  ]
  return (
    <div className='space-y-0.5'>
      {items.map((item) => {
        const active = isNavActive(scope, item.scope)
        return (
          <button
            key={item.scope.kind}
            type='button'
            onClick={() => setScope(item.scope)}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex h-8 w-full items-center justify-between rounded-[var(--r-md)] px-2.5 text-[length:var(--text-12)] font-medium transition-colors',
              active
                ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            <span className='flex min-w-0 items-center gap-2'>
              {item.icon}
              <span className='truncate'>{item.label}</span>
            </span>
            {/* The active row's 14% accent tint puts the dim tiers under AA (tertiary measures
                4.16–4.28 in light), so its count takes the row's accent — the one pairing the
                token system calibrates (accent as text on its own tint). */}
            <span className={cn('tabular shrink-0 text-[length:var(--text-10)]', active ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}>{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}

// A drilled-down album/artist keeps its browse entry highlighted as the owning view.
function isNavActive(scope: MusicScope, item: MusicScope): boolean {
  return scope.kind === item.kind
    || (item.kind === 'albums' && scope.kind === 'album')
    || (item.kind === 'artists' && scope.kind === 'artist')
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