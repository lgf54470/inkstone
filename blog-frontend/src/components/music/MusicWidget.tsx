import { useEffect } from 'react'
import { useCurrentLocale, type BlogLocale } from '../../lib/i18n'
import MusicCenterModal from './MusicCenterModal'
import MusicFloatingPlayer from './MusicFloatingPlayer'
import { loadMusicLibrary, useMusicPlayer } from './music-player'

/** 博客前台音乐岛：库未公开或为空时整体不渲染，避免出现点不动的入口 */
export default function MusicWidget({ initialLocale }: { initialLocale?: BlogLocale }) {
  const locale = useCurrentLocale(initialLocale)
  const state = useMusicPlayer()

  useEffect(() => {
    void loadMusicLibrary()
  }, [])

  if (state.status !== 'ready' || state.tracks.length === 0) return null
  return (
    <>
      <MusicFloatingPlayer locale={locale} />
      <MusicCenterModal locale={locale} />
    </>
  )
}
