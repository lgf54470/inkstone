import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { MusicTrack, Tag } from '@shared/types'
import { TagPill } from '../../components/tag-pill'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { tagRowsById } from './music-tag-rows'

const TrackTagRowsContext = createContext<ReadonlyMap<string, Tag> | null>(null)

// Rows and cards are three levels below the list, so the map travels by context
// instead of by prop: one tree resolution per library render, not one per row.
export function MusicTagRowsProvider({ children }: { children: ReactNode }) {
  const tags = useMusic((state) => state.tags)
  const rows = useMemo(() => tagRowsById(tags), [tags])
  return <TrackTagRowsContext.Provider value={rows}>{children}</TrackTagRowsContext.Provider>
}

// Outside a provider the pills would silently vanish, so a lone row still
// resolves its own map instead of rendering nothing.
function useTagRows(): ReadonlyMap<string, Tag> {
  const shared = useContext(TrackTagRowsContext)
  const tags = useMusic((state) => state.tags)
  return useMemo(() => shared ?? tagRowsById(tags), [shared, tags])
}

export function MusicTrackTags({ track, max, className }: {
  track: MusicTrack
  max?: number
  className?: string
}) {
  const tagRows = useTagRows()
  const pills = useMemo(
    () => track.tagIds.map((id) => tagRows?.get(id)).filter((row): row is Tag => Boolean(row)),
    [tagRows, track.tagIds],
  )
  const setScope = useMusic((state) => state.setScope)
  const patchTrack = useMusic((state) => state.patchTrack)
  if (!pills.length) return null
  const shown = max ? pills.slice(0, max) : pills
  const hiddenCount = pills.length - shown.length
  return (
    <div className={cn('flex min-w-0 items-center gap-1 overflow-hidden', className)}>
      {shown.map((tag) => (
        <TagPill
          key={tag.id}
          tag={tag.name}
          color={tag.color}
          size='sm'
          removable
          removeLabel={t('music.remove_tag')}
          onClick={(event) => {
            event?.stopPropagation()
            setScope({ kind: 'tag', tagId: tag.id })
          }}
          onRemove={(event) => {
            event?.stopPropagation()
            void patchTrack(track.id, { tagIds: track.tagIds.filter((id) => id !== tag.id) })
          }}
        />
      ))}
      {hiddenCount > 0 && (
        <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>+{hiddenCount}</span>
      )}
    </div>
  )
}
