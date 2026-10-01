import { useEffect, useState } from 'react'
import type { BlogGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../../lib/api'
import { useLocale } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { useBlogStore, type BlogStoreState } from '../blog-store'
import { blogFrontendBase } from '../frontend-base'
import { exportBlogDashboardCsv } from './blog-dashboard-export'

export function useBlogDashboardView() {
  const locale = useLocale()
  const stats = useBlogStore((s) => s.stats)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const loadHubData = useBlogStore((s) => s.loadHubData)
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
  const [analyticsError, setAnalyticsError] = useState<boolean>(false)
  const loadErrors = useBlogStore((s) => s.loadErrors)

  const frontendBase = blogFrontendBase(settings?.frontendUrl)
  const pendingComments = comments.filter((c) => c.status === 'pending')
  const switches = { excludeBots, excludeSelfReferrers, excludeOwner }

  const loadData = useAnalyticsLoad(range, switches, setLoading, setAnalytics, setAnalyticsError)

  const handleRefresh = async () => {
    await Promise.all([loadData(), loadHubData({ force: true })])
  }

  const derived = dashboardDerivedValues(analytics, metricMode, switches)
  const exportCsv = useDashboardExport({ analytics, range, locale, switches })

  return {
    stats, comments, settings, loadHubData, updateCommentStatus, locale, exportCsv,
    range, setRange, metricMode, setMetricMode,
    excludeBots, excludeSelfReferrers, excludeOwner,
    setExcludeBots: (next: boolean) => setFilters({ excludeBots: next }),
    analytics, loading,
    ...dashboardLoadStates(stats, analytics, analyticsError, loadErrors),
    frontendBase, pendingComments, handleRefresh,
    ...derived,
  }
}

/**
 * The CSV hand-over (FEA-09). The file describes the window currently on screen, so it is bound to
 * the same range and the same three switches the cards above it were drawn with.
 */
function useDashboardExport({
  analytics,
  range,
  locale,
  switches,
}: {
  analytics: BlogGlobalAnalytics | null
  range: ShareTimelineRange
  locale: string
  switches: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }
}): () => void {
  const toast = useUi((s) => s.toast)
  return () =>
    exportBlogDashboardCsv({
      analytics,
      range,
      filters: {
        excludeBots: switches.excludeBots,
        excludeSelf: switches.excludeSelfReferrers,
        excludeOwner: switches.excludeOwner,
      },
      locale,
      toast,
    })
}

/**
 * The analytics question is asked once per range or switch change. The switches are read in the
 * dependencies rather than captured in the closure: a change to any of them is a new question for
 * the same endpoint. Switching the range aborts the window being left behind — a rapid switch would
 * otherwise hold several aggregates in flight at once, and a late answer for the old range would
 * land on the chart drawn for the new one.
 */
function useAnalyticsLoad(
  range: ShareTimelineRange,
  switches: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean },
  setLoading: (v: boolean) => void,
  setAnalytics: (v: BlogGlobalAnalytics | null) => void,
  setAnalyticsError: (v: boolean) => void,
): (signal?: AbortSignal) => Promise<void> {
  const { excludeBots, excludeSelfReferrers, excludeOwner } = switches
  const loadData = (signal?: AbortSignal) =>
    loadAnalytics(range, switches, setLoading, setAnalytics, setAnalyticsError, signal)
  useEffect(() => {
    const controller = new AbortController()
    void loadData(controller.signal)
    return () => controller.abort()
  }, [range, excludeBots, excludeSelfReferrers, excludeOwner])
  return loadData
}

/**
 * A failed load with nothing on screen is its own state: a failed refresh over existing data keeps
 * drawing what it has, but an empty dashboard says the load failed instead of "no visitors yet".
 */
function dashboardLoadStates(
  stats: BlogStoreState['stats'],
  analytics: BlogGlobalAnalytics | null,
  analyticsError: boolean,
  loadErrors: BlogStoreState['loadErrors'],
) {
  return {
    analyticsFailed: analytics === null && analyticsError,
    statsFailed: stats === null && loadErrors.has('stats'),
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
  setError: (v: boolean) => void,
  signal?: AbortSignal,
): Promise<void> {
  setLoading(true)
  setError(false)
  try {
    const res = await api.blog.analytics(selectedRange, {
      excludeBots: switches.excludeBots,
      excludeSelf: switches.excludeSelfReferrers,
      excludeOwner: switches.excludeOwner,
    }, signal)
    setAnalytics(res.analytics)
  } catch (err) {
    // An aborted request is the reader changing the question, not a failed load.
    if (signal?.aborted) return
    console.error('Failed to load blog analytics:', err)
    setError(true)
  } finally {
    if (!signal?.aborted) setLoading(false)
  }
}