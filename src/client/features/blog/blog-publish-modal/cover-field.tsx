import { useEffect, useRef, useState } from 'react'
import { Image as ImageIcon, Images, Sparkles, Trash2, Upload } from 'lucide-react'
import type { BlogMediaItem } from '@shared/types'
import { Field, Input } from '../../../components/form'
import { confirm, Modal } from '../../../components/overlay'
import { Button, IconButton } from '../../../components/primitives'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import { formatBytes } from '../../../lib/time'
import { useUi } from '../../../store/ui'
import { BlogLoadFailure } from '../blog-load-failure'

const MEDIA_MODAL_WIDTH = 720

/**
 * The cover field and the media library behind it (FEA-07). A cover is still an address the author
 * may paste, but the library is now a first-class source: the picker lists the account's pictures,
 * uploads through the same route the attachment library uses, and hands back the public address the
 * post stores. A picture a note owns or another post shows is refused by the server, so the picker
 * only has to say what happened rather than guard the rule itself.
 */
export function CoverField({
  coverUrl,
  onCoverUrlChange,
  firstImageInContent,
}: {
  coverUrl: string
  onCoverUrlChange: (value: string) => void
  firstImageInContent: { url: string } | null
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className='space-y-1.5'>
      <Field label={t('blog.cover')} hint={`${t('blog.cover_hint')} ${t('blog.frontmatter_cover_hint')}`}>
        <div className='flex items-center gap-2'>
          <div className='min-w-0 flex-1'>
            <Input
              leading={<ImageIcon size={13} className='text-[var(--text-quaternary)]' />}
              value={coverUrl}
              onChange={(e) => onCoverUrlChange(e.target.value)}
              placeholder={t('blog.cover_placeholder')}
            />
          </div>
          <Button
            type='button'
            size='sm'
            variant='secondary'
            icon={<Images size={12} />}
            onClick={() => setPickerOpen(true)}
          >
            {t('blog.media_library')}
          </Button>
        </div>
      </Field>
      {coverUrl && <CoverPreview key={coverUrl} url={coverUrl} />}
      {firstImageInContent && (
        <button
          type='button'
          onClick={() => onCoverUrlChange(firstImageInContent.url)}
          className='inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--accent)] hover:underline'
        >
          <Sparkles size={11} />
          {t('blog.use_first_image')}
        </button>
      )}
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(item) => {
          onCoverUrlChange(item.publicUrl)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

/** The picked address drawn as it will read on the blog; a dead URL hides itself instead of burning. */
function CoverPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={url}
      alt=''
      onError={() => setFailed(true)}
      className='h-20 w-auto max-w-60 rounded-[var(--r-md)] border border-[var(--border-subtle)] object-cover'
    />
  )
}

function useMediaLibrary(open: boolean) {
  const [items, setItems] = useState<BlogMediaItem[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setItems(null)
    setFailed(false)
    void api.blog.media.list(controller.signal).then(
      (res) => {
        if (!controller.signal.aborted) setItems(res.media)
      },
      () => {
        if (!controller.signal.aborted) setFailed(true)
      },
    )
    return () => controller.abort()
  }, [open, reloadKey])

  return { items, setItems, failed, reload: () => setReloadKey((key) => key + 1) }
}

type MediaItemsSetter = (updater: (current: BlogMediaItem[] | null) => BlogMediaItem[]) => void

/** The library's two writes live together so the modal itself stays a view. */
function useMediaPickerActions(setItems: MediaItemsSetter) {
  const [uploading, setUploading] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useUi((s) => s.toast)

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const item = await api.blog.media.upload(file)
      setItems((current) => [item, ...(current ?? [])])
      toast({ title: t('blog.media_uploaded'), tone: 'success' })
    } catch (error: unknown) {
      toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async (item: BlogMediaItem) => {
    const ok = await confirm({
      title: t('blog.media_delete'),
      description: t('blog.confirm_delete_media', { value0: item.filename }),
      confirmLabel: t('blog.media_delete'),
      tone: 'danger',
    })
    if (!ok) return
    setRemovingId(item.id)
    try {
      await api.blog.media.remove(item.id)
      setItems((current) => (current ?? []).filter((entry) => entry.id !== item.id))
      toast({ title: t('blog.media_deleted'), tone: 'default' })
    } catch (error: unknown) {
      toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
    } finally {
      setRemovingId(null)
    }
  }

  return { uploading, removingId, fileInputRef, handleUpload, handleRemove }
}

