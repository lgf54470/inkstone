import { useState } from 'react'
import { confirm } from '../../components/overlay'
import { api, ApiError } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useSession } from '../../store/session'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { promptWipePassword } from '../../lib/wipe-password-prompt'
import { useShareStore } from './share-store'

export function useShareSettingsModal(onClose: () => void) {
  const toast = useUi((s) => s.toast)
  const excludeBots = useShareStore((s) => s.excludeBots)
  const excludeSelfReferrers = useShareStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useShareStore((s) => s.excludeOwner)
  const setFilters = useShareStore((s) => s.setFilters)
  // The sweep runs on the server, so the value it reads has to be the account's.
  const visitLogRetentionDays = useSession((s) => s.settings.share.visitLogRetentionDays)
  // The dashboard's hygiene card reports on the account's threshold, not this browser's.
  const staleLinkDays = useSession((s) => s.settings.share.staleLinkDays)
  const updateSettings = useSession((s) => s.updateSettings)

  const [bots, setBots] = useState(excludeBots)
  const [selfRef, setSelfRef] = useState(excludeSelfReferrers)
  const [owner, setOwner] = useState(excludeOwner)
  const [retentionDays, setRetentionDays] = useState(String(visitLogRetentionDays))
  const [staleDays, setStaleLinkDays] = useState(String(staleLinkDays))
  const [isBusy, setIsBusy] = useState(false)

  const handleSave = () => saveSettingsFlow({
    bots,
    selfRef,
    owner,
    retentionDays,
    staleDays,
    setFilters,
    // One patch for the whole account section: both values belong to the same document, and two
    // calls would be two writes of one thing.
    setShareSettings: (patch) => updateSettings({ share: patch }),
    toast,
    onClose,
  })
  const handleClean = (type: 'bots' | 'older_than' | 'all') => void cleanVisitsFlow(type, retentionDays, setIsBusy, toast)

  return {
    bots, setBots, selfRef, setSelfRef, owner, setOwner,
    retentionDays, setRetentionDays,
    staleLinkDays: staleDays, setStaleLinkDays,
    isBusy, handleSave, handleClean,
  }
}

type SaveSettingsFlow = {
  bots: boolean
  selfRef: boolean
  owner: boolean
  retentionDays: string
  staleDays: string
  setFilters: (filters: { excludeBots: boolean; excludeSelfReferrers: boolean; excludeOwner: boolean }) => void
  setShareSettings: (patch: { visitLogRetentionDays: number; staleLinkDays: number }) => void
  toast: UiState['toast']
  onClose: () => void
}

function saveSettingsFlow({ bots, selfRef, owner, retentionDays, staleDays, setFilters, setShareSettings, toast, onClose }: SaveSettingsFlow): void {
  setFilters({ excludeBots: bots, excludeSelfReferrers: selfRef, excludeOwner: owner })
  setShareSettings({
    visitLogRetentionDays: parseInt(retentionDays, 10),
    staleLinkDays: parseInt(staleDays, 10),
  })
  toast({ title: t('share.settings_saved'), tone: 'default' })
  onClose()
}

/** Days usable for `older_than` cleanup; null covers Keep Forever (0) and unparseable input. */
export function parseCleanDays(retentionDays: string): number | null {
  const days = parseInt(retentionDays, 10)
  return days >= 1 ? days : null
}

async function cleanVisitsFlow(
  type: 'bots' | 'older_than' | 'all',
  retentionDays: string,
  setIsBusy: (value: boolean) => void,
  toast: UiState['toast'],
): Promise<void> {
  const parsed = parseCleanDays(retentionDays)
  if (type === 'older_than' && parsed === null) {
    toast({ title: t('share.clean_blocked_unlimited'), tone: 'warning' })
    return
  }
  const days = parsed ?? undefined
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

  setIsBusy(true)
  try {
    const res = await api.share.cleanVisits(type, days, password)
    toast({
      title: t('share.clean_success', { count: res.deleted }),
      tone: 'default',
    })
  } catch (error) {
    toast({
      title: error instanceof ApiError ? error.message : t('common.action_failed'),
      tone: 'danger',
    })
  } finally {
    setIsBusy(false)
  }
}