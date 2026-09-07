import type { ReactNode } from 'react'
import { Database, Save, Settings, Shield, X } from 'lucide-react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import { Modal } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { Input, Switch, Segmented } from '../../components/form'
import { t } from '../../lib/i18n'
import { useBlogSettingsModal } from './use-blog-settings-modal'

export function BlogSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const form = useBlogSettingsModal({ onClose })

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      className='p-0 overflow-hidden'
    >
      <SettingsModalHeader onClose={onClose} />

      <div className='border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2'>
        <Segmented
          value={form.activeTab}
          onChange={(v) => form.setActiveTab(v as 'site' | 'traffic')}
          options={[
            { value: 'site', label: t('blog.site_basic_info') },
            { value: 'traffic', label: t('share.filter_traffic_title') },
          ]}
        />
      </div>

      <form onSubmit={form.handleSave}>
        <div className="max-h-[66vh] overflow-y-auto p-5 space-y-4 text-[length:var(--text-12\.5)]">
          {form.activeTab === 'traffic' ? (
            <TrafficSettingsTab form={form} />
          ) : (
            <SiteSettingsTab form={form} />
          )}
        </div>

        <SettingsModalFooter isSaving={form.isSaving} onClose={onClose} />
      </form>
    </Modal>
  )
}

function SettingsModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className='flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]'>
      <div className='flex items-center gap-2'>
        <Settings size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('blog.settings')}
        </h2>
      </div>
      <IconButton label={t('common.close')} size='sm' onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

function SettingsModalFooter({ isSaving, onClose }: { isSaving: boolean; onClose: () => void }) {
  return (
    <div className='flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3'>
      <Button variant='ghost' size='sm' type='button' onClick={onClose} disabled={isSaving}>
        {t('common.cancel')}
      </Button>
      <Button variant='primary' size='sm' type='submit' loading={isSaving}>
        <Save size={13} className='mr-1' />
        {t('blog.save_settings')}
      </Button>
    </div>
  )
}

interface SettingsFormBundle {
  bots: boolean
  setBots: (v: boolean) => void
  selfRef: boolean
  setSelfRef: (v: boolean) => void
  owner: boolean
  setOwner: (v: boolean) => void
  retentionDays: string
  setRetentionDays: (v: string) => void
  maxRecords: string
  setMaxRecords: (v: string) => void
  isCleanBusy: boolean
  handleClean: (type: 'bots' | 'older_than' | 'all') => Promise<void>
  siteName: string
  setSiteName: (v: string) => void
  subtitle: string
  setSubtitle: (v: string) => void
  bio: string
  setBio: (v: string) => void
  authorName: string
  setAuthorName: (v: string) => void
  authorAvatar: string
  setAuthorAvatar: (v: string) => void
  github: string
  setGithub: (v: string) => void
  twitter: string
  setTwitter: (v: string) => void
  email: string
  setEmail: (v: string) => void
  website: string
  setWebsite: (v: string) => void
  frontendUrl: string
  setFrontendUrl: (v: string) => void
  requireCommentApproval: boolean
  setRequireCommentApproval: (v: boolean) => void
  postsPerPage: number
  setPostsPerPage: (v: number) => void
}

function TrafficSettingsTab({ form }: { form: SettingsFormBundle }) {
  return (
    <>
      <TrafficFiltersSection form={form} />
      <RetentionSection form={form} />
    </>
  )
}

function TrafficFiltersSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5'>
      <div className='flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]'>
        <Shield size={15} className='text-[var(--success)]' />
        <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
          {t('share.settings_traffic_filter_title')}
        </h4>
      </div>

      <div className='flex flex-col gap-3 pt-3'>
        <FilterSwitchRow label={t('share.filter_exclude_bots')} hint={t('share.filter_exclude_bots_hint')} checked={form.bots} onChange={form.setBots} />
        <FilterSwitchRow label={t('share.filter_exclude_self')} hint={t('share.filter_exclude_self_hint')} checked={form.selfRef} onChange={form.setSelfRef} />
        <FilterSwitchRow label={t('share.filter_exclude_owner')} hint={t('share.filter_exclude_owner_hint')} checked={form.owner} onChange={form.setOwner} />
      </div>
    </div>
  )
}

function FilterSwitchRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className='flex items-center justify-between'>
      <div>
        <div className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>{label}</div>
        <div className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{hint}</div>
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

function RetentionSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-card)] p-3.5'>
      <div className='flex items-center gap-2 pb-3 border-b border-[var(--border-subtle)]'>
        <Database size={15} className='text-[var(--accent)]' />
        <h4 className='text-[length:var(--text-13)] font-semibold text-[var(--text-primary)]'>
          {t('share.settings_retention_title')}
        </h4>
      </div>

      <div className='flex flex-col gap-3 pt-3'>
        <RetentionField
          label={t('share.retention_days_label')}
          valueLabel={form.retentionDays === '0' ? t('share.retention_unlimited') : t('share.retention_days_val', { days: form.retentionDays })}
          value={form.retentionDays}
          onChange={form.setRetentionDays}
          options={[
            { value: '7', label: '7d' },
            { value: '30', label: '30d' },
            { value: '90', label: '90d' },
            { value: '180', label: '180d' },
            { value: '0', label: t('share.retention_unlimited') },
          ]}
        />
        <RetentionField
          label={t('share.max_records_label')}
          valueLabel={form.maxRecords === '0' ? t('share.retention_unlimited') : t('share.max_records_val', { count: form.maxRecords })}
          value={form.maxRecords}
          onChange={form.setMaxRecords}
          options={[
            { value: '1000', label: '1K' },
            { value: '5000', label: '5K' },
            { value: '10000', label: '10K' },
            { value: '50000', label: '50K' },
            { value: '0', label: t('share.retention_unlimited') },
          ]}
        />

        <CleanupActions busy={form.isCleanBusy} onClean={form.handleClean} />
      </div>
    </div>
  )
}

