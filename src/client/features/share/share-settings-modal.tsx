import { Database, Save, Settings, Shield } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from '../../components/overlay'
import { Button } from '../../components/primitives'
import { Segmented, Switch } from '../../components/form'
import { t } from '../../lib/i18n'
import { useShareSettingsModal } from './use-share-settings-modal'

const MODAL_WIDTH = 520

type SettingsBundle = ReturnType<typeof useShareSettingsModal>

export function ShareSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const bundle = useShareSettingsModal(onClose)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className='flex items-center gap-2'>
          <Settings size={16} className='text-[var(--accent)]' />
          <span>{t('share.settings_modal_title')}</span>
        </div>
      }
      description={t('share.settings_modal_desc')}
      width={MODAL_WIDTH}
      footer={
        <div className='flex w-full items-center justify-end gap-2'>
          <Button size='sm' variant='ghost' onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size='sm' variant='primary' icon={<Save size={13} />} onClick={bundle.handleSave}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-4'>
        <TrafficFilterSection bundle={bundle} />
        <RetentionSection bundle={bundle} />
      </div>
    </Modal>
  )
}

function SectionHeader({ icon, title }: {
  icon: ReactNode
  title: string
}) {
  return (
    <div className='flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]'>
      {icon}
      <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
        {title}
      </h4>
    </div>
  )
}

function TrafficFilterSection({ bundle }: { bundle: SettingsBundle }) {
  const { bots, setBots, selfRef, setSelfRef, owner, setOwner } = bundle
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5'>
      <SectionHeader icon={<Shield size={15} className='text-[var(--success)]' />} title={t('share.settings_traffic_filter_title')} />
      <div className='flex flex-col gap-3 pt-3'>
        <SettingsSwitchRow title={t('share.filter_exclude_bots')} hint={t('share.filter_exclude_bots_hint')} checked={bots} onChange={setBots} />
        <SettingsSwitchRow title={t('share.filter_exclude_self')} hint={t('share.filter_exclude_self_hint')} checked={selfRef} onChange={setSelfRef} />
        <SettingsSwitchRow title={t('share.filter_exclude_owner')} hint={t('share.filter_exclude_owner_hint')} checked={owner} onChange={setOwner} />
      </div>
    </div>
  )
}

function SettingsSwitchRow({ title, hint, checked, onChange }: {
  title: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className='flex items-center justify-between'>
      <div>
        <div className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {title}
        </div>
        <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {hint}
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function RetentionSection({ bundle }: { bundle: SettingsBundle }) {
  const { retentionDays, setRetentionDays, maxRecords, setMaxRecords, isBusy, handleClean } = bundle
  const retentionOptions = [
    { value: '7', label: '7d' },
    { value: '30', label: '30d' },
    { value: '90', label: '90d' },
    { value: '180', label: '180d' },
    { value: '0', label: t('share.retention_unlimited') },
  ]
  const recordOptions = [
    { value: '1000', label: '1K' },
    { value: '5000', label: '5K' },
    { value: '10000', label: '10K' },
    { value: '50000', label: '50K' },
    { value: '0', label: t('share.retention_unlimited') },
  ]
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5'>
      <SectionHeader icon={<Database size={15} className='text-[var(--accent)]' />} title={t('share.settings_retention_title')} />
      <div className='flex flex-col gap-3 pt-3'>
        <RetentionField
          label={t('share.retention_days_label')}
          valueText={retentionDays === '0' ? t('share.retention_unlimited') : t('share.retention_days_val', { days: retentionDays })}
          value={retentionDays}
          onChange={setRetentionDays}
          options={retentionOptions}
        />
        <RetentionField
          label={t('share.max_records_label')}
          valueText={maxRecords === '0' ? t('share.retention_unlimited') : t('share.max_records_val', { count: maxRecords })}
          value={maxRecords}
          onChange={setMaxRecords}
          options={recordOptions}
        />
        <CleanupActions isBusy={isBusy} onClean={handleClean} />
      </div>
    </div>
  )
}

function RetentionField({ label, valueText, value, onChange, options }: {
  label: string
  valueText: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div>
      <div className='flex items-center justify-between pb-1.5'>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {label}
        </span>
        <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {valueText}
        </span>
      </div>
      <Segmented
        value={value}
        onChange={onChange}
        options={options}
      />
    </div>
  )
}

function CleanupActions({ isBusy, onClean }: {
  isBusy: boolean
  onClean: (type: 'bots' | 'older_than' | 'all') => void
}) {
  return (
    <div className='flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]'>
      <Button
        size='sm'
        variant='secondary'
        onClick={() => void onClean('bots')}
        disabled={isBusy}
      >
        {t('share.clean_bots_only')}
      </Button>
      <Button
        size='sm'
        variant='secondary'
        onClick={() => void onClean('older_than')}
        disabled={isBusy}
      >
        {t('share.clean_older_than_retention')}
      </Button>
      <Button
        size='sm'
        variant='ghost'
        className='text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
        onClick={() => void onClean('all')}
        disabled={isBusy}
      >
        {t('share.clean_all_logs')}
      </Button>
    </div>
  )
}