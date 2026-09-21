import { useEffect, useRef, useState } from 'react'
import type { ShareVisitsResponse } from '@shared/types'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { exportVisitsToCsv, type VisitFilter } from './share-helpers'

/** How much of the walk has landed, against the total the endpoint reports for the same query. */
export type VisitExportProgress = { loaded: number; total: number }

// The visits endpoint caps limit at 100; exporting at that page size keeps a
// large history to a linear walk instead of hundreds of 25-row pages.
const EXPORT_PAGE_SIZE = 100

// Past this many rows the file stops being something a person reads in a spreadsheet,
// and the walk would hold the account's whole history in the tab's memory. The export
// stops here and says so, rather than growing silently until the tab struggles.
const EXPORT_MAX_ROWS = 5000

/**
 * The export concern of the visit-log modal, kept apart from browsing it: this hook owns the
 * one-at-a-time abort, the progress readout and the file write, and the modal only decides when
 * to start it and when the person gave up on it.
 */
export function useVisitExport(options: {
  open: boolean
  filter: VisitFilter
  search: string
  noteId: string | undefined
  toast: UiState['toast']
}) {
  const { open, filter, search, noteId, toast } = options
  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState<VisitExportProgress | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) return
    // Dismissing the modal is the person giving up on the export, not just on the view.
    abortRef.current?.abort()
    abortRef.current = null
    setProgress(null)
  }, [open])

  const exportVisits = (): Promise<void> => {
    // One export at a time: a second click while the first is walking would put two
    // writers on the same file name, so the previous walk is cancelled first.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    return runExport({
      filter,
      search,
      noteId,
      toast,
      signal: controller.signal,
      setIsExporting,
      onProgress: setProgress,
      onSettled: () => {
        abortRef.current = null
        setProgress(null)
      },
    })
  }

  return { isExporting, progress, exportVisits }
}

async function runExport(params: {
  filter: VisitFilter
  search: string
  noteId: string | undefined
  toast: UiState['toast']
  signal: AbortSignal
  setIsExporting: (value: boolean) => void
  onProgress: (progress: VisitExportProgress) => void
  onSettled: () => void
}): Promise<void> {
  const { filter, search, noteId, toast, signal, setIsExporting, onProgress, onSettled } = params
  setIsExporting(true)
  try {
    const { visits, truncated } = await collectAllVisits({ filter, search, noteId, signal, onProgress })
    // A cancelled walk must not write a partial file: the person asked for nothing to happen.
    if (signal.aborted) return
    if (visits.length === 0) {
      toast({ title: t('share.no_logs_to_export'), tone: 'warning' })
      return
    }
    exportVisitsToCsv(visits, `inkstone-visits-${new Date().toISOString().slice(0, 10)}.csv`)
    toast({
      title: truncated
        ? t('share.export_truncated', { count: visits.length })
        : t('share.export_success', { count: visits.length }),
      tone: truncated ? 'warning' : 'default',
    })
  } catch (error) {
    // Cancelling makes the page request reject; that is the intended outcome, not a failure.
    if ((error as Error)?.name === 'AbortError') return
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setIsExporting(false)
    onSettled()
  }
}

async function collectAllVisits(params: {
  filter: VisitFilter
  search: string
  noteId: string | undefined
  signal: AbortSignal
  onProgress: (progress: VisitExportProgress) => void
}): Promise<{ visits: ShareVisitsResponse['visits']; truncated: boolean }> {
  const { filter, search, noteId, signal, onProgress } = params
  const all: ShareVisitsResponse['visits'] = []
  let page = 1
  // The abort flag is checked rather than relied on: a page already in flight still
  // resolves, and the loop must not start the next one after the person cancelled.
  for (;;) {
    if (signal.aborted) return { visits: [], truncated: false }
    const res = await api.share.visits({
      page,
      limit: EXPORT_PAGE_SIZE,
      filter,
      search: search || undefined,
      noteId: noteId || undefined,
    }, signal)
    if (signal.aborted) return { visits: [], truncated: false }
    all.push(...res.visits)
    onProgress({ loaded: all.length, total: res.total })
    if (res.visits.length === 0 || page >= res.totalPages) break
    if (all.length >= EXPORT_MAX_ROWS) return { visits: all.slice(0, EXPORT_MAX_ROWS), truncated: true }
    page += 1
  }
  return { visits: all, truncated: false }
}
