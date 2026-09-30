import { Globe, Image as ImageIcon, Check, Clock, Hash, X, Sparkles, ExternalLink } from 'lucide-react'
import type { BlogPostIndexEntry } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button, IconButton } from '../../../components/primitives'
import { Field, Input, Select, Switch, Textarea } from '../../../components/form'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { fromDateTimeLocalValue } from '../../../lib/time'
import { useBlogPublishForm } from './use-blog-publish-form'

const MODAL_WIDTH = 640

type PublishForm = ReturnType<typeof useBlogPublishForm>

function toggleTag(current: string[], name: string, setTags: (tags: string[]) => void) {
  if (current.includes(name)) setTags(current.filter((tag) => tag !== name))
  else setTags([...current, name])
}

function TitleField({ form }: { form: PublishForm }) {
  const { title, setTitle, note } = form
  return (
    <Field label={t('blog.post_title')}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={note?.title || t('common.untitled_note')}
      />
    </Field>
  )
}

function SlugField({ form }: { form: PublishForm }) {
  const { slug, setSlug, slugAvailable, slugReason, previewUrl } = form
  // The availability line is the field's description rather than a sibling of its label: `Field`
  // wires the hint into `aria-describedby`, so the reason for an unusable slug is announced with
  // the input it belongs to, and `invalid` gives the same answer as `aria-invalid`.
  const hint = (
    <span className='flex flex-wrap items-center gap-x-2'>
      {slugAvailable === true && (
        <span className='inline-flex items-center gap-1 text-[var(--success)]'>
          <Check size={11} /> {t('blog.slug_available')}
        </span>
      )}
      {slugAvailable === false && slugReason && <span className='text-[var(--danger)]'>{slugReason}</span>}
      <span className='truncate'>{previewUrl}</span>
    </span>
  )
  return (
    <Field label={t('blog.slug')} hint={hint}>
      <Input
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
        placeholder={t('blog.slug_placeholder')}
        invalid={slugAvailable === false}
      />
    </Field>
  )
}

/**
 * When the post goes out. The moment is stored as a timestamp; the control speaks the reader's own
 * wall clock, which is what an author picking a time means. A future moment schedules the post — the
 * public pages do not show it until then — so the hint says so rather than leaving the author to
 * discover it. An empty field is not "no date": it lets the server stamp a draft being published
 * with now and keep an already published post's own moment.
 */
function PublishTimeField({ form }: { form: PublishForm }) {
  const { publishedAt, setPublishedAt } = form
  const picked = fromDateTimeLocalValue(publishedAt)
  const isScheduled = picked !== null && picked > Date.now()
  return (
    <Field label={t('blog.publish_time_label')} hint={isScheduled ? t('blog.publish_time_scheduled') : t('blog.publish_time_hint')}>
      <Input
        type='datetime-local'
        value={publishedAt}
        onChange={(e) => setPublishedAt(e.target.value)}
        leading={<Clock size={13} className='text-[var(--text-quaternary)]' />}
      />
    </Field>
  )
}

function CoverField({ form }: { form: PublishForm }) {
  const { coverUrl, setCoverUrl, firstImageInContent } = form
  return (
    <div className='space-y-1.5'>
      <Field label={t('blog.cover')} hint={`${t('blog.cover_hint')} ${t('blog.frontmatter_cover_hint')}`}>
        <Input
          leading={<ImageIcon size={13} className='text-[var(--text-quaternary)]' />}
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder={t('blog.cover_placeholder')}
        />
      </Field>
      {firstImageInContent && (
        <button
          type='button'
          onClick={() => setCoverUrl(firstImageInContent.url)}
          className='inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--accent)] hover:underline'
        >
          <Sparkles size={11} />
          {t('blog.use_first_image')}
        </button>
      )}
    </div>
  )
}

