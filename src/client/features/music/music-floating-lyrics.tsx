import { useMemo } from 'react'
import { t } from '../../lib/i18n'
import { useCurrentTrack, useMusic } from './music-store'
import { activeLyricIndex, parseLyric } from './music-utils'

// Two lines are enough for a 288px widget; the immersive player shows the whole scroll.
export function MusicFloatingLyrics() {
  const track = useCurrentTrack()
  const currentTimeMs = useMusic((state) => state.currentTimeMs)
  const setImmersive = useMusic((state) => state.setImmersive)
  const lines = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const activeIndex = activeLyricIndex(lines, currentTimeMs)
  if (!lines.length) return null
  const current = lines[Math.max(0, activeIndex)] ?? lines[0]
  const next = lines[Math.max(0, activeIndex) + 1]
  return (
    <button
      type='button'
      onClick={() => setImmersive(true)}
      aria-label={t('music.open_lyrics')}
      className='mx-2.5 mb-1 flex shrink-0 flex-col gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]'
    >
      <span className='truncate text-[length:var(--text-11)] font-medium text-[var(--accent)]'>{current?.text}</span>
      {next && <span className='truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{next.text}</span>}
    </button>
  )
}
