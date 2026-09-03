import { useState } from 'react'
import {
  Database,
  Save,
  Settings,
  Shield,
} from 'lucide-react'
import { Modal, confirm } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Segmented, Switch } from '../../components/form'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useShareStore } from './share-store'
import { api } from '../../lib/api'

export function ShareSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
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
  const [busy, setBusy] = useState(false)

  const handleSave = () => {
    setFilters({
      excludeBots: bots,
      excludeSelfReferrers: selfRef,
      excludeOwner: owner,
    })
    setRetentionSettings({
      logRetentionDays: parseInt(retentionDays, 10),
      maxLogRecords: parseInt(maxRecords, 10),
    })
    toast({ title: t('share.settings_saved'), tone: 'default' })
    onClose()
  }

  const handleClean = async (type: 'bots' | 'older_than' | 'all') => {
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

    setBusy(true)
    try {
      const res = await api.share.cleanVisits(type, days)
      toast({
        title: t('share.clean_success', { count: res.deleted }),
        tone: 'default',
      })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-[var(--accent)]" />
          <span>{t('share.settings_modal_title')}</span>
        </div>
      }
      description={t('share.settings_modal_desc')}
      width={520}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" variant="primary" icon={<Save size={13} />} onClick={handleSave}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Traffic Filters Section */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <Shield size={15} className="text-[var(--success)]" />
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
              {t('share.settings_traffic_filter_title')}
            </h4>
          </div>

          <div className="flex flex-col gap-3 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">
                  {t('share.filter_exclude_bots')}
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t('share.filter_exclude_bots_hint')}
                </div>
              </div>
              <Switch checked={bots} onChange={setBots} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">
                  {t('share.filter_exclude_self')}
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t('share.filter_exclude_self_hint')}
                </div>
              </div>
              <Switch checked={selfRef} onChange={setSelfRef} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] font-medium text-[var(--text-primary)]">
                  {t('share.filter_exclude_owner')}
                </div>
                <div className="text-[11px] text-[var(--text-tertiary)]">
                  {t('share.filter_exclude_owner_hint')}
                </div>
              </div>
              <Switch checked={owner} onChange={setOwner} />
            </div>
          </div>
        </div>

        {/* Log Retention and Limits Section */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5">
          <div className="flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]">
            <Database size={15} className="text-[var(--accent)]" />
            <h4 className="text-[13px] font-semibold text-[var(--text-primary)]">
              {t('share.settings_retention_title')}
            </h4>
          </div>

          <div className="flex flex-col gap-3 pt-3">
            {/* Retention Days */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  {t('share.retention_days_label')}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {retentionDays === '0'
                    ? t('share.retention_unlimited')
                    : t('share.retention_days_val', { days: retentionDays })}
                </span>
              </div>
              <Segmented
                value={retentionDays}
                onChange={setRetentionDays}
                options={[
                  { value: '7', label: '7d' },
                  { value: '30', label: '30d' },
                  { value: '90', label: '90d' },
                  { value: '180', label: '180d' },
                  { value: '0', label: t('share.retention_unlimited') },
                ]}
              />
            </div>

            {/* Max Log Records */}
            <div>
              <div className="flex items-center justify-between pb-1.5">
                <span className="text-[12px] font-medium text-[var(--text-primary)]">
                  {t('share.max_records_label')}
                </span>
                <span className="text-[11px] text-[var(--text-tertiary)]">
                  {maxRecords === '0'
                    ? t('share.retention_unlimited')
                    : t('share.max_records_val', { count: maxRecords })}
                </span>
              </div>
              <Segmented
                value={maxRecords}
                onChange={setMaxRecords}
                options={[
                  { value: '1000', label: '1K' },
                  { value: '5000', label: '5K' },
                  { value: '10000', label: '10K' },
                  { value: '50000', label: '50K' },
                  { value: '0', label: t('share.retention_unlimited') },
                ]}
              />
            </div>

            {/* Cleanup Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleClean('bots')}
                disabled={busy}
              >
                {t('share.clean_bots_only')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleClean('older_than')}
                disabled={busy}
              >
                {t('share.clean_older_than_retention')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                onClick={() => void handleClean('all')}
                disabled={busy}
              >
                {t('share.clean_all_logs')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
