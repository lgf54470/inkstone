import { useEffect, useState } from 'react'
import { GripVertical, Heart, Library, ListMusic, Maximize2, Minimize2 } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { clampToViewport, useCardDrag, useMeasuredSize } from './music-drag'
import { useCurrentTrack, useMusic } from './music-store'
import { MusicArtwork } from './music-artwork'
import { MusicFloatingLyrics } from './music-floating-lyrics'
import { MusicPlayButtons } from './music-play-buttons'
import { MusicQueueBrowser } from './music-queue-browser'
import { MusicSeekBar } from './music-seek-bar'
import {
  MusicModeButton, MusicNudgeButton, MusicRateButton, MusicSleepButton, MusicSleepStatus, MusicVolumeSlider,
} from './music-transport-widgets'
import { MusicVisualizer } from './music-visualizer'

const CARD_WIDTH = 288
const CARD_HEIGHT_FALLBACK = 200
const RING_SIZE = 56
const RING_RADIUS = 25
const RING_STROKE = 2
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

export function MusicFloatingPlayer() {
  const visible = useMusic((state) => state.floatingVisible)
  const collapsed = useMusic((state) => state.floatingCollapsed)
  const position = useMusic((state) => state.floatingPosition)
  const setFloatingPosition = useMusic((state) => state.setFloatingPosition)
  const [queueOpen, setQueueOpen] = useState(false)
  const { ref: cardRef, size } = useMeasuredSize({ width: CARD_WIDTH, height: CARD_HEIGHT_FALLBACK })
  const drag = useCardDrag(position, size, setFloatingPosition)
  const expandedFromBadge = !collapsed && position !== null

  useEffect(() => {
    if (!expandedFromBadge) return
    const next = clampToViewport(position.x, position.y, size.width, size.height)
    if (next.x !== position.x || next.y !== position.y) setFloatingPosition(next)
  }, [expandedFromBadge, position, size.width, size.height, setFloatingPosition])

  if (!visible) return null
  if (collapsed) return <CollapsedBadge drag={drag} cardRef={cardRef} />

  return (
    <aside
      ref={cardRef}
      aria-label={t('music.mini_player')}
      style={drag.style}
      className={cn(
        'absolute z-[var(--z-float)] flex w-72 flex-col overflow-hidden rounded-[var(--r-lg)]',
        'border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-float)]',
        !position && 'right-3 bottom-[calc(64px+env(safe-area-inset-bottom))] md:right-4 md:bottom-4',
      )}
    >
      <FloatHeader drag={drag} />
      <FloatTrack />
      <MusicFloatingLyrics />
      <div className='shrink-0 px-2.5 pb-1'>
        <MusicVisualizer className='h-6 w-full' />
      </div>
      <FloatProgress />
      <FloatTransport queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((value) => !value)} />
      <FloatExtras />
      {queueOpen && (
        <MusicQueueBrowser className='max-h-72 shrink-0 border-t border-[var(--border-subtle)] p-2' />
      )}
    </aside>
  )
}

function CollapsedBadge({ drag, cardRef }: {
  drag: ReturnType<typeof useCardDrag>
  cardRef: (node: HTMLElement | null) => void
}) {
  const track = useCurrentTrack()
  const isPlaying = useMusic((state) => state.isPlaying)
  const currentTime = useMusic((state) => state.currentTimeMs)
  const duration = useMusic((state) => state.durationMs)
  const toggleCollapsed = useMusic((state) => state.toggleFloatingCollapsed)
  const setPosition = useMusic((state) => state.setFloatingPosition)
  return (
    <button
      ref={cardRef}
      type='button'
      style={drag.style}
      onPointerDown={drag.startDrag}
      onKeyDown={drag.onKeyDown}
      onClick={() => { if (!drag.isClickAfterDrag()) toggleCollapsed() }}
      aria-label={t('music.expand_mini_player')}
      className={cn(
        'absolute z-[var(--z-float)] flex size-14 items-center justify-center overflow-hidden rounded-full',
        'border border-[var(--border-default)] bg-[var(--bg-overlay)] shadow-[var(--shadow-float)]',
        'cursor-grab transition-transform active:scale-95',
        drag.isDragging && 'cursor-grabbing',
        !drag.style && 'right-4 bottom-[calc(64px+env(safe-area-inset-bottom))] md:bottom-4',
      )}
      onDoubleClick={() => setPosition(useMusic.getState().floatingPosition ?? { x: window.innerWidth - 120, y: window.innerHeight - 120 })}
    >
      <BadgeRing progress={track && duration ? Math.min(1, currentTime / duration) : 0} />
      <MusicArtwork url={track?.coverUrl ?? null} alt={track?.title ?? ''} className='absolute inset-1.5 rounded-full' iconSize={18} />
      {isPlaying && (
        <span className='absolute right-0.5 bottom-0.5 size-3 rounded-full bg-[var(--success)] ring-2 ring-[var(--bg-overlay)]' aria-hidden='true' />
      )}
    </button>
  )
}

