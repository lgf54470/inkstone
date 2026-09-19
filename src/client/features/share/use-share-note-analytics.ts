import { useEffect, useState } from 'react'
import type { ShareNoteAnalytics, ShareTimelineRange } from '@shared/types'
import { useLocale } from '../../lib/i18n'
import { api } from '../../lib/api'
import { useShareStore } from './share-store'

export function useShareNoteAnalytics(open: boolean, noteId: string) {
  const locale = useLocale()
  const [range, setRange] = useState<ShareTimelineRange>('7d')
  const [metricMode, setMetricMode] = useState<'views' | 'visitors'>('views')
  const [data, setData] = useState<ShareNoteAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const loadData = async (selectedRange = range) => {
    setIsLoading(true)
    setError(false)
    try {
      const res = await api.share.noteAnalytics(noteId, selectedRange, {
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      setData(res)
    } catch (loadError: unknown) {
      setData(null)
      setError(true)
      console.warn('[share] failed to load note analytics', loadError)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open && noteId) {
      void loadData(range)
    }
  }, [open, noteId, range, excludeBots, excludeSelfReferrers, excludeOwner])

  return { locale, range, setRange, metricMode, setMetricMode, data, isLoading, error, loadData }
}
