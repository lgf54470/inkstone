import { useEffect, useRef } from 'react'
import type { MusicTrack } from '@shared/types'
import { isVideoMime } from '@shared/music-media'
import { cn } from '../../lib/cn'
import { claimMediaStage } from './media-stage'

// The element that carries a video track belongs to the engine, so a surface only lends it a box
// to be seen in: unmounting on a breakpoint change hands the picture back instead of rebuilding
// the player in the middle of playback. The element is created in JS and carries no classes of
// its own, so styles/music.css reaches it through the kind marker the engine sets on it.
export function MusicVideoStage({
  track,
  className,
}: {
  track: MusicTrack | null
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const isVideo = isVideoMime(track?.mime)
  useEffect(() => {
    const host = hostRef.current
    if (!isVideo || !host) return
    return claimMediaStage(host)
  }, [isVideo])
  if (!isVideo) return null
  return <div ref={hostRef} className={cn('music-video-stage overflow-hidden bg-[var(--bg-inset)]', className)} />
}
