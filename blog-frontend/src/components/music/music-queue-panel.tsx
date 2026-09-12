import { Pause, Play } from 'lucide-react'
import { t, type BlogLocale } from '../../lib/i18n'
import { playTrack, useMusicPlayer } from './music-player'

/** 悬浮播放器内嵌的队列列表，顺序与当前筛选结果一致；只读播放，不提供移除与清空 */
export default function MusicQueuePanel({ locale }: { locale: BlogLocale }) {
  const state = useMusicPlayer()
  return (
    <div className='flex max-h-64 min-h-0 shrink-0 flex-col border-t border-[var(--border-subtle)]'>
      <div className='px-2.5 py-1.5'>
        <span className='text-[length:var(--text-11)] font-medium text-[var(--text-secondary)]'>
          {t('music.queue_count', { count: state.queue.length }, locale)}
        </span>
      </div>
      {state.queue.length === 0
        ? <p className='px-2.5 pb-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.queue_empty', {}, locale)}</p>
        : (
          <ol className='min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5'>
            {state.queue.map((id, index) => <QueueRow key={id} id={id} index={index} locale={locale} />)}
          </ol>
        )}
    </div>
  )
}

function QueueIndex({ current, playing, index }: { current: boolean; playing: boolean; index: number }) {
  if (current) return playing ? <Pause size={11} aria-hidden='true' /> : <Play size={11} aria-hidden='true' />
  return <span className='text-[length:var(--text-10)] tabular-nums text-[var(--text-quaternary)]'>{index + 1}</span>
}

function QueueRow({ id, index, locale }: { id: string; index: number; locale: BlogLocale }) {
  const state = useMusicPlayer()
  const track = state.tracks.find((entry) => entry.id === id)
  const isCurrent = id === state.currentId
  return (
    <li>
      <button
        type='button'
        aria-current={isCurrent ? 'true' : undefined}
        aria-label={track ? track.title : t('music.unknown_artist', {}, locale)}
        onClick={() => playTrack(id)}
        className={`flex w-full items-center gap-2 rounded-[var(--r-sm)] px-1.5 py-1 text-left transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-hover)] ${isCurrent ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'}`}
      >
        <span className='flex size-4 shrink-0 items-center justify-center'>
          <QueueIndex current={isCurrent} playing={state.playing} index={index} />
        </span>
        <span className='min-w-0 flex-1 truncate text-[length:var(--text-11)]'>{track?.title ?? ''}</span>
        <span className='max-w-20 min-w-0 shrink-0 truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{track?.artist || ''}</span>
      </button>
    </li>
  )
}
