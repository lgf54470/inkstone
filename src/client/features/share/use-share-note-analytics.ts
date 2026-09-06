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

  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)

  const loadData = async (selectedRange = range) => {
    try {
      const res = await api.share.noteAnalytics(noteId, selectedRange, {
        excludeBots,
        excludeSelf: excludeSelfReferrers,
        excludeOwner,
      })
      setData(res)
    } catch (error) {
      console.warn('[share] failed to load note analytics', error)
    }
  }

  useEffect(() => {
    if (open && noteId) {
      void loadData(range)
    }
  }, [open, noteId, range, excludeBots, excludeSelfReferrers, excludeOwner])

  return { locale, range, setRange, metricMode, setMetricMode, data }
}