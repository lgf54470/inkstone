import { useEffect, useState } from 'react'
import type { ShareGlobalAnalytics, ShareTimelineRange } from '@shared/types'
import { api } from '../../lib/api'
import { useLocale } from '../../lib/i18n'
import { useShareStore } from './share-store'

export function useShareDashboardView() {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [analytics, setAnalytics] = useState<ShareGlobalAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const loadData = async (selectedRange = range) => {
    setIsLoading(true)
    try {
      const data = await api.share.globalAnalytics(selectedRange, {
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      setAnalytics(data)
    } catch {
      console.warn('[share] failed to load dashboard analytics')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadData(range)
  }, [range, excludeBots, excludeSelfReferrers, excludeOwner])

  const timelinePoints = analytics?.timeline || []
  const chartValues = timelinePoints.map((p) => (metricMode === 'views' ? p.views : p.visitors))

  const filteredBots = excludeBots ? (analytics?.filterStats?.bots ?? 0) : 0
  const filteredSelf = excludeSelfReferrers ? (analytics?.filterStats?.selfReferrals ?? 0) : 0
  const filteredOwner = excludeOwner ? (analytics?.filterStats?.owner ?? 0) : 0
  const totalFilteredCount = filteredBots + filteredSelf + filteredOwner

  return {
    locale, range, setRange, metricMode, setMetricMode,
    analytics, isLoading, loadData,
    timelinePoints, chartValues,
    filteredBots, filteredSelf, filteredOwner, totalFilteredCount,
  }
}