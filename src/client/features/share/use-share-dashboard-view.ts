import { useEffect, useRef, useState } from 'react'
import type { ShareGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../lib/api'
import { useLocale } from '../../lib/i18n'
import { cancelLatestAnalyticsRequest, runLatestAnalyticsRequest } from './analytics-request'
import { readAutoRefresh, useShareAutoRefresh, writeAutoRefresh } from './share-auto-refresh'
import { useShareStore } from './share-store'

type TrafficFilters = { excludeBots: boolean; excludeSelf: boolean; excludeOwner: boolean }

/**
 * The dashboard answers one question per window, so this is its data layer: the request, the
 * in-flight cancellation, the age of what came back, and the optional cadence that re-asks.
 * Everything the view needs about *how* it is drawn stays out of here.
 */
function useDashboardAnalytics(range: ShareTimelineRange, filters: TrafficFilters) {
  const [analytics, setAnalytics] = useState<ShareGlobalAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(false)
  const [loadedAt, setLoadedAt] = useState<number | null>(null)
  const [autoRefresh, setAutoRefreshState] = useState(readAutoRefresh)
  const requestRef = useRef<AbortController | null>(null)

  const loadData = (selectedRange: ShareTimelineRange = range) =>
    runLatestAnalyticsRequest({
      requestRef,
      load: (signal) => api.share.globalAnalytics(selectedRange, filters, signal),
      // Stamped together with the data: the age line describes the numbers on screen, so it must
      // move only when they do.
      apply: (data) => {
        setAnalytics(data)
        setLoadedAt(Date.now())
      },
      clear: () => {
        setAnalytics(null)
        setLoadedAt(null)
      },
      setIsLoading,
      setError,
      logLabel: '[share] failed to load dashboard analytics',
    })

  useEffect(() => {
    void loadData(range)
    return () => cancelLatestAnalyticsRequest(requestRef)
  }, [range, filters.excludeBots, filters.excludeSelf, filters.excludeOwner])

  const setAutoRefresh = (next: boolean) => {
    setAutoRefreshState(next)
    writeAutoRefresh(next)
  }
  useShareAutoRefresh({ enabled: autoRefresh, refresh: () => void loadData(range) })

  return { analytics, isLoading, error, loadData, loadedAt, autoRefresh, setAutoRefresh }
}

export function useShareDashboardView() {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const filters: TrafficFilters = {
    excludeBots,
    excludeSelf: excludeSelfReferrers,
    excludeOwner,
  }

  const data = useDashboardAnalytics(range, filters)
  const { analytics } = data

  const timelinePoints = analytics?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))
  const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0
  const filteredSelf = excludeSelfReferrers ? (analytics?.filterStats?.selfReferrals ?? 0) : 0
  const filteredOwner = excludeOwner ? (analytics?.filterStats?.owner ?? 0) : 0

  return {
    locale, range, setRange, metricMode, setMetricMode,
    ...data,
    timelinePoints, chartValues,
    filteredBots, filteredSelf, filteredOwner,
    totalFilteredCount: filteredBots + filteredSelf + filteredOwner,
  }
}
