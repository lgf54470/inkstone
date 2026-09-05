import { useEffect, useState, useMemo } from 'react'
import {
  Globe,
  Image as ImageIcon,
  Check,
  Hash,
  X,
  Sparkles,
  ExternalLink,
} from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { Modal } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { Input, Switch } from '../../components/form'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { api } from '../../lib/api'
import { parseFrontMatter, upsertFrontMatterProperty } from '@shared/markdown-utils'
import { buildBlogFolderTree, useBlogStore, type BlogFolderNode } from './blog-store'

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
  const toast = useUi((s) => s.toast)
  const note = useNotes((s) => s.notes[noteId] ?? null)
  const content = useNotes((s) => s.contents[noteId] ?? '')

  useEffect(() => {
    if (open && noteId && !content) {
      void useNotes.getState().peekContent(noteId)
    }
  }, [open, noteId, content])

  const categories = useBlogStore((s) => s.categories)
  const loadCategories = useBlogStore((s) => s.loadCategories)
  const folders = useBlogStore((s) => s.folders)
  const availableTags = useBlogStore((s) => s.tags)
  const currentStoreFolderId = useBlogStore((s) => s.folderId)
  const settings = useBlogStore((s) => s.settings)

  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [folderId, setFolderId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [excerpt, setExcerpt] = useState('')
  const [allowComments, setAllowComments] = useState(true)
  const [isPinned, setIsPinned] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null)
  const [slugReason, setSlugReason] = useState('')

  const flatFolderList = useMemo(() => {
    const tree = buildBlogFolderTree(folders)
    const result: Array<{ id: string; name: string; depth: number }> = []
    const traverse = (nodes: BlogFolderNode[]) => {
      for (const node of nodes) {
        result.push({ id: node.folder.id, name: node.folder.name, depth: node.depth })
        if (node.children.length) traverse(node.children)
      }
    }
    traverse(tree)
    return result
  }, [folders])

  // Helper to extract clean image URL from Markdown or plain string
  const cleanImageUrl = (raw: string) => {
    if (!raw) return ''
    const trimmed = raw.trim()
    const match = /!\[.*?\]\(([^)\s]+)/.exec(trimmed)
    if (match) return match[1]
    const paren = /\(([^)\s]+)\)/.exec(trimmed)
    if (paren) return paren[1]
    return trimmed
  }

  // Find first image in note content as suggested cover
  const firstImageInContent = useMemo(() => {
    if (!content) return null
    // Matches markdown images: ![alt](url)
    const match = /!\[([^\]]*)\]\(([^)\s]+)/.exec(content)
    if (match) {
      return { alt: match[1] || 'Cover', url: match[2] || '', raw: match[0] }
    }
    return null
  }, [content])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  // Initialize form state
  useEffect(() => {
    if (!open || !note) return

    // Parse Frontmatter from note content
    const front = parseFrontMatter(content)
    const fmData = front.data as Record<string, unknown>

    if (initialPost) {
      setTitle(initialPost.title || note.title || '')
      setSlug(initialPost.slug || '')
      setCoverUrl(cleanImageUrl(initialPost.coverUrl || ''))
      setFolderId(initialPost.folderId || null)
      setCategoryId(initialPost.categoryId || null)
      setTags(initialPost.tags || [])
      setExcerpt(initialPost.excerpt || note.excerpt || '')
      setAllowComments(initialPost.allowComments)
      setIsPinned(initialPost.isPinned)
    } else {
      setTitle(note.title || '')
      // Auto-generate initial slug
      const initialSlug = (note.title || 'post')
        .toLowerCase()
        .replace(/[\s/\\?#]+/g, '-')
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, 30) || 'post'
      setSlug(initialSlug)

      // Check Frontmatter Cover
      const fmCover = typeof fmData.Cover === 'string' ? fmData.Cover : ''
      if (fmCover) {
        setCoverUrl(cleanImageUrl(fmCover))
      } else if (firstImageInContent) {
        setCoverUrl(firstImageInContent.url)
      } else {
        setCoverUrl('')
      }

      setFolderId(currentStoreFolderId || null)
      setCategoryId(null)
      // Inherit tags from note tags or frontmatter tags
      const combinedTags = Array.from(new Set([...(note.tags || [])]))
      setTags(combinedTags)
      setExcerpt(note.excerpt || '')
      setAllowComments(true)
      setIsPinned(false)
    }
  }, [open, note, initialPost, firstImageInContent, currentStoreFolderId])

  // Real-time slug validation
  useEffect(() => {
    const trimmed = slug.trim()
    if (!trimmed) {
      setSlugAvailable(false)
      setSlugReason(t('blog.slug_placeholder'))
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.blog.checkSlug(trimmed, initialPost?.id)
        setSlugAvailable(res.available)
        setSlugReason(res.reason || '')
      } catch {
        setSlugAvailable(null)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [slug, initialPost?.id])

  const handleAddTag = () => {
    const val = tagInput.trim()
    if (!val || tags.includes(val)) return
    setTags([...tags, val])
    setTagInput('')
  }

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const handleSave = async (publish: boolean) => {
    if (!note) return
    const finalTitle = title.trim() || note.title || t('common.untitled_note')
    const finalSlug = slug.trim().toLowerCase()

    if (!finalSlug) {
      toast({ title: t('blog.slug_hint'), tone: 'warning' })
      return
    }

    setIsSaving(true)
    try {
      const notesState = useNotes.getState()
      let noteContent = notesState.contents[noteId]
      if (noteContent === undefined) {
        noteContent = (await notesState.peekContent(noteId)) ?? ''
      }

      // 1. Save or Update in Blog Backend
      await useBlogStore.getState().savePost({
        noteId,
        title: finalTitle,
        slug: finalSlug,
        excerpt: excerpt.trim(),
        content: noteContent,
        coverUrl: coverUrl.trim(),
        folderId,
        categoryId,
        tags,
        isPublished: publish,
        allowComments,
        isPinned,
      })

      // 2. Dual-way linkage: Update original note Frontmatter!
      // Add or update: isPublished: true/false, Cover: coverUrl
      let updatedContent = upsertFrontMatterProperty(noteContent, 'isPublished', publish)
      if (coverUrl.trim()) {
        updatedContent = upsertFrontMatterProperty(updatedContent, 'Cover', coverUrl.trim())
      }
      notesState.editContent(noteId, updatedContent)
      await notesState.flush({ immediate: true })

      toast({
        title: publish ? t('blog.publish_now') : t('common.saved'),
        tone: 'success',
      })

      onSaved?.()
      onClose()
    } catch (error: unknown) {
      toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
    } finally {
      setIsSaving(false)
    }
  }

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const previewUrl = `${frontendBase}/posts/${slug.trim() || 'preview'}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={640}
      className="p-0 overflow-hidden"
    >
      <div className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-[var(--accent)]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            {initialPost ? t('blog.edit_modal_title') : t('blog.publish_modal_title')}
          </h2>
        </div>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4 text-[12.5px]">
        <div>
          <label className="mb-1 block font-medium text-[var(--text-secondary)]">
            {t('blog.post_title')}
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={note?.title || t('common.untitled_note')}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-medium text-[var(--text-secondary)]">
              {t('blog.slug')}
            </label>
            {slugAvailable === true && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--success)]">
                <Check size={11} /> {t('blog.slug_available')}
              </span>
            )}
            {slugAvailable === false && slugReason && (
              <span className="text-[11px] text-[var(--danger)]">{slugReason}</span>
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
          <p className="mt-1 text-[11px] text-[var(--text-quaternary)]">
            {previewUrl}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="font-medium text-[var(--text-secondary)]">
              {t('blog.cover')}
            </label>
            {firstImageInContent && (
              <button
                type="button"
                onClick={() => setCoverUrl(firstImageInContent.url)}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
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
          <p className="mt-1 text-[11px] text-[var(--text-quaternary)]">
            {t('blog.cover_hint')} {t('blog.frontmatter_cover_hint')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block font-medium text-[var(--text-secondary)]">
              {t('blog.folders')}
            </label>
            <select
              value={folderId || ''}
              onChange={(e) => setFolderId(e.target.value ? e.target.value : null)}
              className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">{t('blog.no_folder')}</option>
              {flatFolderList.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.depth > 0 ? `${'— '.repeat(f.depth)}${f.name}` : f.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block font-medium text-[var(--text-secondary)]">
              {t('blog.category')}
            </label>
            <select
              value={categoryId || ''}
              onChange={(e) => setCategoryId(e.target.value ? e.target.value : null)}
              className="h-8 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">{t('blog.no_category')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2">
          <div>
            <span className="block font-medium text-[var(--text-secondary)]">
              {t('blog.pin_to_top')}
            </span>
            <span className="text-[10.5px] text-[var(--text-quaternary)]">
              {t('blog.pin_to_top_hint')}
            </span>
          </div>
          <Switch checked={isPinned} onChange={setIsPinned} />
        </div>

        <div>
          <label className="mb-1 block font-medium text-[var(--text-secondary)]">
            {t('blog.tags')}
          </label>

          {availableTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-2">
              <span className="text-[10.5px] text-[var(--text-quaternary)] mr-1">
                {t('blog.tags')}:
              </span>
              {availableTags.map((at) => {
                const isSelected = tags.includes(at.name)
                return (
                  <button
                    key={at.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setTags(tags.filter((t) => t !== at.name))
                      } else {
                        setTags([...tags, at.name])
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10.5px] transition-colors',
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
          )}

          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-[var(--r-full)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] text-[var(--accent)]"
              >
                <Hash size={10} />
                {t}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(t)}
                  className="hover:text-[var(--text-primary)]"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
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
        </div>

        <div>
          <label className="mb-1 block font-medium text-[var(--text-secondary)]">
            {t('blog.excerpt')}
          </label>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            rows={2}
            placeholder={t('blog.excerpt_placeholder')}
            className="w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] p-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
          />
        </div>

        <div className="flex items-center justify-between rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-3">
          <div>
            <span className="block font-medium text-[var(--text-primary)]">
              {t('blog.allow_comments')}
            </span>
            <span className="text-[11px] text-[var(--text-quaternary)]">
              {t('blog.allow_comments_hint')}
            </span>
          </div>
          <Switch checked={allowComments} onChange={setAllowComments} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-3">
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] text-[var(--text-tertiary)] hover:text-[var(--accent)]"
        >
          <ExternalLink size={12} />
          <span>{t('blog.frontend_preview')}</span>
        </a>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          {initialPost?.isPublished && (
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
            {initialPost ? t('blog.update_post') : t('blog.publish_now')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
