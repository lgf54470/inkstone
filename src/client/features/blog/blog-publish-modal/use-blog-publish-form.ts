import { useEffect, useMemo, useState } from 'react'
import type { BlogPost } from '@shared/types'
import { parseFrontMatter, upsertFrontMatterProperty } from '@shared/markdown-utils'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { t } from '../../../lib/i18n'
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
  initialPost?: BlogPost | null
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


  return {
    title,
    setTitle,
    slug,
    setSlug,
    coverUrl,
    setCoverUrl,
    folderId,
    setFolderId,
    categoryId,
    setCategoryId,
    tagInput,
    setTagInput,
    tags,
    setTags,
    excerpt,
    setExcerpt,
    allowComments,
    setAllowComments,
    isPinned,
    setIsPinned,
    isSaving,
    slugAvailable,
    slugReason,
    flatFolderList,
    firstImageInContent,
    note,
    availableTags,
    categories,
    previewUrl,
    handleAddTag,
    handleRemoveTag,
    handleSave,
  }
}
