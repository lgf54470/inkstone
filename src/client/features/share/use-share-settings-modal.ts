import { useState } from 'react'
import { confirm } from '../../components/overlay'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { useShareStore } from './share-store'

export function useShareSettingsModal(onClose: () => void) {
    const toast = useUi((s) => s.toast)
    const excludeBots = useShareStore((s) => s.excludeBots)
    const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
    const excludeOwner = useShareStore((s) => s.excludeOwner)
    const setFilters = useShareStore((s) => s.setFilters)
    const logRetentionDays = useShareStore((s) => s.logRetentionDays)
    const maxLogRecords = useShareStore((s) => s.maxLogRecords)
    const setRetentionSettings = useShareStore((s) => s.setRetentionSettings)

    const [bots, setBots] = useState(excludeBots)
    const [selfRef, setSelfRef] = useState(excludeSelfReferrers)
    const [owner, setOwner] = useState(excludeOwner)
    const [retentionDays, setRetentionDays] = useState(String(logRetentionDays))
    const [maxRecords, setMaxRecords] = useState(String(maxLogRecords))
    const [isBusy, setIsBusy] = useState(false)

    const handleSave = () => saveSettingsFlow({ bots, selfRef, owner, retentionDays, maxRecords, setFilters, setRetentionSettings, toast, onClose })
    const handleClean = (type: 'bots' | 'older_than' | 'all') => void cleanVisitsFlow(type, retentionDays, setIsBusy, toast)

    return {
        bots, setBots, selfRef, setSelfRef, owner, setOwner,
        retentionDays, setRetentionDays, maxRecords, setMaxRecords,
        isBusy, handleSave, handleClean,
    }
}

type SaveSettingsFlow = {
    bots: boolean
    selfRef: boolean
    owner: boolean
    retentionDays: string
    maxRecords: string
    setFilters: (filters: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }) => void
    setRetentionSettings: (settings: { logRetentionDays: number; maxLogRecords: number }) => void
    toast: UiState['toast']
    onClose: () => void
}

function saveSettingsFlow({ bots, selfRef, owner, retentionDays, maxRecords, setFilters, setRetentionSettings, toast, onClose }: SaveSettingsFlow): void {
    setFilters({ excludeBots: bots, excludeSelfReferrers: selfRef, excludeOwner: owner })
    setRetentionSettings({
        logRetentionDays: parseInt(retentionDays, 10),
        maxLogRecords: parseInt(maxRecords, 10),
    })
    toast({ title: t('share.settings_saved'), tone: 'default' })
    onClose()
}

async function cleanVisitsFlow(
    type: 'bots' | 'older_than' | 'all',
    retentionDays: string,
    setIsBusy: (value: boolean) => void,
    toast: UiState['toast'],
): Promise<void> {
    const days = parseInt(retentionDays, 10) || 30
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

    setIsBusy(true)
    try {
        const res = await api.share.cleanVisits(type, days)
        toast({
            title: t('share.clean_success', { count: res.deleted }),
            tone: 'default',
        })
    } catch {
        toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
        setIsBusy(false)
    }
}