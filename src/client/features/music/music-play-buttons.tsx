import { ListOrdered, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { IconButton, Spinner } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useCurrentTrack, useMusic } from './music-store'

// REF-3: the shared icon button tops out at 40px on a phone, under the 44px a thumb
// needs. `touchTarget` lifts this row to that floor on the narrow layouts only — the
// desktop rows keep the compact size they were designed for.
export const TOUCH_TARGET_CLASS = 'min-h-11 min-w-11'

export function MusicPlayButtons({ size = 'md', showMode = true, touchTarget = false }: {
  size?: 'sm' | 'md' | 'lg'
  showMode?: boolean
  touchTarget?: boolean
}) {
  const track = useCurrentTrack()
  const isPlaying = useMusic((state) => state.isPlaying)
  const streamLoading = useMusic((state) => state.streamLoading)
  const mode = useMusic((state) => state.mode)
  const togglePlay = useMusic((state) => state.togglePlay)
  const playNext = useMusic((state) => state.playNext)
  const playPrevious = useMusic((state) => state.playPrevious)
  const cycleMode = useMusic((state) => state.cycleMode)
  const disabled = !track

  return (
    <div className='flex items-center gap-0.5'>
      {showMode && (
        <Tooltip label={playModeLabel(mode)} side='top'>
          <IconButton label={playModeLabel(mode)} size={size} className={cn(touchTarget && TOUCH_TARGET_CLASS)} onClick={cycleMode}>
            <PlayModeIcon mode={mode} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip label={t('music.previous')} side='top'>
        <IconButton label={t('music.previous')} size={size} disabled={disabled} className={cn(touchTarget && TOUCH_TARGET_CLASS)} onClick={() => void playPrevious()}>
          <SkipBack size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={isPlaying ? t('music.pause') : t('music.play')} side='top'>
        <IconButton
          label={isPlaying ? t('music.pause') : t('music.play')}
          size={size}
          variant='primary'
          disabled={streamLoading}
          className={cn(touchTarget && TOUCH_TARGET_CLASS)}
          onClick={() => void togglePlay()}
        >
          {streamLoading ? <Spinner size={13} /> : isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.next')} side='top'>
        <IconButton label={t('music.next')} size={size} disabled={disabled} className={cn(touchTarget && TOUCH_TARGET_CLASS)} onClick={() => void playNext()}>
          <SkipForward size={14} />
        </IconButton>
      </Tooltip>
    </div>
  )
}

export function playModeLabel(mode: string): string {
  if (mode === 'repeat-all') return t('music.mode_repeat_all')
  if (mode === 'repeat-one') return t('music.mode_repeat_one')
  if (mode === 'shuffle') return t('music.mode_shuffle')
  return t('music.mode_order')
}

export function PlayModeIcon({ mode }: { mode: string }) {
  if (mode === 'repeat-one') return <Repeat1 size={14} />
  if (mode === 'repeat-all') return <Repeat size={14} />
  if (mode === 'shuffle') return <Shuffle size={14} />
  return <ListOrdered size={14} />
}