import { useEffect, useRef, useState } from 'react'
import type { ShareGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../lib/api'
import { useLocale } from '../../lib/i18n'
import { cancelLatestAnalyticsRequest, runLatestAnalyticsRequest } from './analytics-request'
import { useShareStore } from './share-store'

export function useShareDashboardView() {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [analytics, setAnalytics] = useState<ShareGlobalAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const filters = { excludeBots, excludeSelf: excludeSelfReferrers, excludeOwner }

  const loadData = (selectedRange: ShareTimelineRange = range) =>
    runLatestAnalyticsRequest({
      requestRef,
      load: (signal) => api.share.globalAnalytics(selectedRange, filters, signal),
      apply: setAnalytics,
      clear: () => setAnalytics(null),
      setIsLoading,
      setError,
      logLabel: '[share] failed to load dashboard analytics',
    })

  useEffect(() => {
    void loadData(range)
    return () => cancelLatestAnalyticsRequest(requestRef)
  }, [range, excludeBots, excludeSelfReferrers, excludeOwner])

  const timelinePoints = analytics?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))
  const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0
  const filteredSelf = excludeSelfReferrers ? (analytics?.filterStats?.selfReferrals ?? 0) : 0
  const filteredOwner = excludeOwner ? (analytics?.filterStats?.owner ?? 0) : 0

  return {
    locale, range, setRange, metricMode, setMetricMode,
    analytics, isLoading, error, loadData,
    timelinePoints, chartValues,
    filteredBots, filteredSelf, filteredOwner,
    totalFilteredCount: filteredBots + filteredSelf + filteredOwner,
  }
}
