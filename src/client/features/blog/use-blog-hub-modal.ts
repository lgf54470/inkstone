import { useEffect, useState } from 'react'
import type { BlogPost } from '@shared/types'
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
  onOpenEditPost: (post: BlogPost) => void
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
  const loadAll = useBlogStore((s) => s.loadAll)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)
  const hydrateTrafficFilters = useBlogStore((s) => s.hydrateTrafficFilters)

  const activeNote = useNotes((s) => (initialNoteId ? s.notes[initialNoteId] ?? null : null))

  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const publish = useBlogPublishModal(initialNoteId, activeNote)

  useBlogHubModalEffects({
    open, initialNoteId, activeNote,
    loadAll, hydrateTrafficFilters, clearPostSelection, setTargetNoteId: publish.setTargetNoteId,
    setIsPublishModalOpen: publish.setIsPublishModalOpen, setEditingPost: publish.setEditingPost,
    setIsCategoriesModalOpen, setIsSettingsModalOpen,
  })

  return {
    activeTab, viewMode, posts, loading,
    postsFailed: postsFailed && posts.length === 0,
    onRetryPosts: () => void loadPosts(),
    selectedCount: selectedPostIds.size,
    onSwitchTab: setActiveTab, onOpenNewPost: publish.openNewPost,
    onOpenEditPost: publish.openEditPost,
    onOpenSettings: () => setIsSettingsModalOpen(true),
    onClearSelection: clearPostSelection, onSaved: loadAll,
    isPublishModalOpen: publish.isPublishModalOpen, setIsPublishModalOpen: publish.setIsPublishModalOpen,
    editingPost: publish.editingPost, targetNoteId: publish.targetNoteId,
    isCategoriesModalOpen, setIsCategoriesModalOpen,
    isSettingsModalOpen, setIsSettingsModalOpen,
  }
}

/** The publish dialog's own state: what it edits, which note it targets, and whether it is open. */
function useBlogPublishModal(initialNoteId: string | undefined, activeNote: { id: string } | null) {
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [targetNoteId, setTargetNoteId] = useState<string>('')

  const openNewPost = () => {
    setEditingPost(null)
    setTargetNoteId(initialNoteId || (activeNote?.id ?? ''))
    setIsPublishModalOpen(true)
  }

  const openEditPost = (post: BlogPost) => {
    setEditingPost(post)
    setTargetNoteId(post.noteId)
    setIsPublishModalOpen(true)
  }

  return {
    isPublishModalOpen, setIsPublishModalOpen,
    editingPost, setEditingPost, targetNoteId, setTargetNoteId,
    openNewPost, openEditPost,
  }
}

function useBlogHubModalEffects({
  open,
  initialNoteId,
  activeNote,
  loadAll,
  hydrateTrafficFilters,
  clearPostSelection,
  setTargetNoteId,
  setIsPublishModalOpen,
  setEditingPost,
  setIsCategoriesModalOpen,
  setIsSettingsModalOpen,
}: {
  open: boolean
  initialNoteId?: string
  activeNote: { id: string } | null
  loadAll: () => Promise<void>
  hydrateTrafficFilters: () => void
  clearPostSelection: () => void
  setTargetNoteId: (id: string) => void
  setIsPublishModalOpen: (open: boolean) => void
  setEditingPost: (post: BlogPost | null) => void
  setIsCategoriesModalOpen: (open: boolean) => void
  setIsSettingsModalOpen: (open: boolean) => void
}) {
  useEffect(() => {
    if (open) {
      // The stored switches are read here rather than when the store module loads: only this hub
      // shows them, and the read belongs to opening it.
      hydrateTrafficFilters()
      void loadAll()
      if (initialNoteId && activeNote) {
        setTargetNoteId(initialNoteId)
      }
    } else {
      clearPostSelection()
      setIsPublishModalOpen(false)
      setEditingPost(null)
      setIsCategoriesModalOpen(false)
      setIsSettingsModalOpen(false)
    }
  }, [open, loadAll, hydrateTrafficFilters, clearPostSelection, initialNoteId, activeNote])
}