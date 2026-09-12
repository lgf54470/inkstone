import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '../../components/form'
import { IconButton } from '../../components/primitives'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { MusicQueueList } from './music-queue-list'

export function MusicQueueBrowser({ className }: { className?: string }) {
  const tracks = useMusic((state) => state.tracks)
  const queue = useMusic((state) => state.queue)
  const [query, setQuery] = useState('')

  const ids = useMemo(() => filterQueueIds(tracks, queue, query), [tracks, queue, query])

  return (
    <div className={cn('flex flex-col', className)}>
      <div className='relative shrink-0 pb-1.5'>
        <Input
          leading={<Search size={12} className='text-[var(--text-quaternary)]' />}
          trailing={query
            ? <IconButton label={t('music.search_clear')} size='sm' onClick={() => setQuery('')}><X size={12} /></IconButton>
            : undefined}
          value={query}
          aria-label={t('music.queue_search')}
          placeholder={t('music.queue_search')}
          className='h-7 text-[length:var(--text-11)]'
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <MusicQueueList
        ids={ids}
        className='min-h-0 flex-1 overflow-y-auto'
        emptyText={query.trim() ? t('music.no_queue_match') : t('music.queue_empty')}
      />
    </div>
  )
}

function filterQueueIds(
  tracks: { id: string; title: string; artist: string; album: string }[],
  queue: string[],
  query: string,
): string[] {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return queue
  const byId = new Map(tracks.map((track) => [track.id, track]))
  return queue.filter((id) => {
    const track = byId.get(id)
    if (!track) return false
    return (track.title + ' ' + track.artist + ' ' + track.album).toLowerCase().includes(keyword)
  })
}
