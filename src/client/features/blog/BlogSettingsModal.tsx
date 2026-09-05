import { useState, useEffect } from 'react'
import { Settings, Save, X, Shield, Database } from 'lucide-react'
import { Modal, confirm } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { Input, Switch, Segmented } from '../../components/form'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useBlogStore } from './blog-store'
import { api } from '../../lib/api'

export function BlogSettingsModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useUi((s) => s.toast)
  const settings = useBlogStore((s) => s.settings)
  const saveSettings = useBlogStore((s) => s.saveSettings)

  const excludeBots = useBlogStore((s) => s.excludeBots)
  const excludeSelfReferrers = useBlogStore((s) => s.excludeSelfReferrers)
  const excludeOwner = useBlogStore((s) => s.excludeOwner)
  const setFilters = useBlogStore((s) => s.setFilters)

  const logRetentionDays = useBlogStore((s) => s.logRetentionDays)
  const maxLogRecords = useBlogStore((s) => s.maxLogRecords)
  const setRetentionSettings = useBlogStore((s) => s.setRetentionSettings)

  const [activeTab, setActiveTab] = useState<'site' | 'traffic'>('site')

  // Site basic states
  const [siteName, setSiteName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [bio, setBio] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorAvatar, setAuthorAvatar] = useState('')
  const [github, setGithub] = useState('')
  const [twitter, setTwitter] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [frontendUrl, setFrontendUrl] = useState('')
  const [requireCommentApproval, setRequireCommentApproval] = useState(true)
  const [postsPerPage, setPostsPerPage] = useState(10)

  // Traffic & logs states
  const [bots, setBots] = useState(excludeBots)
  const [selfRef, setSelfRef] = useState(excludeSelfReferrers)
  const [owner, setOwner] = useState(excludeOwner)
  const [retentionDays, setRetentionDays] = useState(String(logRetentionDays))
  const [maxRecords, setMaxRecords] = useState(String(maxLogRecords))

  const [isSaving, setIsSaving] = useState(false)
  const [isCleanBusy, setIsCleanBusy] = useState(false)

  useEffect(() => {
    if (!settings) return
    setSiteName(settings.siteName || '')
    setSubtitle(settings.subtitle || '')
    setBio(settings.bio || '')
    setAuthorName(settings.authorName || '')
    setAuthorAvatar(settings.authorAvatar || '')
    setGithub(settings.socialLinks?.github || '')
    setTwitter(settings.socialLinks?.twitter || '')
    setEmail(settings.socialLinks?.email || '')
    setWebsite(settings.socialLinks?.website || '')
    setFrontendUrl(settings.frontendUrl || 'http://localhost:4321')
    setRequireCommentApproval(settings.requireCommentApproval !== false)
    setPostsPerPage(settings.postsPerPage || 10)

    setBots(excludeBots)
    setSelfRef(excludeSelfReferrers)
    setOwner(excludeOwner)
    setRetentionDays(String(logRetentionDays))
    setMaxRecords(String(maxLogRecords))
  }, [settings, excludeBots, excludeSelfReferrers, excludeOwner, logRetentionDays, maxLogRecords, open])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    // Save traffic & retention filters
    setFilters({
      excludeBots: bots,
      excludeSelfReferrers: selfRef,
      excludeOwner: owner,
    })
    setRetentionSettings({
      logRetentionDays: parseInt(retentionDays, 10),
      maxLogRecords: parseInt(maxRecords, 10),
    })

    try {
      await saveSettings({
        siteName: siteName.trim() || 'Inkstone Blog',
        subtitle: subtitle.trim(),
        bio: bio.trim(),
        authorName: authorName.trim(),
        authorAvatar: authorAvatar.trim(),
        frontendUrl: frontendUrl.trim() || 'http://localhost:4321',
        requireCommentApproval,
        postsPerPage: Number(postsPerPage) || 10,
        socialLinks: {
          github: github.trim(),
          twitter: twitter.trim(),
          email: email.trim(),
          website: website.trim(),
        },
      })
      toast({ title: t('blog.settings_saved'), tone: 'success' })
      onClose()
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setIsSaving(false)
    }
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

    setIsCleanBusy(true)
    try {
      const res = await api.blog.cleanVisits(type, days)
      toast({
        title: t('share.clean_success', { count: res.deleted }),
        tone: 'default',
      })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
      setIsCleanBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      className="p-0 overflow-hidden"
    >
      <div className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-[var(--accent)]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            {t('blog.settings')}
          </h2>
        </div>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-2">
        <Segmented
          value={activeTab}
          onChange={(v) => setActiveTab(v as 'site' | 'traffic')}
          options={[
            { value: 'site', label: t('blog.site_basic_info') },
            { value: 'traffic', label: t('share.filter_traffic_title') },
          ]}
        />
      </div>

      <form onSubmit={handleSave}>
        <div className="max-h-[66vh] overflow-y-auto p-5 space-y-4 text-[12.5px]">
          {activeTab === 'traffic' ? (
            <>
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
                      type="button"
                      onClick={() => void handleClean('bots')}
                      disabled={isCleanBusy}
                    >
                      {t('share.clean_bots_only')}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      type="button"
                      onClick={() => void handleClean('older_than')}
                      disabled={isCleanBusy}
                    >
                      {t('share.clean_older_than_retention')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      className="text-[var(--danger)] hover:bg-[var(--danger-subtle)]"
                      onClick={() => void handleClean('all')}
                      disabled={isCleanBusy}
                    >
                      {t('share.clean_all_logs')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Site Basic Info */}
              <div className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                  {t('blog.site_basic_info')}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                      {t('blog.site_name')}
                    </label>
                    <Input
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder={t('blog.site_name_placeholder')}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                      {t('blog.subtitle')}
                    </label>
                    <Input
                      value={subtitle}
                      onChange={(e) => setSubtitle(e.target.value)}
                      placeholder={t('blog.site_subtitle_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                    {t('blog.frontend_url')}
                  </label>
                  <Input
                    value={frontendUrl}
                    onChange={(e) => setFrontendUrl(e.target.value)}
                    placeholder="http://localhost:4321"
                  />
                  <p className="mt-1 text-[10.5px] text-[var(--text-quaternary)]">
                    {t('blog.frontend_url_hint')}
                  </p>
                </div>
              </div>

              {/* Author Info */}
              <div className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                  {t('blog.author_profile_settings')}
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                      {t('blog.author_name')}
                    </label>
                    <Input
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder={t('blog.author_name_placeholder')}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                      {t('blog.author_avatar')}
                    </label>
                    <Input
                      value={authorAvatar}
                      onChange={(e) => setAuthorAvatar(e.target.value)}
                      placeholder={t('blog.avatar_placeholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                    {t('blog.bio')}
                  </label>
                  <Input
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t('blog.author_bio_placeholder')}
                  />
                </div>
              </div>

              {/* Comments and Pagination Rule */}
              <div className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                  {t('blog.comments_and_display_rules')}
                </h3>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="block font-medium text-[var(--text-primary)]">
                      {t('blog.require_approval')}
                    </span>
                    <span className="text-[11px] text-[var(--text-quaternary)]">
                      {t('blog.require_approval_hint')}
                    </span>
                  </div>
                  <Switch checked={requireCommentApproval} onChange={setRequireCommentApproval} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                  <div>
                    <span className="block font-medium text-[var(--text-primary)]">
                      {t('blog.posts_per_page')}
                    </span>
                    <span className="text-[11px] text-[var(--text-quaternary)]">
                      {t('blog.posts_per_page_hint')}
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={postsPerPage}
                    onChange={(e) => setPostsPerPage(Number(e.target.value))}
                    className="w-16 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 py-1 text-center text-[12px] text-[var(--text-primary)] outline-none"
                  />
                </div>
              </div>

              {/* Social Links */}
              <div className="space-y-3 rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
                <h3 className="font-semibold text-[13px] text-[var(--text-primary)]">
                  {t('blog.social_links')}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                    placeholder={t('blog.github_placeholder')}
                  />
                  <Input
                    value={twitter}
                    onChange={(e) => setTwitter(e.target.value)}
                    placeholder={t('blog.twitter_placeholder')}
                  />
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('blog.email_placeholder')}
                  />
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder={t('blog.website_placeholder')}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={isSaving}>
            <Save size={13} className="mr-1" />
            {t('blog.save_settings')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
