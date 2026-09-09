import { useEffect, useState } from 'react'
import { Palette } from 'lucide-react'
import type { BlogLink, BlogLinkCategory, BlogLinkStatus } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { Checkbox, Field, Input, Select, Textarea } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { LinkDynamicIcon } from './link-dynamic-icon'
import { LinkIconSelector } from './link-icon-selector'

export interface LinkEditModalProps {
  open: boolean
  onClose: () => void
  link: BlogLink | null
  categories: BlogLinkCategory[]
  onSave: (data: Partial<BlogLink>) => Promise<void>
}

const MODAL_WIDTH = 560

export function LinkEditModal(props: LinkEditModalProps) {
  const form = useLinkEditForm(props)
  const categoryOptions = buildCategoryOptions(props.categories)

  return (
    <Modal open={props.open} onClose={props.onClose} title={props.link ? t('blog.edit_link') : t('blog.add_link')} width={MODAL_WIDTH}>
      <form onSubmit={form.handleSubmit} className='space-y-4 py-1'>
        <LinkBasicFields
          name={form.name}
          setName={form.setName}
          url={form.url}
          setUrl={form.setUrl}
          avatar={form.avatar}
          setAvatar={form.setAvatar}
          description={form.description}
          setDescription={form.setDescription}
          onAutoFetchIcon={form.handleAutoFetchIcon}
        />
        <LinkMetaFields
          categoryId={form.categoryId}
          setCategoryId={form.setCategoryId}
          status={form.status}
          setStatus={form.setStatus}
          email={form.email}
          setEmail={form.setEmail}
          isPinned={form.isPinned}
          setIsPinned={form.setIsPinned}
          isFavorite={form.isFavorite}
          setIsFavorite={form.setIsFavorite}
          categoryOptions={categoryOptions}
        />
        <div className='flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]'>
          <Button type='button' variant='ghost' onClick={props.onClose}>
            {t('common.cancel')}
          </Button>
          <Button type='submit' variant='primary' loading={form.saving} disabled={!form.name.trim() || !form.url.trim()}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function fetchFavicon(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=https://${parsed.hostname}`
  } catch {
    return `https://t3.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=128&url=https://${url.trim()}`
  }
}

function useLinkEditForm({ link, open, onSave, onClose }: LinkEditModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [avatar, setAvatar] = useState('')
  const [email, setEmail] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<BlogLinkStatus>('approved')
  const [isPinned, setIsPinned] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    setName(link?.name ?? ''); setUrl(link?.url ?? ''); setDescription(link?.description ?? '')
    setAvatar(link?.avatar ?? ''); setEmail(link?.email ?? ''); setCategoryId(link?.categoryId ?? '')
    setStatus(link?.status ?? 'approved'); setIsPinned(Boolean(link?.isPinned))
    setIsFavorite(Boolean(link?.isFavorite)); setSortOrder(link?.sortOrder ?? 0)
    setShowPicker(false)
  }, [link, open])

  const handleAutoFetchIcon = () => {
    if (url.trim()) setAvatar(fetchFavicon(url))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(), url: url.trim(), description: description.trim() || null,
        avatar: avatar.trim() || null, email: email.trim() || null, categoryId: categoryId || null,
        status, isPinned, isFavorite, sortOrder,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return {
    name, setName, url, setUrl, description, setDescription,
    avatar, setAvatar, email, setEmail, categoryId, setCategoryId,
    status, setStatus, isPinned, setIsPinned, isFavorite, setIsFavorite,
    saving, showPicker, setShowPicker,
    handleAutoFetchIcon, handleSubmit,
  }
}

