import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore, type BlogStoreState } from './blog-store'

export function useBlogSettingsModal({
  onClose,
}: {
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
  const fields = useSettingsFields({ excludeBots, excludeSelfReferrers, excludeOwner, logRetentionDays, maxLogRecords })
  const { siteName, setSiteName, subtitle, setSubtitle, bio, setBio, authorName, setAuthorName, authorAvatar, setAuthorAvatar, github, setGithub, twitter, setTwitter, email, setEmail, website, setWebsite, frontendUrl, setFrontendUrl, requireCommentApproval, setRequireCommentApproval, postsPerPage, setPostsPerPage, bots, setBots, selfRef, setSelfRef, owner, setOwner,    retentionDays, setRetentionDays, maxRecords, setMaxRecords, isSaving, setIsSaving, isCleanBusy, setIsCleanBusy } = fields

  useEffect(() => {
    applySettingsToForm({
      settings, excludeBots, excludeSelfReferrers, excludeOwner, logRetentionDays, maxLogRecords,
      setSiteName, setSubtitle, setBio, setAuthorName, setAuthorAvatar, setGithub, setTwitter,
      setEmail, setWebsite, setFrontendUrl, setRequireCommentApproval, setPostsPerPage,
      setBots, setSelfRef, setOwner, setRetentionDays, setMaxRecords,
    })
  }, [settings, excludeBots, excludeSelfReferrers, excludeOwner, logRetentionDays, maxLogRecords])

  const handleSave = (e: FormEvent) => saveSettingsFlow(e, {
    bots, selfRef, owner, retentionDays, maxRecords,
    siteName, subtitle, bio, authorName, authorAvatar, frontendUrl,
    requireCommentApproval, postsPerPage, github, twitter, email, website,
    setFilters, setRetentionSettings, saveSettings, toast, setIsSaving, onClose,
  })

  const handleClean = (type: 'bots' | 'older_than' | 'all') => cleanVisitLogs(type, retentionDays, toast, setIsCleanBusy)

  return {
    activeTab, setActiveTab,
    siteName, setSiteName, subtitle, setSubtitle, bio, setBio,
    authorName, setAuthorName, authorAvatar, setAuthorAvatar,
    github, setGithub, twitter, setTwitter, email, setEmail, website, setWebsite,
    frontendUrl, setFrontendUrl,
    requireCommentApproval, setRequireCommentApproval,
    postsPerPage, setPostsPerPage,
    bots, setBots, selfRef, setSelfRef, owner, setOwner,
    retentionDays, setRetentionDays, maxRecords, setMaxRecords,
    isSaving, isCleanBusy, handleSave, handleClean,
  }
}

function useSettingsFields({
  excludeBots,
  excludeSelfReferrers,
  excludeOwner,
  logRetentionDays,
  maxLogRecords,
}: {
  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
  logRetentionDays: number
  maxLogRecords: number
}) {
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
  const [bots, setBots] = useState(excludeBots)
  const [selfRef, setSelfRef] = useState(excludeSelfReferrers)
  const [owner, setOwner] = useState(excludeOwner)
  const [retentionDays, setRetentionDays] = useState(String(logRetentionDays))
  const [maxRecords, setMaxRecords] = useState(String(maxLogRecords))
  const [isSaving, setIsSaving] = useState(false)
  const [isCleanBusy, setIsCleanBusy] = useState(false)
  return { siteName, setSiteName, subtitle, setSubtitle, bio, setBio, authorName, setAuthorName, authorAvatar, setAuthorAvatar, github, setGithub, twitter, setTwitter, email, setEmail, website, setWebsite, frontendUrl, setFrontendUrl, requireCommentApproval, setRequireCommentApproval, postsPerPage, setPostsPerPage, bots, setBots, selfRef, setSelfRef, owner, setOwner, retentionDays, setRetentionDays, maxRecords, setMaxRecords, isSaving, setIsSaving, isCleanBusy, setIsCleanBusy }
}

interface SettingsFormSetters {
  setSiteName: (v: string) => void
  setSubtitle: (v: string) => void
  setBio: (v: string) => void
  setAuthorName: (v: string) => void
  setAuthorAvatar: (v: string) => void
  setGithub: (v: string) => void
  setTwitter: (v: string) => void
  setEmail: (v: string) => void
  setWebsite: (v: string) => void
  setFrontendUrl: (v: string) => void
  setRequireCommentApproval: (v: boolean) => void
  setPostsPerPage: (v: number) => void
  setBots: (v: boolean) => void
  setSelfRef: (v: boolean) => void
  setOwner: (v: boolean) => void
  setRetentionDays: (v: string) => void
  setMaxRecords: (v: string) => void
}

function applySettingsToForm(ctx: SettingsFormCtx & SettingsFormSetters): void {
  if (!ctx.settings) return
  ctx.setSiteName(ctx.settings.siteName || '')
  ctx.setSubtitle(ctx.settings.subtitle || '')
  ctx.setBio(ctx.settings.bio || '')
  ctx.setAuthorName(ctx.settings.authorName || '')
  ctx.setAuthorAvatar(ctx.settings.authorAvatar || '')
  ctx.setGithub(ctx.settings.socialLinks?.github || '')
  ctx.setTwitter(ctx.settings.socialLinks?.twitter || '')
  ctx.setEmail(ctx.settings.socialLinks?.email || '')
  ctx.setWebsite(ctx.settings.socialLinks?.website || '')
  ctx.setFrontendUrl(ctx.settings.frontendUrl || DEFAULT_BLOG_FRONTEND_URL)
  ctx.setRequireCommentApproval(ctx.settings.requireCommentApproval !== false)
  ctx.setPostsPerPage(ctx.settings.postsPerPage || 10)
  ctx.setBots(ctx.excludeBots)
  ctx.setSelfRef(ctx.excludeSelfReferrers)
  ctx.setOwner(ctx.excludeOwner)
  ctx.setRetentionDays(String(ctx.logRetentionDays))
  ctx.setMaxRecords(String(ctx.maxLogRecords))
}

interface SettingsFormCtx {
  settings: BlogSettingsLike | null
  excludeBots: boolean
  excludeSelfReferrers: boolean
  excludeOwner: boolean
  logRetentionDays: number
  maxLogRecords: number
}

interface SaveSettingsCtx {
  bots: boolean
  selfRef: boolean
  owner: boolean
  retentionDays: string
  maxRecords: string
  siteName: string
  subtitle: string
  bio: string
  authorName: string
  authorAvatar: string
  frontendUrl: string
  requireCommentApproval: boolean
  postsPerPage: number
  github: string
  twitter: string
  email: string
  website: string
  setFilters: BlogStoreState['setFilters']
  setRetentionSettings: BlogStoreState['setRetentionSettings']
  saveSettings: BlogStoreState['saveSettings']
  toast: UiState['toast']
  setIsSaving: (v: boolean) => void
  onClose: () => void
}

async function saveSettingsFlow(e: FormEvent, ctx: SaveSettingsCtx): Promise<void> {
  e.preventDefault()
  ctx.setIsSaving(true)

  ctx.setFilters({
    excludeBots: ctx.bots,
    excludeSelfReferrers: ctx.selfRef,
    excludeOwner: ctx.owner,
  })
  ctx.setRetentionSettings({
    logRetentionDays: parseInt(ctx.retentionDays, 10),
    maxLogRecords: parseInt(ctx.maxRecords, 10),
  })

  try {
    await ctx.saveSettings({
      siteName: ctx.siteName.trim() || 'Inkstone Blog',
      subtitle: ctx.subtitle.trim(),
      bio: ctx.bio.trim(),
      authorName: ctx.authorName.trim(),
      authorAvatar: ctx.authorAvatar.trim(),
      frontendUrl: ctx.frontendUrl.trim() || DEFAULT_BLOG_FRONTEND_URL,
      requireCommentApproval: ctx.requireCommentApproval,
      postsPerPage: Number(ctx.postsPerPage) || 10,
      socialLinks: {
        github: ctx.github.trim(),
        twitter: ctx.twitter.trim(),
        email: ctx.email.trim(),
        website: ctx.website.trim(),
      },
    })
    ctx.toast({ title: t('blog.settings_saved'), tone: 'success' })
    ctx.onClose()
  } catch {
    ctx.toast({ title: t('common.action_failed'), tone: 'danger' })
  } finally {
    ctx.setIsSaving(false)
  }
}

async function cleanVisitLogs(
  type: 'bots' | 'older_than' | 'all',
  retentionDays: string,
  toast: UiState['toast'],
  setIsCleanBusy: (v: boolean) => void,
): Promise<void> {
  const days = parseInt(retentionDays, 10) || 30
  const confirmMessage = type === 'all'
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

type BlogSettingsLike = NonNullable<ReturnType<typeof useBlogStore.getState>['settings']>