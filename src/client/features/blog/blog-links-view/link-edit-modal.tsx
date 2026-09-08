import { useEffect, useState } from 'react'
import type { BlogLink, BlogLinkCategory, BlogLinkStatus } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button } from '../../../components/primitives'
import { Field, Input, Select, Textarea } from '../../../components/form'
import { t } from '../../../lib/i18n'

export interface LinkEditModalProps {
  open: boolean
  onClose: () => void
  link: BlogLink | null
  categories: BlogLinkCategory[]
  onSave: (data: Partial<BlogLink>) => Promise<void>
}

const MODAL_WIDTH = 540

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

function fetchGoogleFavicon(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`)
    return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`
  } catch {
    return `https://www.google.com/s2/favicons?domain=${url.trim()}&sz=128`
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
  const [sortOrder, setSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(link?.name ?? ''); setUrl(link?.url ?? ''); setDescription(link?.description ?? '')
    setAvatar(link?.avatar ?? ''); setEmail(link?.email ?? ''); setCategoryId(link?.categoryId ?? '')
    setStatus(link?.status ?? 'approved'); setIsPinned(Boolean(link?.isPinned)); setSortOrder(link?.sortOrder ?? 0)
  }, [link, open])

  const handleAutoFetchIcon = () => {
    if (url.trim()) setAvatar(fetchGoogleFavicon(url))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return
    setSaving(true)
    try {
      await onSave({
        name: name.trim(), url: url.trim(), description: description.trim() || null,
        avatar: avatar.trim() || null, email: email.trim() || null, categoryId: categoryId || null,
        status, isPinned, sortOrder,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return {
    name, setName, url, setUrl, description, setDescription,
    avatar, setAvatar, email, setEmail, categoryId, setCategoryId,
    status, setStatus, isPinned, setIsPinned, saving,
    handleAutoFetchIcon, handleSubmit,
  }
}

function LinkBasicFields({
  name, setName, url, setUrl, avatar, setAvatar, description, setDescription, onAutoFetchIcon,
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
        <div className='flex gap-2'>
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder={t('blog.link_avatar_placeholder')} className='flex-1' />
          <Button type='button' variant='secondary' size='sm' onClick={onAutoFetchIcon} disabled={!url.trim()}>
            {t('blog.link_auto_fetch_favicon')}
          </Button>
        </div>
      </Field>
      <Field label={t('blog.link_description')}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('blog.link_desc_placeholder')} rows={2} />
      </Field>
    </>
  )
}

function LinkMetaFields({
  categoryId, setCategoryId, status, setStatus, email, setEmail, isPinned, setIsPinned, categoryOptions,
}: {
  categoryId: string
  setCategoryId: (v: string) => void
  status: BlogLinkStatus
  setStatus: (v: BlogLinkStatus) => void
  email: string
  setEmail: (v: string) => void
  isPinned: boolean
  setIsPinned: (v: boolean) => void
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
      <div className='flex items-center gap-2 pt-1'>
        <label className='flex items-center gap-2 cursor-pointer select-none text-[length:var(--text-12)] text-[var(--text-primary)]'>
          <input type='checkbox' checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className='size-4 rounded accent-[var(--accent)]' />
          {t('blog.link_pin')}
        </label>
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
