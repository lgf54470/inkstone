import { useMemo } from 'react'
import { activeLyricWindow, parseLyric } from './music-lyrics'
import { currentMusicTrack, useMusicPlayer } from './music-player'

/** 两行歌词与小控件同高；博客前台没有沉浸式播放器，整块只读 */
export default function MusicFloatingLyrics() {
  const state = useMusicPlayer()
  const track = currentMusicTrack(state)
  const lines = useMemo(() => parseLyric(track?.lyric), [track?.lyric])
  const active = activeLyricWindow(lines, state.timeMs)
  if (!lines.length || !active.current) return null
  return (
    <div className='mx-2.5 mb-1 flex shrink-0 flex-col gap-0.5 rounded-[var(--r-sm)] bg-[var(--bg-inset)] px-2 py-1.5'>
      <span className='truncate text-[length:var(--text-11)] font-medium text-[var(--accent)]'>{active.current}</span>
      {active.next && <span className='truncate text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{active.next}</span>}
    </div>
  )
}
