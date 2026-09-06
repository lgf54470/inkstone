import { useState } from 'react'
import type { BlogPost } from '@shared/types'
import { upsertFrontMatterProperty } from '@shared/markdown-utils'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useNotes } from '../../store/notes'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'


interface BlogNoteSubmenuBundle {
    isBusy: boolean
    isCopied: boolean
    postUrl: string
    handleOpenBlog: () => void
    handleCopyLink: () => Promise<void>
    handleSync: () => Promise<void>
    handleUnpublish: () => Promise<void>
}

export function useBlogNoteSubmenu({
    noteId,
    post,
    closeMenu,
}: {
    noteId: string
    post: BlogPost
    closeMenu: () => void
}): BlogNoteSubmenuBundle {
    const toast = useUi((s) => s.toast)
    const settings = useBlogStore((s) => s.settings)
    const [isBusy, setIsBusy] = useState(false)

    const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
    const postUrl = `${frontendBase}/posts/${post.slug}`

    const { isCopied, handleCopyLink } = useCopyLink(postUrl, toast, closeMenu)
    const handleOpenBlog = () => {
        window.open(postUrl, '_blank', 'noopener,noreferrer')
        closeMenu()
    }
    const handleSync = () => syncPostImpl(post, toast, setIsBusy, closeMenu)
    const handleUnpublish = () => unpublishPostImpl({ noteId, post, toast, setIsBusy, closeMenu })

    return { isBusy, isCopied, postUrl, handleOpenBlog, handleCopyLink, handleSync, handleUnpublish }
}

function useCopyLink(postUrl: string, toast: UiState['toast'], closeMenu: () => void) {
    const [isCopied, setIsCopied] = useState(false)

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(postUrl)
            setIsCopied(true)
            toast({ title: t('blog.link_copied'), tone: 'success' })
            setTimeout(() => setIsCopied(false), 1500)
        } catch {
            toast({ title: t('common.action_failed'), tone: 'danger' })
        }
        closeMenu()
    }

    return { isCopied, handleCopyLink }
}

async function syncPostImpl(
    post: BlogPost,
    toast: UiState['toast'],
    setIsBusy: (busy: boolean) => void,
    closeMenu: () => void,
): Promise<void> {
    setIsBusy(true)
    try {
        await api.blog.posts.sync(post.id)
        await useBlogStore.getState().loadPosts()
        toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
        toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
        setIsBusy(false)
        closeMenu()
    }
}

async function unpublishPostImpl({
    noteId,
    post,
    toast,
    setIsBusy,
    closeMenu,
}: {
    noteId: string
    post: BlogPost
    toast: UiState['toast']
    setIsBusy: (busy: boolean) => void
    closeMenu: () => void
}): Promise<void> {
    const ok = await confirm({
        title: t('blog.confirm_unpublish'),
        description: t('blog.unpublish_description'),
        confirmLabel: t('blog.unpublish'),
        tone: 'danger',
    })
    if (!ok) return

    setIsBusy(true)
    try {
        await api.blog.posts.patch(post.id, { isPublished: false })
        await useBlogStore.getState().loadPosts()

        const notesState = useNotes.getState()
        const activeNote = notesState.notes[noteId]
        if (activeNote) {
            let noteContent = notesState.contents[noteId]
            if (noteContent === undefined) {
                noteContent = (await notesState.peekContent(noteId)) ?? ''
            }
            const updatedContent = upsertFrontMatterProperty(noteContent, 'isPublished', false)
            notesState.editContent(noteId, updatedContent)
            await notesState.flush({ immediate: true })
        }

        toast({ title: t('blog.unpublish'), tone: 'default' })
        closeMenu()
    } catch {
        toast({ title: t('common.action_failed'), tone: 'danger' })
    } finally {
        setIsBusy(false)
    }
}