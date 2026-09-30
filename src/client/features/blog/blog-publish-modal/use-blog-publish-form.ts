import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogPostIndexEntry } from '@shared/types'
import { parseFrontMatter, upsertFrontMatterProperty } from '@shared/markdown-utils'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
import type { UiState } from '../../../store/ui'
import { useUi } from '../../../store/ui'
import { useNotes } from '../../../store/notes'
import { buildBlogFolderTree, useBlogStore, type BlogFolderNode } from '../blog-store'

export function useBlogPublishForm({
  open,
  onClose,
  noteId,
  initialPost,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  noteId: string
  initialPost?: BlogPostIndexEntry | null
  onSaved?: () => void
}) {
  const toast = useUi((s) => s.toast)
  const note = useNotes((s) => s.notes[noteId] ?? null)
  const content = useNotes((s) => s.contents[noteId] ?? '')
  const categories = useBlogStore((s) => s.categories)
  const loadCategories = useBlogStore((s) => s.loadCategories)
  const folders = useBlogStore((s) => s.folders)
  const availableTags = useBlogStore((s) => s.tags)
  const currentStoreFolderId = useBlogStore((s) => s.folderId)
  const settings = useBlogStore((s) => s.settings)

  const fields = usePublishFormFields()
  const {
    title, slug, coverUrl, folderId, categoryId, tagInput, tags, excerpt,
    allowComments, isPinned, isSaving, slugAvailable, slugReason,
    setTitle, setSlug, setCoverUrl, setFolderId, setCategoryId,
    setTagInput, setTags, setExcerpt, setAllowComments,
    setIsPinned, setIsSaving, setSlugAvailable, setSlugReason,
  } = fields

  const flatFolderList = useFolderFlatList(folders)
  const firstImageInContent = useCoverSuggestion(content)

  useEffect(() => {
    if (open && noteId && !content) void useNotes.getState().peekContent(noteId)
    void loadCategories()
  }, [open, noteId, content, loadCategories])

  usePublishFormInit({
    open, note, initialPost, content, currentStoreFolderId, firstImageInContent,
    setters: { setTitle, setSlug, setCoverUrl, setFolderId, setCategoryId, setTags, setExcerpt, setAllowComments, setIsPinned },
  })
  useSlugValidation(slug, initialPost?.id, setSlugAvailable, setSlugReason)

  const handleAddTag = () => addTag(tagInput, tags, setTags, setTagInput)
  const handleRemoveTag = (tag: string) => setTags(tags.filter((t) => t !== tag))

  const handleSave = (publish: boolean) => savePublishedPost(publish, { note, noteId, title, slug, coverUrl, folderId, categoryId, tags, excerpt, allowComments, isPinned, toast, setIsSaving, onSaved, onClose })

  const frontendBase = (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')
  const previewUrl = `${frontendBase}/posts/${slug.trim() || 'preview'}`

  return {
    title, setTitle, slug, setSlug, coverUrl, setCoverUrl, folderId, setFolderId,
    categoryId, setCategoryId, tagInput, setTagInput, tags, setTags,
    excerpt, setExcerpt, allowComments, setAllowComments, isPinned, setIsPinned,
    isSaving, slugAvailable, slugReason, flatFolderList, firstImageInContent,
    note, availableTags, categories, previewUrl, handleAddTag, handleRemoveTag, handleSave,
  }
}

function usePublishFormFields() {
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
  return { title, setTitle, slug, setSlug, coverUrl, setCoverUrl, folderId, setFolderId, categoryId, setCategoryId, tagInput, setTagInput, tags, setTags, excerpt, setExcerpt, allowComments, setAllowComments, isPinned, setIsPinned, isSaving, setIsSaving, slugAvailable, setSlugAvailable, slugReason, setSlugReason }
}

function addTag(tagInput: string, tags: string[], setTags: (v: string[]) => void, setTagInput: (v: string) => void): void {
  const val = tagInput.trim()
  if (!val || tags.includes(val)) return
  setTags([...tags, val])
  setTagInput('')
}

interface PublishFormSetters {
  setTitle: (v: string) => void
  setSlug: (v: string) => void
  setCoverUrl: (v: string) => void
  setFolderId: (v: string | null) => void
  setCategoryId: (v: string | null) => void
  setTags: (v: string[]) => void
  setExcerpt: (v: string) => void
  setAllowComments: (v: boolean) => void
  setIsPinned: (v: boolean) => void
}

interface InitProps {
  open: boolean
  note: { title?: string; excerpt?: string; tags?: string[] } | null
  initialPost?: BlogPostIndexEntry | null
  content: string
  currentStoreFolderId: string | null
  firstImageInContent: { url: string } | null
  setters: PublishFormSetters
}

function usePublishFormInit({ open, note, initialPost, content, currentStoreFolderId, firstImageInContent, setters }: InitProps) {
  useEffect(() => {
    if (!open || !note) return
    if (initialPost) {
      applyInitialPost(initialPost, note, setters)
    } else {
      applyFreshNote(note, content, currentStoreFolderId, firstImageInContent, setters)
    }
  }, [open, note, initialPost, firstImageInContent, currentStoreFolderId])
}

function applyInitialPost(initialPost: BlogPostIndexEntry, note: { title?: string; excerpt?: string }, setters: PublishFormSetters): void {
  setters.setTitle(initialPost.title || note.title || '')
  setters.setSlug(initialPost.slug || '')
  setters.setCoverUrl(cleanImageUrl(initialPost.coverUrl || ''))
  setters.setFolderId(initialPost.folderId || null)
  setters.setCategoryId(initialPost.categoryId || null)
  setters.setTags(initialPost.tags || [])
  setters.setExcerpt(initialPost.excerpt || note.excerpt || '')
  setters.setAllowComments(initialPost.allowComments)
  setters.setIsPinned(initialPost.isPinned)
}

function applyFreshNote(
  note: { title?: string; excerpt?: string; tags?: string[] },
  content: string,
  currentStoreFolderId: string | null,
  firstImageInContent: { url: string } | null,
  setters: PublishFormSetters,
): void {
  setters.setTitle(note.title || '')
  const initialSlug = (note.title || 'post')
    .toLowerCase()
    .replace(/[\s/\\?#]+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30) || 'post'
  setters.setSlug(initialSlug)

  const front = parseFrontMatter(content)
  const fmData = front.data as Record<string, unknown>
  const fmCover = typeof fmData.Cover === 'string' ? fmData.Cover : ''
  if (fmCover) {
    setters.setCoverUrl(cleanImageUrl(fmCover))
  } else if (firstImageInContent) {
    setters.setCoverUrl(firstImageInContent.url)
  } else {
    setters.setCoverUrl('')
  }

  setters.setFolderId(currentStoreFolderId || null)
  setters.setCategoryId(null)
  setters.setTags(Array.from(new Set([...(note.tags || [])])))
  setters.setExcerpt(note.excerpt || '')
  setters.setAllowComments(true)
  setters.setIsPinned(false)
}

function cleanImageUrl(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const match = /!\[.*?\]\(([^)\s]+)/.exec(trimmed)
  if (match) return match[1]
  const paren = /\(([^)\s]+)\)/.exec(trimmed)
  if (paren) return paren[1]
  return trimmed
}

function useCoverSuggestion(content: string) {
  return useMemo(() => {
    if (!content) return null
    const match = /!\[([^\]]*)\]\(([^)\s]+)/.exec(content)
    if (match) {
      return { alt: match[1] || 'Cover', url: match[2] || '', raw: match[0] }
    }
    return null
  }, [content])
}

function useFolderFlatList(folders: BlogStoreFolders) {
  return useMemo(() => {
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
}

function useSlugValidation(
  slug: string,
  postId: string | undefined,
  setSlugAvailable: (v: boolean | null) => void,
  setSlugReason: (v: string) => void,
) {
  useEffect(() => {
    const trimmed = slug.trim()
    if (!trimmed) {
      setSlugAvailable(false)
      setSlugReason(t('blog.slug_placeholder'))
      return
    }

    // Debounced, cancelled and sequence-checked: only the answer to the slug as it is typed last may
    // set the badge, or a slow reply about a previous slug claims the current one is taken.
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await api.blog.checkSlug(trimmed, postId, controller.signal)
        if (controller.signal.aborted) return
        setSlugAvailable(res.available)
        setSlugReason(res.reason || '')
      } catch {
        if (!controller.signal.aborted) setSlugAvailable(null)
      }
    }, 300)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [slug, postId])
}

interface SavePostCtx {
  note: { title?: string } | null
  noteId: string
  title: string
  slug: string
  coverUrl: string
  folderId: string | null
  categoryId: string | null
  tags: string[]
  excerpt: string
  allowComments: boolean
  isPinned: boolean
  toast: UiState['toast']
  setIsSaving: (v: boolean) => void
  onSaved?: () => void
  onClose: () => void
}

async function savePublishedPost(publish: boolean, ctx: SavePostCtx): Promise<void> {
  if (!ctx.note) return
  const finalTitle = ctx.title.trim() || ctx.note.title || t('common.untitled_note')
  const finalSlug = ctx.slug.trim().toLowerCase()

  if (!finalSlug) {
    ctx.toast({ title: t('blog.slug_hint'), tone: 'warning' })
    return
  }

  ctx.setIsSaving(true)
  try {
    const noteContent = await readNoteContent(ctx.noteId)
    const saved = await useBlogStore.getState().savePost({
      noteId: ctx.noteId,
      title: finalTitle,
      slug: finalSlug,
      excerpt: ctx.excerpt.trim(),
      content: noteContent,
      coverUrl: ctx.coverUrl.trim(),
      folderId: ctx.folderId,
      categoryId: ctx.categoryId,
      tags: ctx.tags,
      isPublished: publish,
      allowComments: ctx.allowComments,
      isPinned: ctx.isPinned,
    })
    if (!saved) return

    await writePostFrontMatter(ctx, noteContent, publish)
    ctx.toast({ title: publish ? t('blog.publish_now') : t('common.saved'), tone: 'success' })
    ctx.onSaved?.()
    ctx.onClose()
  } catch (error: unknown) {
    ctx.toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
  } finally {
    ctx.setIsSaving(false)
  }
}

/** The note may still be a stub in memory; storage holds the body in that case. */
async function readNoteContent(noteId: string): Promise<string> {
  const notesState = useNotes.getState()
  const content = notesState.contents[noteId]
  if (content !== undefined) return content
  return (await notesState.peekContent(noteId)) ?? ''
}

/** Mirrors what was published into the note's front matter, so the note list agrees with the post. */
async function writePostFrontMatter(ctx: SavePostCtx, noteContent: string, publish: boolean): Promise<void> {
  const notesState = useNotes.getState()
  let updatedContent = upsertFrontMatterProperty(noteContent, 'isPublished', publish)
  if (ctx.coverUrl.trim()) {
    updatedContent = upsertFrontMatterProperty(updatedContent, 'Cover', ctx.coverUrl.trim())
  }
  notesState.editContent(ctx.noteId, updatedContent)
  await notesState.flush({ immediate: true })
}

type BlogStoreFolders = ReturnType<typeof useBlogStore.getState>['folders']