function BadgeRing({ progress }: { progress: number }) {
  return (
    <svg viewBox={'0 0 ' + RING_SIZE + ' ' + RING_SIZE} className='pointer-events-none absolute inset-0 size-full -rotate-90' aria-hidden='true'>
      <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill='none' stroke='var(--border-default)' strokeWidth={RING_STROKE} />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        r={RING_RADIUS}
        fill='none'
        stroke='var(--accent)'
        strokeWidth={RING_STROKE}
        strokeLinecap='round'
        strokeDasharray={RING_LENGTH}
        strokeDashoffset={RING_LENGTH * (1 - progress)}
      />
    </svg>
  )
}

function FloatHeader({ drag }: { drag: ReturnType<typeof useCardDrag> }) {
  const toggleCollapsed = useMusic((state) => state.toggleFloatingCollapsed)
  return (
    <div
      onPointerDown={drag.startDrag}
      className={cn('flex h-9 shrink-0 items-center gap-1.5 border-b border-[var(--border-subtle)] px-2.5', drag.isDragging ? 'cursor-grabbing' : 'cursor-grab')}
    >
      <span tabIndex={0} role='button' aria-label={t('music.drag_to_reorder')} onKeyDown={drag.onKeyDown} className='rounded p-0.5 text-[var(--text-quaternary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]'>
        <GripVertical size={13} />
      </span>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]'>
        {t('music.now_playing')}
      </span>
      <MusicSleepStatus />
      <Tooltip label={t('music.collapse_player')} side='top'>
        <IconButton label={t('music.collapse_player')} size='sm' onClick={toggleCollapsed}><Minimize2 size={13} /></IconButton>
      </Tooltip>
    </div>
  )
}

function FloatTrack() {
  const track = useCurrentTrack()
  const toggleFavorite = useMusic((state) => state.toggleFavorite)
  return (
    <div className='flex shrink-0 items-center gap-2.5 p-2.5'>
      <MusicArtwork url={track?.coverUrl ?? null} alt={track?.title ?? ''} className='size-14 rounded-[var(--r-md)]' iconSize={20} />
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {track?.title ?? t('music.nothing_playing')}
        </div>
        <div className='truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{track?.artist || t('music.unknown_artist')}</div>
        <div className='truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{track?.album || ''}</div>
      </div>
      {track && (
        <IconButton
          label={track.isFavorite ? t('music.unfavorite') : t('music.favorite')}
          size='sm'
          active={track.isFavorite}
          onClick={() => void toggleFavorite(track.id)}
        >
          <Heart size={12} className={track.isFavorite ? 'fill-current' : undefined} />
        </IconButton>
      )}
    </div>
  )
}

function FloatProgress() {
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const durationMs = useMusic((state) => state.durationMs)
  const seek = useMusic((state) => state.seek)
  return (
    <div className='shrink-0 px-2.5'>
      <MusicSeekBar valueMs={currentTimeMs} durationMs={durationMs} onSeek={seek} label={t('music.seek')} showTime />
    </div>
  )
}

function FloatTransport({ queueOpen, onToggleQueue }: { queueOpen: boolean; onToggleQueue: () => void }) {
  const queueLength = useMusic((state) => state.queue.length)
  return (
    <div className='flex shrink-0 items-center justify-center gap-0.5 py-1.5'>
      <MusicModeButton />
      <MusicNudgeButton direction='back' />
      <MusicPlayButtons size='sm' showMode={false} />
      <MusicNudgeButton direction='forward' />
      <span className='mx-1 h-4 w-px bg-[var(--border-subtle)]' aria-hidden='true' />
      <Tooltip label={t('music.queue')} side='top'>
        <IconButton label={t('music.queue')} size='sm' active={queueOpen} onClick={onToggleQueue}>
          <ListMusic size={14} />
        </IconButton>
      </Tooltip>
      <span className={cn('tabular shrink-0 text-[length:var(--text-11)]', queueOpen ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)]')}>
        {queueLength > 99 ? '99+' : queueLength}
      </span>
    </div>
  )
}

function FloatExtras() {
  const openHub = (): void => useUi.getState().openPanel('music-hub')
  const setImmersive = useMusic((state) => state.setImmersive)
  return (
    <div className='flex shrink-0 items-center gap-0.5 px-2.5 pb-2.5'>
      <MusicVolumeSlider className='min-w-0 flex-1' />
      <MusicRateButton />
      <MusicSleepButton />
      <Tooltip label={t('music.immersive')} side='top'>
        <IconButton label={t('music.immersive')} size='sm' onClick={() => setImmersive(true)}><Maximize2 size={14} /></IconButton>
      </Tooltip>
      <Tooltip label={t('music.open_hub')} side='top'>
        <IconButton label={t('music.open_hub')} size='sm' onClick={openHub}><Library size={14} /></IconButton>
      </Tooltip>
    </div>
  )
}
