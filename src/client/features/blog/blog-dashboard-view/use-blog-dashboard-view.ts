import { useEffect, useState } from 'react'
import type { BlogGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../../lib/api'
import { useLocale } from '../../../lib/i18n'
import { useBlogStore } from '../blog-store'
import { blogFrontendBase } from '../frontend-base'

export function useBlogDashboardView() {
  const locale = useLocale()
  const stats = useBlogStore((s) => s.stats)
  const posts = useBlogStore((s) => s.posts)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const loadAll = useBlogStore((s) => s.loadAll)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)
  // The three traffic switches live in the store, which the toolbar popover and the settings dialog
  // also write. The dashboard used to keep its own `excludeBots` and send only that one, so a switch
  // flipped anywhere else changed nothing here — and the store's own copies changed nothing anywhere.
  const excludeBots = useBlogStore((s) => s.excludeBots)
  const excludeSelfReferrers = useBlogStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useBlogStore((s) => s.excludeOwner)
  const setFilters = useBlogStore((s) => s.setFilters)

  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [analytics, setAnalytics] = useState<BlogGlobalAnalytics | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const frontendBase = blogFrontendBase(settings?.frontendUrl)
  const pendingComments = comments.filter((c) => c.status === 'pending')
  const switches = { excludeBots, excludeSelfReferrers, excludeOwner }

  const loadData = () => loadAnalytics(range, switches, setLoading, setAnalytics)

  const handleRefresh = async () => {
    await Promise.all([loadData(), loadAll()])
  }

  useEffect(() => {
    void loadData()
    // The switches are read here rather than captured: a change to any of them is a new question for
    // the same endpoint.
  }, [range, excludeBots, excludeSelfReferrers, excludeOwner])

  const derived = dashboardDerivedValues(analytics, metricMode, switches)

  return {
    stats, posts, comments, settings, loadAll, updateCommentStatus, locale,
    range, setRange, metricMode, setMetricMode,
    excludeBots, excludeSelfReferrers, excludeOwner,
    setExcludeBots: (next: boolean) => setFilters({ excludeBots: next }),
    analytics, loading,
    frontendBase, pendingComments, handleRefresh,
    ...derived,
  }
}

/**
 * What the payload means under the switches. A number only counts as filtered when the switch hiding
 * it is on: the server reports all three regardless, and the banner that reads these is describing
 * what is not in the chart above it.
 */
function dashboardDerivedValues(
  analytics: BlogGlobalAnalytics | null,
  metricMode: 'views' | 'visitors',
  switches: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean },
) {
  const timelinePoints = analytics?.timeline || []
  const filterStats = analytics?.filterStats
  const filteredVisitorTraffic = {
    bots: switches.excludeBots ? (filterStats?.bots ?? 0) : 0,
    self: switches.excludeSelfReferrers ? (filterStats?.selfReferrals ?? 0) : 0,
    owner: switches.excludeOwner ? (filterStats?.owner ?? 0) : 0,
  }
  return {
    timelinePoints,
    chartValues: timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors)),
    filteredBots: filteredVisitorTraffic.bots,
    filteredVisitorTraffic,
  }
}

async function loadAnalytics(
  selectedRange: ShareTimelineRange,
  switches: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean },
  setLoading: (v: boolean) => void,
  setAnalytics: (v: BlogGlobalAnalytics | null) => void,
): Promise<void> {
  setLoading(true)
  try {
    const res = await api.blog.analytics(selectedRange, {
      excludeBots: switches.excludeBots,
      excludeSelf: switches.excludeSelfReferrers,
      excludeOwner: switches.excludeOwner,
    })
    setAnalytics(res.analytics)
  } catch (err) {
    console.error('Failed to load blog analytics:', err)
  } finally {
    setLoading(false)
  }
}