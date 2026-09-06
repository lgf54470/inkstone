import { useEffect, useState } from 'react'
import type { BlogPost } from '@shared/types'
import { useNotes } from '../../store/notes'
import { useBlogStore, type BlogStoreState, type BlogTab } from './blog-store'

export interface BlogHubModalBundle {
    activeTab: BlogTab
    viewMode: 'table' | 'grid'
    posts: BlogStoreState['posts']
    loading: boolean
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
    const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
    const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
    const loadAll = useBlogStore((s) => s.loadAll)
    const setActiveTab = useBlogStore((s) => s.setActiveTab)

    const activeNote = useNotes((s) => (initialNoteId ? s.notes[initialNoteId] ?? null : null))

    const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
    const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
    const [targetNoteId, setTargetNoteId] = useState<string>('')
    const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false)
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

    useBlogHubModalEffects({
        open, initialNoteId, activeNote,
        loadAll, clearPostSelection, setTargetNoteId,
        setIsPublishModalOpen, setEditingPost,
        setIsCategoriesModalOpen, setIsSettingsModalOpen,
    })

    const handleOpenNewPost = () => {
        setEditingPost(null)
        setTargetNoteId(initialNoteId || (activeNote?.id ?? ''))
        setIsPublishModalOpen(true)
    }

    const handleOpenEditPost = (post: BlogPost) => {
        setEditingPost(post)
        setTargetNoteId(post.noteId)
        setIsPublishModalOpen(true)
    }

    return {
        activeTab, viewMode, posts, loading, selectedCount: selectedPostIds.size,
        onSwitchTab: setActiveTab, onOpenNewPost: handleOpenNewPost,
        onOpenEditPost: handleOpenEditPost,
        onOpenSettings: () => setIsSettingsModalOpen(true),
        onClearSelection: clearPostSelection, onSaved: loadAll,
        isPublishModalOpen, setIsPublishModalOpen, editingPost, targetNoteId,
        isCategoriesModalOpen, setIsCategoriesModalOpen,
        isSettingsModalOpen, setIsSettingsModalOpen,
    }
}

function useBlogHubModalEffects({
    open,
    initialNoteId,
    activeNote,
    loadAll,
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
    clearPostSelection: () => void
    setTargetNoteId: (id: string) => void
    setIsPublishModalOpen: (open: boolean) => void
    setEditingPost: (post: BlogPost | null) => void
    setIsCategoriesModalOpen: (open: boolean) => void
    setIsSettingsModalOpen: (open: boolean) => void
}) {
    useEffect(() => {
        if (open) {
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
    }, [open, loadAll, clearPostSelection, initialNoteId, activeNote])
}