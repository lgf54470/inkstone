import { useEffect, useState } from 'react'
import type { ShareVisitsResponse } from '@shared/types'
import { confirm } from '../../components/overlay'
import { api, ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { exportVisitsToCsv, promptWipePassword } from './share-helpers'


type VisitFilter = 'all' | 'real' | 'bot' | 'owner' | 'self'

// The visits endpoint caps limit at 100; exporting at that page size keeps a
// large history to a linear walk instead of hundreds of 25-row pages.
const EXPORT_PAGE_SIZE = 100

export function useShareVisitLogs(open: boolean, initialNoteId?: string) {
  const toast = useUi((s) => s.toast)
  const [isLoading, setIsLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [data, setData] = useState<ShareVisitsResponse | null>(null)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<VisitFilter>('all')
  const [search, setSearch] = useState('')
  const [noteId, setNoteId] = useState<string | undefined>(initialNoteId)
  const [isCleaning, setIsCleaning] = useState(false)

  const ctx = { setIsLoading, setData, setIsCleaning, toast }

  useEffect(() => {
    if (open) {
      setPage(1)
      setNoteId(initialNoteId)
      void fetchVisitsFlow(1, filter, search, initialNoteId, ctx)
    }
  }, [open, initialNoteId])
  const fetchVisits = (targetPage = page, targetFilter = filter, targetSearch = search, targetNoteId = noteId) =>
    fetchVisitsFlow(targetPage, targetFilter, targetSearch, targetNoteId, ctx)

  const handleFilterChange = (newFilter: VisitFilter) => {
    setFilter(newFilter)
    setPage(1)
    void fetchVisitsFlow(1, newFilter, search, noteId, ctx)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    void fetchVisitsFlow(1, filter, search, noteId, ctx)
  }

  const handleClean = (type: 'bots' | 'older_than' | 'all', days = 30) =>
    cleanVisitsFlow(type, days, ctx, () => fetchVisits(1, filter, search, noteId))

  const handleExport = () => exportVisitsFlow({ filter, search, noteId, toast, setIsExporting })

  return {
    isLoading, isExporting, data, page, setPage,
    filter, setFilter, search, setSearch, isCleaning,
    fetchVisits, handleFilterChange, handleSearchSubmit, handleClean, handleExport,
  }
}

type VisitsCtx = {
  setIsLoading: (value: boolean) => void
  setData: (data: ShareVisitsResponse | null) => void
  setIsCleaning: (value: boolean) => void
  toast: UiState['toast']
}

async function fetchVisitsFlow(
  targetPage: number,
  targetFilter: VisitFilter,
  targetSearch: string,
  targetNoteId: string | undefined,
  ctx: VisitsCtx,
): Promise<void> {
  ctx.setIsLoading(true)
  try {
    const res = await api.share.visits({
      page: targetPage,
      limit: 25,
      filter: targetFilter,
      search: targetSearch || undefined,
      noteId: targetNoteId || undefined,
    })
    ctx.setData(res)
  } catch {
    ctx.toast({ title: t('common.action_failed'), tone: 'danger' })
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

async function exportVisitsFlow(params: {
  filter: VisitFilter
  search: string
  noteId: string | undefined
  toast: UiState['toast']
  setIsExporting: (value: boolean) => void
}): Promise<void> {
  const { filter, search, noteId, toast, setIsExporting } = params
  setIsExporting(true)
  try {
    const visits = await collectAllVisits(filter, search, noteId)
    if (visits.length === 0) {
      toast({ title: t('share.no_logs_to_export'), tone: 'warning' })
      return
    }
    exportVisitsToCsv(visits, `inkstone-visits-${new Date().toISOString().slice(0, 10)}.csv`)
    toast({ title: t('share.export_success', { count: visits.length }), tone: 'default' })
  } catch {
    toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    setIsExporting(false)
  }
}

async function collectAllVisits(
  filter: VisitFilter,
  search: string,
  noteId: string | undefined,
): Promise<ShareVisitsResponse['visits']> {
  const all: ShareVisitsResponse['visits'] = []
  let page = 1
  for (;;) {
    const res = await api.share.visits({
      page,
      limit: EXPORT_PAGE_SIZE,
      filter,
      search: search || undefined,
      noteId: noteId || undefined,
    })
    all.push(...res.visits)
    if (res.visits.length === 0 || page >= res.totalPages) break
    page += 1
  }
  return all
}