function FolderField({ form }: { form: PublishForm }) {
  const { folderId, setFolderId, flatFolderList } = form
  return (
    <Field label={t('blog.folders')}>
      <Select
        value={folderId || ''}
        onChange={(e) => setFolderId(e.target.value || null)}
        className='w-full'
      >
        <option value=''>{t('blog.no_folder')}</option>
        {flatFolderList.map((f) => (
          <option key={f.id} value={f.id}>
            {f.depth > 0 ? `${'— '.repeat(f.depth)}${f.name}` : f.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function CategoryField({ form }: { form: PublishForm }) {
  const { categoryId, setCategoryId, categories } = form
  return (
    <Field label={t('blog.category')}>
      <Select
        value={categoryId || ''}
        onChange={(e) => setCategoryId(e.target.value || null)}
        className='w-full'
      >
        <option value=''>{t('blog.no_category')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  )
}

function PinRow({ form }: { form: PublishForm }) {
  return (
    <div className='flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2'>
      <div>
        <span className='block font-medium text-[var(--text-secondary)]'>{t('blog.pin_to_top')}</span>
        <span className="text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)]">
          {t('blog.pin_to_top_hint')}
        </span>
      </div>
      <Switch checked={form.isPinned} onChange={form.setIsPinned} label={t('blog.pin_to_top')} />
    </div>
  )
}

function CommentsRow({ form }: { form: PublishForm }) {
  return (
    <div className='flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3'>
      <div>
        <span className='block font-medium text-[var(--text-primary)]'>{t('blog.allow_comments')}</span>
        <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {t('blog.allow_comments_hint')}
        </span>
      </div>
      <Switch checked={form.allowComments} onChange={form.setAllowComments} label={t('blog.allow_comments')} />
    </div>
  )
}

function AvailableTagPicker({ form }: { form: PublishForm }) {
  const { availableTags, tags, setTags } = form
  if (availableTags.length === 0) return null
  return (
    <div className='flex flex-wrap items-center gap-1 mb-2'>
      <span className="text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)] mr-1">{t('blog.tags')}:</span>
      {availableTags.map((at) => {
        const isSelected = tags.includes(at.name)
        return (
          <button
            key={at.id}
            type='button'
            onClick={() => toggleTag(tags, at.name, setTags)}
            className={cn(
              'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[length:var(--text-10\\.5)] transition-colors',
              isSelected
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'bg-[var(--bg-sunken)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
            )}
          >
            <Hash size={9} />
            {at.name}
          </button>
        )
      })}
    </div>
  )
}

function SelectedTagList({ form }: { form: PublishForm }) {
  const { tags, handleRemoveTag } = form
  return (
    <div className='flex flex-wrap gap-1.5 mb-2'>
      {tags.map((tag) => (
        <span
          key={tag}
          className='inline-flex items-center gap-1 rounded-[var(--r-full)] bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--text-11)] text-[var(--accent)]'
        >
          <Hash size={10} />
          {tag}
          <button type='button' aria-label={t('common.remove_value0', { value0: tag })} onClick={() => handleRemoveTag(tag)} className='hover:text-[var(--text-primary)]'>
            <X size={10} />
          </button>
        </span>
      ))}
    </div>
  )
}

function TagComposer({ form }: { form: PublishForm }) {
  const { tagInput, setTagInput, handleAddTag } = form
  return (
    <div className='flex gap-2'>
      <Input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleAddTag()
          }
        }}
        placeholder={t('blog.tags_placeholder')}
        aria-label={t('blog.tags')}
      />
      <Button size='sm' onClick={handleAddTag}>
        {t('blog.add_tag')}
      </Button>
    </div>
  )
}

function TagsSection({ form }: { form: PublishForm }) {
  // A group rather than one field: the section is a set of chips plus the text entry that adds to
  // it, so the legend names the group and the entry carries its own name (a `Field` label could only
  // address one of the two, and the chips sit between the label and the input).
  return (
    <fieldset>
      <legend className='mb-1 block font-medium text-[var(--text-secondary)]'>{t('blog.tags')}</legend>
      <AvailableTagPicker form={form} />
      <SelectedTagList form={form} />
      <TagComposer form={form} />
    </fieldset>
  )
}

function ExcerptField({ form }: { form: PublishForm }) {
  const { excerpt, setExcerpt } = form
  return (
    <Field label={t('blog.excerpt')}>
      <Textarea
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        placeholder={t('blog.excerpt_placeholder')}
        className='resize-none'
      />
    </Field>
  )
}

function PublishFooter({
  form,
  editing,
  isPublished,
  onClose,
}: {
  form: PublishForm
  editing: boolean
  isPublished: boolean
  onClose: () => void
}) {
  const { previewUrl, isSaving, handleSave } = form
  return (
    <div className='flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3'>
      <a
        href={previewUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex items-center gap-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:text-[var(--accent)]'
      >
        <ExternalLink size={12} />
        <span>{t('blog.frontend_preview')}</span>
      </a>

      <div className='flex items-center gap-2'>
        <Button variant='ghost' size='sm' onClick={onClose} disabled={isSaving}>
          {t('common.cancel')}
        </Button>
        {isPublished && (
          <Button
            variant='secondary'
            size='sm'
            loading={isSaving}
            onClick={() => void handleSave(false)}
          >
            {t('blog.unpublish')}
          </Button>
        )}
        <Button
          variant='primary'
          size='sm'
          loading={isSaving}
          onClick={() => void handleSave(true)}
        >
          {editing ? t('blog.update_post') : t('blog.publish_now')}
        </Button>
      </div>
    </div>
  )
}

export function BlogPublishModal({
  open,
  onClose,
  noteId,
  post: initialPost,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  noteId: string
  post?: BlogPostIndexEntry | null
  onSaved?: () => void
}) {
  const form = useBlogPublishForm({ open, onClose, noteId, initialPost, onSaved })
  const editing = Boolean(initialPost)
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={MODAL_WIDTH}
      ariaLabel={editing ? t('blog.edit_modal_title') : t('blog.publish_modal_title')}
      className='p-0 overflow-hidden'
    >
      <div className='flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]'>
        <div className='flex items-center gap-2'>
          <Globe size={16} className='text-[var(--accent)]' />
          <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
            {editing ? t('blog.edit_modal_title') : t('blog.publish_modal_title')}
          </h2>
        </div>
        <IconButton label={t('common.close')} size='sm' onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4 text-[length:var(--text-12\\.5)]">
        <TitleField form={form} />
        <SlugField form={form} />
        <CoverField form={form} />
        <div className='grid grid-cols-2 gap-4'>
          <FolderField form={form} />
          <CategoryField form={form} />
        </div>
        <PublishTimeField form={form} />
        <PinRow form={form} />
        <TagsSection form={form} />
        <ExcerptField form={form} />
        <CommentsRow form={form} />
      </div>

      <PublishFooter form={form} editing={editing} isPublished={Boolean(initialPost?.isPublished)} onClose={onClose} />
    </Modal>
  )
}
