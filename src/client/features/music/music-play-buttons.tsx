import { ListOrdered, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { IconButton, Spinner } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useCurrentTrack, useMusic } from './music-store'

export function MusicPlayButtons({ size = 'md', showMode = true }: { size?: 'sm' | 'md' | 'lg'; showMode?: boolean }) {
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
          <IconButton label={playModeLabel(mode)} size={size} onClick={cycleMode}>
            <PlayModeIcon mode={mode} />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip label={t('music.previous')} side='top'>
        <IconButton label={t('music.previous')} size={size} disabled={disabled} onClick={() => void playPrevious()}>
          <SkipBack size={14} />
        </IconButton>
      </Tooltip>
      <Tooltip label={isPlaying ? t('music.pause') : t('music.play')} side='top'>
        <IconButton
          label={isPlaying ? t('music.pause') : t('music.play')}
          size={size}
          variant='primary'
          disabled={streamLoading}
          onClick={() => void togglePlay()}
        >
          {streamLoading ? <Spinner size={13} /> : isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </IconButton>
      </Tooltip>
      <Tooltip label={t('music.next')} side='top'>
        <IconButton label={t('music.next')} size={size} disabled={disabled} onClick={() => void playNext()}>
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