function RetentionField({
  label,
  valueLabel,
  value,
  onChange,
  options,
}: {
  label: string
  valueLabel: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div>
      <div className='flex items-center justify-between pb-1.5'>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>{label}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{valueLabel}</span>
      </div>
      <Segmented value={value} onChange={onChange} options={options} />
    </div>
  )
}

function CleanupActions({ busy, onClean }: { busy: boolean; onClean: (type: 'bots' | 'older_than' | 'all') => Promise<void> }) {
  return (
    <div className='flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border-subtle)]'>
      <Button size='sm' variant='secondary' type='button' onClick={() => void onClean('bots')} disabled={busy}>
        {t('share.clean_bots_only')}
      </Button>
      <Button size='sm' variant='secondary' type='button' onClick={() => void onClean('older_than')} disabled={busy}>
        {t('share.clean_older_than_retention')}
      </Button>
      <Button
        size='sm'
        variant='ghost'
        type='button'
        className='text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
        onClick={() => void onClean('all')}
        disabled={busy}
      >
        {t('share.clean_all_logs')}
      </Button>
    </div>
  )
}

function SiteSettingsTab({ form }: { form: SettingsFormBundle }) {
  return (
    <>
      <SiteBasicSection form={form} />
      <AuthorSection form={form} />
      <CommentsRulesSection form={form} />
      <SocialLinksSection form={form} />
    </>
  )
}

function SettingsField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[length:var(--text-11\.5)] font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  )
}

function SiteBasicSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <h3 className='font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]'>
        {t('blog.site_basic_info')}
      </h3>

      <div className='grid grid-cols-2 gap-3'>
        <SettingsField label={t('blog.site_name')}>
          <Input value={form.siteName} onChange={(e) => form.setSiteName(e.target.value)} placeholder={t('blog.site_name_placeholder')} />
        </SettingsField>
        <SettingsField label={t('blog.subtitle')}>
          <Input value={form.subtitle} onChange={(e) => form.setSubtitle(e.target.value)} placeholder={t('blog.site_subtitle_placeholder')} />
        </SettingsField>
      </div>

      <SettingsField label={t('blog.frontend_url')}>
        <Input value={form.frontendUrl} onChange={(e) => form.setFrontendUrl(e.target.value)} placeholder={DEFAULT_BLOG_FRONTEND_URL} />
        <p className="mt-1 text-[length:var(--text-10\.5)] text-[var(--text-quaternary)]">
          {t('blog.frontend_url_hint')}
        </p>
      </SettingsField>
    </div>
  )
}

function AuthorSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <h3 className='font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]'>
        {t('blog.author_profile_settings')}
      </h3>

      <div className='grid grid-cols-2 gap-3'>
        <SettingsField label={t('blog.author_name')}>
          <Input value={form.authorName} onChange={(e) => form.setAuthorName(e.target.value)} placeholder={t('blog.author_name_placeholder')} />
        </SettingsField>
        <SettingsField label={t('blog.author_avatar')}>
          <Input value={form.authorAvatar} onChange={(e) => form.setAuthorAvatar(e.target.value)} placeholder={t('blog.avatar_placeholder')} />
        </SettingsField>
      </div>

      <SettingsField label={t('blog.bio')}>
        <Input value={form.bio} onChange={(e) => form.setBio(e.target.value)} placeholder={t('blog.author_bio_placeholder')} />
      </SettingsField>
    </div>
  )
}

function CommentsRulesSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <h3 className='font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]'>
        {t('blog.comments_and_display_rules')}
      </h3>

      <div className='flex items-center justify-between'>
        <div>
          <span className='block font-medium text-[var(--text-primary)]'>{t('blog.require_approval')}</span>
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('blog.require_approval_hint')}</span>
        </div>
        <Switch checked={form.requireCommentApproval} onChange={form.setRequireCommentApproval} />
      </div>

      <div className='flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]'>
        <div>
          <span className='block font-medium text-[var(--text-primary)]'>{t('blog.posts_per_page')}</span>
          <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('blog.posts_per_page_hint')}</span>
        </div>
        <input
          type='number'
          min={1}
          max={50}
          value={form.postsPerPage}
          onChange={(e) => form.setPostsPerPage(Number(e.target.value))}
          className='w-16 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-center text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
        />
      </div>
    </div>
  )
}

function SocialLinksSection({ form }: { form: SettingsFormBundle }) {
  return (
    <div className='space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4'>
      <h3 className='font-semibold text-[length:var(--text-13)] text-[var(--text-primary)]'>
        {t('blog.social_links')}
      </h3>
      <div className='grid grid-cols-2 gap-3'>
        <Input value={form.github} onChange={(e) => form.setGithub(e.target.value)} placeholder={t('blog.github_placeholder')} />
        <Input value={form.twitter} onChange={(e) => form.setTwitter(e.target.value)} placeholder={t('blog.twitter_placeholder')} />
        <Input value={form.email} onChange={(e) => form.setEmail(e.target.value)} placeholder={t('blog.email_placeholder')} />
        <Input value={form.website} onChange={(e) => form.setWebsite(e.target.value)} placeholder={t('blog.website_placeholder')} />
      </div>
    </div>
  )
}