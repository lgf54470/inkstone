import { memo, useMemo } from 'react'
import { ChevronLeft, Play } from 'lucide-react'
import type { MusicTrack } from '@shared/types'
import { Button, IconButton } from '../../components/primitives'
import { Empty } from '../../components/feedback'
import { t } from '../../lib/i18n'
import { useMusic, useVisibleTracks } from './music-store'
import type { MusicScope } from './music-store'
import { MusicArtwork } from './music-artwork'
import { buildGroups, groupMatchesQuery, groupScopeOf } from './music-grouping'
import type { MusicGroup, MusicGroupKind } from './music-grouping'
import { formatTotalDuration } from './music-utils'

// Albums and artists arrive as flat tag fields on each track (FEAT-10-era library),
// so the whole grouping view is derived client-side and never needs a server round-trip.
const GROUP_GRID_CLASS = 'grid h-full grid-cols-[repeat(auto-fill,minmax(150px,1fr))] content-start gap-3 overflow-y-auto p-4'

export const MusicGroupBrowse = memo(function MusicGroupBrowse({ kind }: { kind: MusicGroupKind }) {
  const tracks = useMusic((state) => state.tracks)
  const sourceFilter = useMusic((state) => state.sourceFilter)
  const query = useMusic((state) => state.query)
  const setScope = useMusic((state) => state.setScope)
  const loading = useMusic((state) => state.loading)
  const groups = useMemo(
    () => buildGroups(sourceFilter === 'all' ? tracks : tracks.filter((entry) => entry.source === sourceFilter), kind)
      .filter((group) => groupMatchesQuery(group, query)),
    [tracks, kind, query, sourceFilter],
  )
  if (!loading && !tracks.length) return <Empty art='search' title={t('music.no_tracks')} compact />
  if (!loading && !groups.length) return <Empty art='search' title={t(query.trim() ? 'music.no_results' : 'music.no_tracks')} compact />
  return (
    <div className={GROUP_GRID_CLASS}>
      {groups.map((group) => (
        <GroupCard key={group.key} group={group} kind={kind} onOpen={() => setScope(groupScopeOf(kind, group))} />
      ))}
    </div>
  )
})

function GroupCard({ group, kind, onOpen }: { group: MusicGroup; kind: MusicGroupKind; onOpen: () => void }) {
  return (
    <button
      type='button'
      onClick={onOpen}
      className='flex min-w-0 flex-col gap-1.5 rounded-[var(--r-lg)] p-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]'
    >
      <MusicArtwork url={group.coverUrl} alt='' className='aspect-square w-full rounded-[var(--r-md)]' iconSize={28} />
      <span className='truncate text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>{groupNameLabel(group, kind)}</span>
      <span className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {kind === 'albums' ? group.artist || t('music.unknown_artist') : t('music.group_track_count', { value0: group.trackIds.length })}
      </span>
    </button>
  )
}

function groupNameLabel(group: MusicGroup, kind: MusicGroupKind): string {
  if (group.name) return group.name
  return kind === 'albums' ? t('music.unknown_album') : t('music.unknown_artist')
}

// The drilled-down album/artist list is the ordinary track list; this header restores
// the group context and the way back that a plain list would not offer.
export const MusicGroupDetailHeader = memo(function MusicGroupDetailHeader({ scope }: { scope: Extract<MusicScope, { kind: 'album' | 'artist' }> }) {
  const setScope = useMusic((state) => state.setScope)
  const playCollection = useMusic((state) => state.playCollection)
  const tracks = useVisibleTracks()
  const title = scope.kind === 'album'
    ? scope.album || t('music.unknown_album')
    : scope.artist || t('music.unknown_artist')
  const durationMs = tracks.reduce((sum, track) => sum + track.durationMs, 0)
  return (
    <div className='flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <IconButton
        label={t('music.group_back')}
        size='sm'
        onClick={() => setScope(scope.kind === 'album' ? { kind: 'albums' } : { kind: 'artists' })}
      >
        <ChevronLeft size={14} />
      </IconButton>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>{title}</div>
        <div className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {scope.kind === 'album' && scope.artist ? scope.artist : t('music.group_detail_meta', { value0: tracks.length, value1: formatTotalDuration(durationMs) })}
        </div>
      </div>
      <Button size='sm' variant='primary' icon={<Play size={12} />} disabled={!tracks.length} onClick={() => void playCollection(tracks.map((track: MusicTrack) => track.id))}>
        {t('music.play_all')}
      </Button>
    </div>
  )
})