function MediaPickerModal({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (item: BlogMediaItem) => void
}) {
  const { items, setItems, failed, reload } = useMediaLibrary(open)
  const actions = useMediaPickerActions(setItems)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('blog.media_choose_cover')}
      description={t('blog.media_choose_hint')}
      width={MEDIA_MODAL_WIDTH}
      footer={
        <MediaPickerFooter
          uploading={actions.uploading}
          fileInputRef={actions.fileInputRef}
          onFile={actions.handleUpload}
        />
      }
    >
      <MediaGrid
        items={items}
        failed={failed}
        removingId={actions.removingId}
        onRetry={reload}
        onPick={onPick}
        onRemove={(item) => void actions.handleRemove(item)}
      />
    </Modal>
  )
}

/** The library's upload control: one hidden input driven by a real button. */
function MediaPickerFooter({
  uploading,
  fileInputRef,
  onFile,
}: {
  uploading: boolean
  fileInputRef: { current: HTMLInputElement | null }
  onFile: (file: File) => Promise<void>
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept='image/*'
        hidden
        aria-label={t('blog.media_upload')}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void onFile(file)
        }}
      />
      <Button
        size='sm'
        variant='secondary'
        icon={<Upload size={12} />}
        loading={uploading}
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {t('blog.media_upload')}
      </Button>
    </>
  )
}

/** The library's own three states — loading, failed, empty — kept apart from the loaded grid. */
function MediaGrid({
  items,
  failed,
  removingId,
  onRetry,
  onPick,
  onRemove,
}: {
  items: BlogMediaItem[] | null
  failed: boolean
  removingId: string | null
  onRetry: () => void
  onPick: (item: BlogMediaItem) => void
  onRemove: (item: BlogMediaItem) => void
}) {
  if (items === null) {
    if (failed) return <BlogLoadFailure onRetry={onRetry} />
    return (
      <p role='status' className='flex h-64 items-center justify-center text-[var(--text-quaternary)]'>
        {t('common.loading')}
      </p>
    )
  }
  if (items.length === 0) {
    return <p className='flex h-64 items-center justify-center text-[var(--text-quaternary)]'>{t('blog.media_empty')}</p>
  }
  return (
    <ul className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
      {items.map((item) => (
        <MediaGridItem
          key={item.id}
          item={item}
          removing={removingId === item.id}
          onPick={() => onPick(item)}
          onRemove={() => onRemove(item)}
        />
      ))}
    </ul>
  )
}

function MediaGridItem({
  item,
  removing,
  onPick,
  onRemove,
}: {
  item: BlogMediaItem
  removing: boolean
  onPick: () => void
  onRemove: () => void
}) {
  return (
    <li className='relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]'>
      <button type='button' onClick={onPick} className='block w-full text-left'>
        <img
          src={item.previewUrl}
          alt=''
          className='h-24 w-full bg-[var(--bg-sunken)] object-cover'
        />
        <span className='block truncate px-2 pt-1.5 text-[length:var(--text-11)] text-[var(--text-secondary)]'>
          {item.filename}
        </span>
        <span className='block px-2 pb-1.5 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          {formatBytes(item.size)}
        </span>
      </button>
      <IconButton
        label={`${t('blog.media_delete')}: ${item.filename}`}
        size='sm'
        disabled={removing}
        onClick={onRemove}
        className='absolute right-1 top-1 bg-[var(--bg-overlay)]'
      >
        <Trash2 size={12} />
      </IconButton>
    </li>
  )
}
