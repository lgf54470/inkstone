import { useRef, useState, type ReactElement } from 'react'
import { Dices, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'

interface RandomPostButtonProps {
  locale?: BlogLocale
  /** 跳转函数可注入以便测试；默认真实导航 */
  navigate?: (url: string) => void
}

// 随机文章：先取 totalPages 再随机页取一篇（API 失败时走离线 fallback，
// totalPages=1，仍能抽到 fallback 文章），抽取期间禁止重复点击
export default function RandomPostButton({
  locale = DEFAULT_LOCALE,
  navigate = (url) => {
    window.location.assign(url)
  },
}: RandomPostButtonProps): ReactElement {
  const [loading, setLoading] = useState(false)
  const busyRef = useRef(false)

  const handleClick = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setLoading(true)
    try {
      const first = await api.getPosts({ page: 1, limit: 1 })
      if (first.totalPages < 1) return
      const page = 1 + Math.floor(Math.random() * first.totalPages)
      const picked = await api.getPosts({ page, limit: 1 })
      const post = picked.posts[0]
      if (post) navigate(`/posts/${post.slug}`)
    } finally {
      busyRef.current = false
      setLoading(false)
    }
  }

  return (
    <button
      type='button'
      onClick={() => void handleClick()}
      disabled={loading}
      className='w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-softer)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait'
    >
      {loading ? (
        <Loader2 className='w-3.5 h-3.5 animate-spin' aria-hidden='true' />
      ) : (
        <Dices className='w-3.5 h-3.5' aria-hidden='true' />
      )}
      <span>{loading ? t('random.loading', {}, locale) : t('random.button', {}, locale)}</span>
    </button>
  )
}