import { useEffect, useState } from 'react'
import type { ShareTimelineRange, ShareVisitsResponse } from '@shared/types'
import { confirm } from '../../components/overlay'
import { api, ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import type { VisitFilter } from './share-helpers'
import { useVisitExport } from './use-visit-export'
import { promptWipePassword } from '../../lib/wipe-password-prompt'


/**
 * The query state one log browsing session holds: page, traffic filter, time window, search text
 * and the note scope. Opening the modal rewinds it to the first page of the asked scope.
 */
function useVisitLogQueryState(open: boolean, initialNoteId?: string) {
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<VisitFilter>('all')
  const [range, setRange] = useState<ShareTimelineRange>('all')
  const [search, setSearch] = useState('')
  const [noteId, setNoteId] = useState<string | undefined>(initialNoteId)
  useEffect(() => {
    if (open) {
      setPage(1)
      setNoteId(initialNoteId)
    }
  }, [open, initialNoteId])
  return { page, setPage, filter, setFilter, range, setRange, search, setSearch, noteId, setNoteId }
}

/** The "changed a dimension → back to page one of it" handlers, one per query dimension. */
function useVisitLogRefetchHandlers(
  state: ReturnType<typeof useVisitLogQueryState>,
  ctx: VisitsCtx,
): {
  handleFilterChange: (newFilter: VisitFilter) => void
  handleRangeChange: (newRange: ShareTimelineRange) => void
  handleSearchSubmit: (e: React.FormEvent) => void
} {
  const handleFilterChange = (newFilter: VisitFilter) => {
    state.setFilter(newFilter)
    state.setPage(1)
    void fetchVisitsFlow(1, newFilter, state.range, state.search, state.noteId, ctx)
  }
  const handleRangeChange = (newRange: ShareTimelineRange) => {
    state.setRange(newRange)
    state.setPage(1)
    void fetchVisitsFlow(1, state.filter, newRange, state.search, state.noteId, ctx)
  }
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    state.setPage(1)
    void fetchVisitsFlow(1, state.filter, state.range, state.search, state.noteId, ctx)
  }
  return { handleFilterChange, handleRangeChange, handleSearchSubmit }
}

export function useShareVisitLogs(open: boolean, initialNoteId?: string) {
  const toast = useUi((s) => s.toast)
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<ShareVisitsResponse | null>(null)
  const [error, setError] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const state = useVisitLogQueryState(open, initialNoteId)
  const { page, filter, range, search, noteId } = state
  const { isExporting, progress: exportProgress, exportVisits: handleExport } =
    useVisitExport({ open, filter, range, search, noteId, toast })

  const ctx = { setIsLoading, setData, setError, setIsCleaning, toast, range }

  useEffect(() => {
    if (open) {
      void fetchVisitsFlow(1, filter, range, search, initialNoteId, ctx)
    }
  }, [open, initialNoteId])
  const fetchVisits = (
    targetPage = page,
    targetFilter = filter,
    targetSearch = search,
    targetNoteId = noteId,
    targetRange = range,
  ) => fetchVisitsFlow(targetPage, targetFilter, targetRange, targetSearch, targetNoteId, ctx)

  const { handleFilterChange, handleRangeChange, handleSearchSubmit } =
    useVisitLogRefetchHandlers(state, ctx)

  const handleClean = (type: 'bots' | 'older_than' | 'all', days = 30) =>
    cleanVisitsFlow(type, days, ctx, () => fetchVisits(1, filter, search, noteId))

  return {
    isLoading, isExporting, data, error,
    page, setPage: state.setPage,
    filter, setFilter: state.setFilter, range, search, setSearch: state.setSearch,
    isCleaning, exportProgress,
    fetchVisits, handleFilterChange, handleRangeChange, handleSearchSubmit, handleClean, handleExport,
  }
}

type VisitsCtx = {
  setIsLoading: (value: boolean) => void
  setData: (data: ShareVisitsResponse | null) => void
  setError: (value: boolean) => void
  setIsCleaning: (value: boolean) => void
  toast: UiState['toast']
  range: ShareTimelineRange
}

async function fetchVisitsFlow(
  targetPage: number,
  targetFilter: VisitFilter,
  targetRange: ShareTimelineRange,
  targetSearch: string,
  targetNoteId: string | undefined,
  ctx: VisitsCtx,
): Promise<void> {
  ctx.setIsLoading(true)
  ctx.setError(false)
  try {
    const res = await api.share.visits({
      page: targetPage,
      limit: 25,
      filter: targetFilter,
      range: targetRange === 'all' ? undefined : targetRange,
      search: targetSearch || undefined,
      noteId: targetNoteId || undefined,
    })
    ctx.setData(res)
  } catch (error: unknown) {
    // A failure has to *read* as a failure. Clearing the rows keeps the previous page from standing
    // in for an answer this request never got, and `error` drives the table's own retry surface
    // instead of a toast that leaves the list looking merely empty — which is the silent downgrade
    // AGENTS.md rule 2 is written against. Same shape as the dashboard's analytics loader.
    ctx.setData(null)
    ctx.setError(true)
    console.warn('[share] failed to load visit logs', error)
  } finally {
    ctx.setIsLoading(false)
  }
}

async function cleanVisitsFlow(
  type: 'bots' | 'older_than' | 'all',
  days: number,
  ctx: VisitsCtx,
  refetch: () => Promise<void>,
): Promise<void> {
  const confirmMessage =
    type === 'all'
      ? t('share.confirm_clear_all_logs')
      : type === 'bots'
        ? t('share.confirm_clear_bot_logs')
        : t('share.confirm_clear_older_logs', { days })

  const ok = await confirm({
    title: t('share.clean_logs_title'),
    description: confirmMessage,
    confirmLabel: t('share.clean_now'),
    tone: 'danger',
  })
  if (!ok) return

  let password: string | undefined
  if (type === 'all') {
    const entered = await promptWipePassword()
    if (entered === null) return
    password = entered
  }

  ctx.setIsCleaning(true)
  try {
    const res = await api.share.cleanVisits(type, days, password)
    ctx.toast({
      title: t('share.clean_success', { count: res.deleted }),
      tone: 'default',
    })
    await refetch()
  } catch (error) {
    ctx.toast({
      title: error instanceof ApiError ? error.message : t('common.action_failed'),
      tone: 'danger',
    })
  } finally {
    ctx.setIsCleaning(false)
  }
}
