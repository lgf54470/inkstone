import { useEffect, useRef } from 'react'
import { isVideoMime } from '../../lib/music-media'
import type { BlogMusicTrack } from '../../lib/types'
import { claimVideoStage } from './music-player'

/**
 * 片段的画面：元素归 store 所有，UI 只是把一只盒子借给它看。
 * 展开卡片收起时元素被交还给 store，下一次展开再重新借出，播放本身不受影响。
 */
export function MusicVideoStage({ track, className = '' }: { track: BlogMusicTrack | null; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const isVideo = isVideoMime(track?.mime)
  useEffect(() => {
    const host = hostRef.current
    if (!isVideo || !host) return
    return claimVideoStage(host)
  }, [isVideo])
  if (!isVideo) return null
  return <div ref={hostRef} className={`music-video-stage overflow-hidden bg-[var(--bg-inset)] ${className}`} />
}