function LinkBasicFields({
  name, setName, url, setUrl, avatar, setAvatar, description, setDescription, onAutoFetchIcon,
  showPicker, setShowPicker,
}: {
  name: string
  setName: (v: string) => void
  url: string
  setUrl: (v: string) => void
  avatar: string
  setAvatar: (v: string) => void
  description: string
  setDescription: (v: string) => void
  onAutoFetchIcon: () => void
  showPicker?: boolean
  setShowPicker?: (v: boolean) => void
}) {
  return (
    <>
      <Field label={t('blog.link_name')} required>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('blog.link_name_placeholder')} />
      </Field>
      <Field label={t('blog.link_url')} required>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder={t('blog.link_url_placeholder')} />
      </Field>
      <Field label={t('blog.link_avatar')}>
        <div className='space-y-2'>
          <div className='flex gap-2 items-center'>
            <div className='size-8 flex items-center justify-center rounded-[var(--r-md)] bg-[var(--bg-sunken)] border border-[var(--border-subtle)] shrink-0 overflow-hidden'>
              <LinkDynamicIcon icon={avatar} name={name} url={url} size={18} />
            </div>
            <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={t('blog.link_avatar_placeholder')} className='flex-1' />
            {setShowPicker && (
              <Button type='button' variant='secondary' size='sm' onClick={() => setShowPicker(!showPicker)}>
                <Palette size={13} />
                {t('blog.link_icon_picker')}
              </Button>
            )}
            <Button type='button' variant='secondary' size='sm' onClick={onAutoFetchIcon} disabled={!url.trim()}>
              {t('blog.link_auto_fetch_favicon')}
            </Button>
          </div>
          {showPicker && <LinkIconSelector value={avatar} onChange={(val) => { setAvatar(val); setShowPicker?.(false) }} />}
        </div>
      </Field>
      <Field label={t('blog.link_description')}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('blog.link_desc_placeholder')} rows={2} />
      </Field>
    </>
  )
}

function LinkMetaFields({
  categoryId, setCategoryId, status, setStatus, email, setEmail, isPinned, setIsPinned, isFavorite, setIsFavorite, categoryOptions,
}: {
  categoryId: string
  setCategoryId: (v: string) => void
  status: BlogLinkStatus
  setStatus: (v: BlogLinkStatus) => void
  email: string
  setEmail: (v: string) => void
  isPinned: boolean
  setIsPinned: (v: boolean) => void
  isFavorite: boolean
  setIsFavorite: (v: boolean) => void
  categoryOptions: Array<{ value: string; label: string }>
}) {
  return (
    <>
      <div className='grid grid-cols-2 gap-3'>
        <Field label={t('blog.link_category')}>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('blog.link_status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as BlogLinkStatus)}>
            <option value='approved'>{t('blog.link_status_approved')}</option>
            <option value='pending'>{t('blog.link_status_pending')}</option>
            <option value='rejected'>{t('blog.link_status_rejected')}</option>
          </Select>
        </Field>
      </div>
      <Field label={t('blog.link_email')}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type='email' placeholder={t('blog.link_email_placeholder')} />
      </Field>
      <div className='flex items-center gap-4 pt-1'>
        <Checkbox checked={isPinned} onChange={setIsPinned} label={t('blog.link_pin')} />
        <Checkbox checked={isFavorite} onChange={setIsFavorite} label={t('blog.link_favorite')} />
      </div>
    </>
  )
}

function buildCategoryOptions(categories: BlogLinkCategory[]): Array<{ value: string; label: string }> {
  const rootCats = categories.filter((c) => !c.parentId)
  const options: Array<{ value: string; label: string }> = [{ value: '', label: t('blog.link_no_category') }]

  for (const root of rootCats) {
    options.push({ value: root.id, label: root.name })
    const children = categories.filter((c) => c.parentId === root.id)
    for (const child of children) {
      options.push({ value: child.id, label: `  └ ${child.name}` })
    }
  }

  const orphaned = categories.filter((c) => c.parentId && !categories.some((p) => p.id === c.parentId))
  for (const orphan of orphaned) {
    options.push({ value: orphan.id, label: orphan.name })
  }

  return options
}
