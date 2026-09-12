import type { MusicTrack } from '@shared/types'
import { t } from '../../lib/i18n'
import { MusicTrackRow, type TrackRowHandlers } from './music-track-row'
import { MusicTrackMenu, type TrackMenuTarget } from './music-track-menu'
import { useContextMenu } from '../../components/overlay'
import { memo, useState, useCallback } from 'react'

export const MusicTrackTable = memo(function MusicTrackTable({
  tracks,
  currentId,
  playback,
  selectedIds,
  handlers,
  onEdit,
}: {
  tracks: MusicTrack[]
  currentId: string | null
  playback: { isPlaying: boolean; isStreamLoading: boolean }
  selectedIds: string[]
  handlers: TrackRowHandlers
  onEdit: (track: MusicTrack) => void
}) {
  const contextMenu = useContextMenu()
  const [menuTarget, setMenuTarget] = useState<TrackMenuTarget | null>(null)

  const handleContextMenu = useCallback((event: React.MouseEvent, target: TrackMenuTarget) => {
    setMenuTarget(target)
    contextMenu.onContextMenu(event)
  }, [contextMenu])

  const closeMenu = useCallback(() => {
    setMenuTarget(null)
    contextMenu.close()
  }, [contextMenu])

  return (
    <div role='table' aria-label={t('music.tracks')} className='flex min-h-0 flex-1 flex-col'>
      <TableHeader />
      <div role='rowgroup' className='min-h-0 flex-1 overflow-y-auto p-2'>
        {tracks.map((track, index) => (
          <MusicTrackRow
            key={track.id}
            track={track}
            index={index}
            isCurrent={track.id === currentId}
            isPlaying={playback.isPlaying}
            isStreamLoading={playback.isStreamLoading}
            isSelected={selectedIds.includes(track.id)}
            handlers={{ ...handlers, onContextMenu: handleContextMenu }}
          />
        ))}
      </div>
      <MusicTrackMenu
        target={menuTarget}
        anchor={contextMenu.point ?? { x: 0, y: 0 }}
        open={Boolean(contextMenu.point) && Boolean(menuTarget)}
        onClose={closeMenu}
        onEdit={onEdit}
      />
    </div>
  )
})

function TableHeader() {
  return (
    <div role='row' className='flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2 pb-1.5 text-[length:var(--text-10)] font-medium tracking-[var(--tracking-label)] text-[var(--text-quaternary)] uppercase'>
      <span className='w-5 shrink-0 text-center'>{t('music.table_index')}</span>
      <span className='size-9 shrink-0' aria-hidden='true' />
      <span className='min-w-0 flex-1'>{t('music.table_title')}</span>
      <span className='hidden w-40 shrink-0 xl:block'>{t('music.table_album')}</span>
      <span className='hidden w-16 shrink-0 sm:block'>{t('music.source')}</span>
      <span className='w-11 shrink-0 text-right'>{t('music.table_duration')}</span>
      <span className='w-6 shrink-0' aria-hidden='true' />
      <span className='w-6 shrink-0' aria-hidden='true' />
    </div>
  )
}
