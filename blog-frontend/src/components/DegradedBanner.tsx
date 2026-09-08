import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { subscribeApiHealth } from '../lib/api'
import { t, useCurrentLocale, type BlogLocale } from '../lib/i18n'

interface DegradedBannerProps {
  initialLocale?: BlogLocale
}

/**
 * 顶部降级提示条：后端不可达或请求失败时展示，
 * 避免离线 fallback 内容（演示文章）被误认为实时数据。
 * 初始渲染恒为 null，避免与 SSR 输出产生水合不一致。
 */
export default function DegradedBanner({ initialLocale }: DegradedBannerProps) {
  const [degraded, setDegraded] = useState(false)
  const locale = useCurrentLocale(initialLocale)

  useEffect(() => subscribeApiHealth(setDegraded), [])

  if (!degraded) return null
  return (
    <div
      role='status'
      className='w-full flex items-center justify-center gap-1.5 bg-[var(--danger-soft)] border-b border-[var(--danger-border)] px-4 py-2 text-sm text-[var(--danger)]'
    >
      <TriangleAlert className='w-4 h-4 shrink-0' />
      <span>{t('degraded.banner', {}, locale)}</span>
    </div>
  )
}