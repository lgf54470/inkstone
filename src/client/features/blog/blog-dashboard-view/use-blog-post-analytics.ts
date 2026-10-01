import { useEffect, useRef, useState } from 'react'
import type { BlogPostAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../../lib/api'
import { useBlogStore } from '../blog-store'

type PostAnalyticsFilters = { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }

/**
 * One post's analytics for the drilldown (FEA-09). The range and the three traffic switches are the
 * dashboard's own: a post's panel that silently asked with different filters would disagree with the
 * card the author clicked to get here. Each new question aborts the one before it, so a slow answer
 * for a previous range cannot land on the panel drawn for the new one.
 */
export function useBlogPostAnalytics(open: boolean, postId: string | null) {
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [data, setData] = useState<BlogPostAnalytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const excludeBots = useBlogStore((s) => s.excludeBots)
  const excludeSelfReferrers = useBlogStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useBlogStore((s) => s.excludeOwner)
  const filters = { excludeBots, excludeSelf: excludeSelfReferrers, excludeOwner }

  const load = async (selectedRange: ShareTimelineRange = range) => {
    if (!postId) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setFailed(false)
    const result = await fetchPostAnalytics(postId, selectedRange, filters, controller.signal)
    if (controller.signal.aborted) return
    setData(result)
    setFailed(result === null)
    setLoading(false)
  }

  useEffect(() => {
    if (!open || !postId) return undefined
    setData(null)
    void load(range)
    return () => requestRef.current?.abort()
    // The dependencies are the question itself: another range or another traffic switch is a new
    // question for the same endpoint, and `load` reads them fresh each time.
  }, [open, postId, range, excludeBots, excludeSelfReferrers, excludeOwner])

  return {
    range,
    setRange,
    metricMode,
    setMetricMode,
    data,
    loading,
    failed,
    reload: () => void load(range),
  }
}

/** `null` means the answer never arrived; the abort case is left to the caller's signal check. */
async function fetchPostAnalytics(
  postId: string,
  range: ShareTimelineRange,
  filters: PostAnalyticsFilters,
  signal: AbortSignal,
): Promise<BlogPostAnalytics | null> {
  try {
    const res = await api.blog.postAnalytics(postId, range, filters, signal)
    return res.analytics
  } catch (err) {
    console.error('[blog] failed to load post analytics:', err)
    return null
  }
}
