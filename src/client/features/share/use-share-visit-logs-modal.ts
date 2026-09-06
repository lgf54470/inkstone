import { useEffect, useState } from 'react'
import type { ShareVisitsResponse } from '@shared/types'
import { confirm } from '../../components/overlay'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { exportVisitsToCsv } from './share-helpers'

export type VisitFilter = 'all' | 'real' | 'bot' | 'owner' | 'self'

export function useShareVisitLogs(open: boolean, initialNoteId?: string) {
    const toast = useUi((s) => s.toast)
    const [isLoading, setIsLoading] = useState(false)
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
    const fetchVisits = (
        targetPage = page,
        targetFilter = filter,
        targetSearch = search,
        targetNoteId = noteId,
    ) => fetchVisitsFlow(targetPage, targetFilter, targetSearch, targetNoteId, ctx)

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

    const handleExport = () => exportVisitsFlow(data, toast)

    return {
        isLoading, data, page, setPage,
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

    ctx.setIsCleaning(true)
    try {
        const res = await api.share.cleanVisits(type, days)
        ctx.toast({
            title: t('share.clean_success', { count: res.deleted }),
            tone: 'default',
        })
        await refetch()
    } catch {
        ctx.toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
        ctx.setIsCleaning(false)
    }
}

function exportVisitsFlow(data: ShareVisitsResponse | null, toast: UiState['toast']): void {
    if (!data || data.visits.length === 0) {
        toast({ title: t('share.no_logs_to_export'), tone: 'warning' })
        return
    }
    exportVisitsToCsv(data.visits, `inkstone-visits-${new Date().toISOString().slice(0, 10)}.csv`)
    toast({ title: t('share.export_success'), tone: 'default' })
}