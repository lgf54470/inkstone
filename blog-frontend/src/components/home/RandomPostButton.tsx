import { useRef, useState, type ReactElement } from 'react'
import { Dices, Loader2 } from 'lucide-react'
import { api } from '../../lib/api'
import { t, DEFAULT_LOCALE, type BlogLocale } from '../../lib/i18n'

interface RandomPostButtonProps {
  locale?: BlogLocale
  /** 跳转函数可注入以便测试；默认真实导航 */
  navigate?: (url: string) => void
}

type PickerState = 'idle' | 'loading' | 'failed'

/** 抽取状态与两次取数：先问 totalPages，再随机一页取一篇，失败只说这次没成（BF-1）。 */
function useRandomPick(navigate: (url: string) => void): { state: PickerState; pick: () => Promise<void> } {
  const [state, setState] = useState<PickerState>('idle')
  const busyRef = useRef(false)

  const pick = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setState('loading')
    try {
      const first = await api.getPosts({ page: 1, limit: 1 })
      if (first.totalPages < 1) return
      const page = 1 + Math.floor(Math.random() * first.totalPages)
      const picked = await api.getPosts({ page, limit: 1 })
      const post = picked.posts[0]
      if (post) navigate(`/posts/${post.slug}`)
    } catch (err) {
      // DegradedBanner 说明全站状态，这里只说明这次点击没成
      console.warn('[RandomPostButton] could not pick a post:', err)
      setState('failed')
    } finally {
      busyRef.current = false
      setState((prev) => (prev === 'failed' ? prev : 'idle'))
    }
  }

  return { state, pick }
}

// 随机文章按钮：取数失败就是失败，不拿一篇演示文章假装抽到了；抽取期间禁止重复点击。
export default function RandomPostButton({
  locale = DEFAULT_LOCALE,
  navigate = (url) => {
    window.location.assign(url)
  },
}: RandomPostButtonProps): ReactElement {
  const { state, pick } = useRandomPick(navigate)
  const loading = state === 'loading'
  const label = loading ? t('random.loading', {}, locale) : state === 'failed' ? t('random.failed', {}, locale) : t('random.button', {}, locale)

  return (
    <button
      type='button'
      onClick={() => void pick()}
      disabled={loading}
      className='w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] hover:bg-[var(--accent-softer)] transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait'
    >
      {loading ? (
        <Loader2 className='w-3.5 h-3.5 animate-spin' aria-hidden='true' />
      ) : (
        <Dices className='w-3.5 h-3.5' aria-hidden='true' />
      )}
      <span>{label}</span>
    </button>
  )
}
