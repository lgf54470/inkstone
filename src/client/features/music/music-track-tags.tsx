import type { MusicTrack } from '@shared/types'
import { TagPill } from '../../components/tag-pill'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { useTrackTagPills } from './music-tag-rows'

export function MusicTrackTags({ track, max, className }: {
  track: MusicTrack
  max?: number
  className?: string
}) {
  const pills = useTrackTagPills(track.tagIds)
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
