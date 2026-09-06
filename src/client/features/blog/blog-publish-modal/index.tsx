import { Globe, Image as ImageIcon, Check, Hash, X, Sparkles, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import type { BlogPost } from '@shared/types'
import { Modal } from '../../../components/overlay'
import { Button, IconButton } from '../../../components/primitives'
import { Input, Switch } from '../../../components/form'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { useBlogPublishForm } from './use-blog-publish-form'

type PublishForm = ReturnType<typeof useBlogPublishForm>

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block font-medium text-[var(--text-secondary)]">{children}</label>
}

function FieldNote({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]">{children}</p>
}

function toggleTag(current: string[], name: string, setTags: (tags: string[]) => void) {
  if (current.includes(name)) setTags(current.filter((tag) => tag !== name))
  else setTags([...current, name])
}

function TitleField({ form }: { form: PublishForm }) {
  const { title, setTitle, note } = form
  return (
    <div>
      <FieldLabel>{t('blog.post_title')}</FieldLabel>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={note?.title || t('common.untitled_note')}
      />
    </div>
  )
}

function SlugField({ form }: { form: PublishForm }) {
  const { slug, setSlug, slugAvailable, slugReason, previewUrl } = form
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="font-medium text-[var(--text-secondary)]">{t('blog.slug')}</label>
        {slugAvailable === true && (
          <span className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--success)]">
            <Check size={11} /> {t('blog.slug_available')}
          </span>
        )}
        {slugAvailable === false && slugReason && (
          <span className="text-[length:var(--text-11)] text-[var(--danger)]">{slugReason}</span>
        )}
      </div>
      <div className="relative">
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
          placeholder={t('blog.slug_placeholder')}
          className="pr-20"
        />
      </div>
      <FieldNote>{previewUrl}</FieldNote>
    </div>
  )
}

function CoverField({ form }: { form: PublishForm }) {
  const { coverUrl, setCoverUrl, firstImageInContent } = form
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="font-medium text-[var(--text-secondary)]">{t('blog.cover')}</label>
        {firstImageInContent && (
          <button
            type="button"
            onClick={() => setCoverUrl(firstImageInContent.url)}
            className="inline-flex items-center gap-1 text-[length:var(--text-11)] text-[var(--accent)] hover:underline"
          >
            <Sparkles size={11} />
            {t('blog.use_first_image')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          leading={<ImageIcon size={13} className="text-[var(--text-quaternary)]" />}
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder={t('blog.cover_placeholder')}
        />
      </div>
      <FieldNote>
        {t('blog.cover_hint')} {t('blog.frontmatter_cover_hint')}
      </FieldNote>
    </div>
  )
}

function PublishSelect({
  value,
  onValueChange,
  children,
}: {
  value: string | null
  onValueChange: (value: string | null) => void
  children: ReactNode
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onValueChange(e.target.value || null)}
      className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2.5 text-[length:var(--text-12\\.5)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
    >
      {children}
    </select>
  )
}

function FolderField({ form }: { form: PublishForm }) {
  const { folderId, setFolderId, flatFolderList } = form
  return (
    <div>
      <FieldLabel>{t('blog.folders')}</FieldLabel>
      <PublishSelect value={folderId} onValueChange={setFolderId}>
        <option value="">{t('blog.no_folder')}</option>
        {flatFolderList.map((f) => (
          <option key={f.id} value={f.id}>
            {f.depth > 0 ? `${'— '.repeat(f.depth)}${f.name}` : f.name}
          </option>
        ))}
      </PublishSelect>
    </div>
  )
}

function CategoryField({ form }: { form: PublishForm }) {
  const { categoryId, setCategoryId, categories } = form
  return (
    <div>
      <FieldLabel>{t('blog.category')}</FieldLabel>
      <PublishSelect value={categoryId} onValueChange={setCategoryId}>
        <option value="">{t('blog.no_category')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </PublishSelect>
    </div>
  )
}

function PinRow({ form }: { form: PublishForm }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
      <div>
        <span className="block font-medium text-[var(--text-secondary)]">{t('blog.pin_to_top')}</span>
        <span className="text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)]">
          {t('blog.pin_to_top_hint')}
        </span>
      </div>
      <Switch checked={form.isPinned} onChange={form.setIsPinned} />
    </div>
  )
}

function CommentsRow({ form }: { form: PublishForm }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
      <div>
        <span className="block font-medium text-[var(--text-primary)]">{t('blog.allow_comments')}</span>
        <span className="text-[length:var(--text-11)] text-[var(--text-quaternary)]">
          {t('blog.allow_comments_hint')}
        </span>
      </div>
      <Switch checked={form.allowComments} onChange={form.setAllowComments} />
    </div>
  )
}

function AvailableTagPicker({ form }: { form: PublishForm }) {
  const { availableTags, tags, setTags } = form
  if (availableTags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1 mb-2">
      <span className="text-[length:var(--text-10\\.5)] text-[var(--text-quaternary)] mr-1">{t('blog.tags')}:</span>
      {availableTags.map((at) => {
        const isSelected = tags.includes(at.name)
        return (
          <button
            key={at.id}
            type="button"
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
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-[var(--r-full)] bg-[var(--accent-soft)] px-2 py-0.5 text-[length:var(--text-11)] text-[var(--accent)]"
        >
          <Hash size={10} />
          {tag}
          <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-[var(--text-primary)]">
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
    <div className="flex gap-2">
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
      />
      <Button size="sm" onClick={handleAddTag}>
        {t('blog.add_tag')}
      </Button>
    </div>
  )
}

function TagsSection({ form }: { form: PublishForm }) {
  return (
    <div>
      <FieldLabel>{t('blog.tags')}</FieldLabel>
      <AvailableTagPicker form={form} />
      <SelectedTagList form={form} />
      <TagComposer form={form} />
    </div>
  )
}

function ExcerptField({ form }: { form: PublishForm }) {
  const { excerpt, setExcerpt } = form
  return (
    <div>
      <FieldLabel>{t('blog.excerpt')}</FieldLabel>
      <textarea
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        placeholder={t('blog.excerpt_placeholder')}
        className="w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
      />
    </div>
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
    <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[length:var(--text-12)] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
      >
        <ExternalLink size={12} />
        <span>{t('blog.frontend_preview')}</span>
      </a>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
          {t('common.cancel')}
        </Button>
        {isPublished && (
          <Button
            variant="secondary"
            size="sm"
            loading={isSaving}
            onClick={() => void handleSave(false)}
          >
            {t('blog.unpublish')}
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
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
  post?: BlogPost | null
  onSaved?: () => void
}) {
  const form = useBlogPublishForm({ open, onClose, noteId, initialPost, onSaved })
  const editing = Boolean(initialPost)
  return (
    <Modal open={open} onClose={onClose} width={640} className="p-0 overflow-hidden">
      <div className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-[var(--accent)]" />
          <h2 className="text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]">
            {editing ? t('blog.edit_modal_title') : t('blog.publish_modal_title')}
          </h2>
        </div>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4 text-[length:var(--text-12\\.5)]">
        <TitleField form={form} />
        <SlugField form={form} />
        <CoverField form={form} />
        <div className="grid grid-cols-2 gap-4">
          <FolderField form={form} />
          <CategoryField form={form} />
        </div>
        <PinRow form={form} />
        <TagsSection form={form} />
        <ExcerptField form={form} />
        <CommentsRow form={form} />
      </div>

      <PublishFooter form={form} editing={editing} isPublished={Boolean(initialPost?.isPublished)} onClose={onClose} />
    </Modal>
  )
}
