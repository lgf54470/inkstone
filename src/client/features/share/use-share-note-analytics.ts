import { useEffect, useRef, useState } from 'react'
import type { ShareNoteAnalytics, ShareTimelineRange } from '@shared/types'
import { useLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { cancelLatestAnalyticsRequest, runLatestAnalyticsRequest } from './analytics-request'
import { useShareStore } from './share-store'

export function useShareNoteAnalytics(open: boolean, noteId: string) {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [data, setData] = useState<ShareNoteAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const filters = { excludeBots, excludeSelf: excludeSelfReferrers, excludeOwner }

  const loadData = (selectedRange: ShareTimelineRange = range) =>
    runLatestAnalyticsRequest({
      requestRef,
      load: (signal) => api.share.noteAnalytics(noteId, selectedRange, filters, signal),
      apply: setData,
      clear: () => setData(null),
      setIsLoading,
      setError,
      logLabel: '[share] failed to load note analytics',
    })

  useEffect(() => {
    if (open && noteId) void loadData(range)
    return () => cancelLatestAnalyticsRequest(requestRef)
  }, [open, noteId, range, excludeBots, excludeSelfReferrers, excludeOwner])

  return { locale, range, setRange, metricMode, setMetricMode, data, isLoading, error, loadData }
}
