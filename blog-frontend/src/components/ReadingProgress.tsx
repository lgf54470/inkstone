import { useEffect, useState, type ReactElement } from 'react'
import { t, useCurrentLocale, type BlogLocale } from '../lib/i18n'

interface ReadingProgressProps {
  initialLocale?: BlogLocale
}

// 文章页阅读进度条：按窗口滚动比例缩放填充，接近顶部时隐藏；点击回到顶部。
// rAF 节流避免高频 scroll 事件直接触发 React 重渲染。
export default function ReadingProgress({ initialLocale }: ReadingProgressProps): ReactElement {
  const locale = useCurrentLocale(initialLocale)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let rafId = 0
    const update = () => {
      rafId = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0)
    }
    const onScroll = () => {
      if (rafId === 0) rafId = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (rafId !== 0) cancelAnimationFrame(rafId)
    }
  }, [])

  const visible = progress > 0.01
  return (
    <button
      type='button'
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      role='progressbar'
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label={t('post.reading_progress', {}, locale)}
      className={`fixed top-0 left-0 right-0 z-50 h-0.5 bg-[var(--accent)] transition-opacity duration-[var(--dur-fast)] cursor-pointer ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{ transform: `scaleX(${progress})`, transformOrigin: 'left' }}
    />
  )
}