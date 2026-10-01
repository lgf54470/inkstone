import { useCallback, useEffect, useState } from 'react'
import type { BlogPostIndexEntry, BlogPostSummary } from '@shared/types'
import { useNotes } from '../../store/notes'
import { useBlogStore, type BlogStoreState, type BlogTab } from './blog-store'

export interface BlogHubModalBundle {
  activeTab: BlogTab
  viewMode: 'table' | 'grid'
  posts: BlogStoreState['posts']
  loading: boolean
  /** Nothing came back and the load failed: the list draws a failure, not an empty state. */
  postsFailed: boolean
  onRetryPosts: () => void
  selectedCount: number
  onSwitchTab: (tab: BlogTab) => void
  onOpenNewPost: () => void
  onOpenEditPost: (post: BlogPostSummary) => void
  onOpenRevisionsPost: (post: BlogPostSummary) => void
  /** The post whose history panel is open, or null. */
  revisionsPost: BlogPostSummary | null
  onCloseRevisions: () => void
  onOpenSettings: () => void
  onClearSelection: () => void
  onSaved: () => Promise<void>
}

export function useBlogHubModal({
  open,
  initialNoteId,
}: {
  open: boolean
  initialNoteId?: string
}) {
  const activeTab = useBlogStore((s) => s.activeTab)
  const viewMode = useBlogStore((s) => s.viewMode)
  const posts = useBlogStore((s) => s.posts)
  const loading = useBlogStore((s) => s.loading)
  const postsFailed = useBlogStore((s) => s.loadErrors.has('posts'))
  const loadPosts = useBlogStore((s) => s.loadPosts)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
  const loadHubData = useBlogStore((s) => s.loadHubData)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)
  const hydrateTrafficFilters = useBlogStore((s) => s.hydrateTrafficFilters)

  const activeNote = useNotes((s) => (initialNoteId ? s.notes[initialNoteId] ?? null : null))

  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [revisionsPost, setRevisionsPost] = useState<BlogPostSummary | null>(null)
  const publish = useBlogPublishModal(initialNoteId, activeNote)

  useBlogHubBootstrapEffect({
    open, loadHubData, hydrateTrafficFilters, clearPostSelection,
    setIsPublishModalOpen: publish.setIsPublishModalOpen, setEditingPost: publish.setEditingPost,
    setIsCategoriesModalOpen, setIsSettingsModalOpen, setRevisionsPost,
  })
  useBlogHubTargetNoteEffect({ open, initialNoteId, activeNote, setTargetNoteId: publish.setTargetNoteId })

  return {
    activeTab, viewMode, posts, loading,
    postsFailed: postsFailed && posts.length === 0,
    onRetryPosts: () => void loadPosts(),
    selectedCount: selectedPostIds.size,
    onSwitchTab: setActiveTab, onOpenNewPost: publish.openNewPost,
    onOpenEditPost: publish.openEditPost,
    onOpenRevisionsPost: setRevisionsPost,
    revisionsPost, onCloseRevisions: () => setRevisionsPost(null),
    onOpenSettings: () => setIsSettingsModalOpen(true),
    onClearSelection: clearPostSelection, onSaved: () => loadHubData(),
    isPublishModalOpen: publish.isPublishModalOpen, setIsPublishModalOpen: publish.setIsPublishModalOpen,
    editingPost: publish.editingPost, targetNoteId: publish.targetNoteId,
    isCategoriesModalOpen, setIsCategoriesModalOpen,
    isSettingsModalOpen, setIsSettingsModalOpen,
  }
}

/** The publish dialog's own state: what it edits, which note it targets, and whether it is open. */
function useBlogPublishModal(initialNoteId: string | undefined, activeNote: { id: string } | null) {
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPostIndexEntry | null>(null)
  const [targetNoteId, setTargetNoteId] = useState<string>('')

  // Stable identities: these travel down to every list row, whose `memo` is defeated by a handler
  // that is rebuilt on each hub render.
  const openNewPost = useCallback(() => {
    setEditingPost(null)
    setTargetNoteId(initialNoteId || (activeNote?.id ?? ''))
    setIsPublishModalOpen(true)
  }, [initialNoteId, activeNote?.id])

  const openEditPost = useCallback((post: BlogPostSummary) => {
    setEditingPost(post)
    setTargetNoteId(post.noteId)
    setIsPublishModalOpen(true)
  }, [])

  return {
    isPublishModalOpen, setIsPublishModalOpen,
    editingPost, setEditingPost, targetNoteId, setTargetNoteId,
    openNewPost, openEditPost,
  }
}

/**
 * Opening loads the tab's own data and closing clears whatever belonged to the open session. The
 * open note is deliberately not a dependency here: it used to be, so editing a note while the hub
 * was open re-ran the whole bootstrap.
 */
function useBlogHubBootstrapEffect({
  open,
  loadHubData,
  hydrateTrafficFilters,
  clearPostSelection,
  setIsPublishModalOpen,
  setEditingPost,
  setIsCategoriesModalOpen,
  setIsSettingsModalOpen,
  setRevisionsPost,
}: {
  open: boolean
  loadHubData: () => Promise<void>
  hydrateTrafficFilters: () => void
  clearPostSelection: () => void
  setIsPublishModalOpen: (open: boolean) => void
  setEditingPost: (post: BlogPostIndexEntry | null) => void
  setIsCategoriesModalOpen: (open: boolean) => void
  setIsSettingsModalOpen: (open: boolean) => void
  setRevisionsPost: (post: BlogPostSummary | null) => void
}) {
  useEffect(() => {
    if (open) {
      // The stored switches are read here rather than when the store module loads: only this hub
      // shows them, and the read belongs to opening it.
      hydrateTrafficFilters()
      void loadHubData()
    } else {
      clearPostSelection()
      setIsPublishModalOpen(false)
      setEditingPost(null)
      setIsCategoriesModalOpen(false)
      setIsSettingsModalOpen(false)
      // The history panel belongs to this session too: reopening the hub on another note must not
      // find the previous post's panel still open.
      setRevisionsPost(null)
    }
  }, [open, loadHubData, hydrateTrafficFilters, clearPostSelection, setIsPublishModalOpen, setEditingPost, setIsCategoriesModalOpen, setIsSettingsModalOpen, setRevisionsPost])
}

/** The note the hub was opened from: applied once it is readable, not as a trigger to reload. */
function useBlogHubTargetNoteEffect({
  open,
  initialNoteId,
  activeNote,
  setTargetNoteId,
}: {
  open: boolean
  initialNoteId: string | undefined
  activeNote: { id: string } | null
  setTargetNoteId: (id: string) => void
}) {
  useEffect(() => {
    if (open && initialNoteId && activeNote) setTargetNoteId(initialNoteId)
  }, [open, initialNoteId, activeNote, setTargetNoteId])
}
