import { useRef, useState } from 'react'
import { BarChart2, Check, Copy, ExternalLink, FolderClosed, FolderInput, PauseCircle, Pin, PlayCircle, Settings2, Trash2 } from 'lucide-react'
import type { BlogFolder, BlogPost } from '@shared/types'
import { confirm, useContextMenu, type MenuItem } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import type { UiState } from '../../../store/ui'
import { useUi } from '../../../store/ui'
import { useBlogStore, type BlogStoreState } from '../blog-store'

export function useBlogPostCard({
    post,
    folders,
    frontendBase,
    onOpenEdit,
    deleteConfirmKey = 'blog.confirm_delete_post',
}: {
    post: BlogPost
    folders: BlogFolder[]
    frontendBase: string
    onOpenEdit: (post: BlogPost) => void
    deleteConfirmKey?: DeleteConfirmKey
}) {
    const toast = useUi((s) => s.toast)
    const updatePost = useBlogStore((s) => s.updatePost)
    const deletePost = useBlogStore((s) => s.deletePost)
    const syncPost = useBlogStore((s) => s.syncPost)
    const batchMoveToFolder = useBlogStore((s) => s.batchMoveToFolder)
    const setActiveTab = useBlogStore((s) => s.setActiveTab)

    const contextMenu = useContextMenu()
    const [isFolderMenuOpen, setIsFolderMenuOpen] = useState(false)
    const folderButtonRef = useRef<HTMLButtonElement>(null)

    const postUrl = `${frontendBase}/posts/${post.slug}`

    const handleCopyLink = (slug: string) => copyPostLink(slug, frontendBase, toast)
    const handleSync = () => syncPostNow(post.id, syncPost, toast)
    const handleDelete = () => deletePostFlow(post, deletePost, toast, deleteConfirmKey)
    const handleMoveToFolder = (folderId: string | null) => movePostToFolder(post.id, folderId, batchMoveToFolder, toast)

    const folderMenuItems = buildFolderMenuItems(post, folders, handleMoveToFolder)
    const contextMenuItems = buildCardContextMenuItems({
        post, postUrl, folders, onOpenEdit, setActiveTab,
        handleCopyLink, handleDelete, handleMoveToFolder, updatePost,
    })

    return {
        toast, updatePost, setActiveTab,
        contextMenu, isFolderMenuOpen, setIsFolderMenuOpen, folderButtonRef,
        postUrl, folderMenuItems, contextMenuItems,
        handleCopyLink, handleSync, handleDelete,
    }
}

type DeleteConfirmKey = 'blog.confirm_delete_post' | 'blog.confirm_delete_post_detail'

export async function copyPostLink(slug: string, frontendBase: string, toast: UiState['toast']): Promise<void> {
    try {
        await navigator.clipboard.writeText(`${frontendBase}/posts/${slug}`)
        toast({ title: t('blog.link_copied'), tone: 'success' })
    } catch {
        toast({ title: t('common.action_failed'), tone: 'danger' })
    }
}

async function syncPostNow(id: string, syncPost: BlogStoreState['syncPost'], toast: UiState['toast']): Promise<void> {
    try {
        await syncPost(id)
        toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
        toast({ title: t('common.action_failed'), tone: 'danger' })
    }
}

async function deletePostFlow(post: BlogPost, deletePost: BlogStoreState['deletePost'], toast: UiState['toast'], deleteConfirmKey: DeleteConfirmKey): Promise<void> {
    const ok = await confirm({
        title: t('common.delete'),
        description: t(deleteConfirmKey, { value0: post.title }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
    })
    if (!ok) return
    await deletePost(post.id)
    toast({ title: t('blog.post_deleted'), tone: 'default' })
}

async function movePostToFolder(
    id: string,
    folderId: string | null,
    batchMoveToFolder: BlogStoreState['batchMoveToFolder'],
    toast: UiState['toast'],
): Promise<void> {
    const ok = await batchMoveToFolder([id], folderId)
    if (ok) {
        toast({
            title: t('blog.batch_move_folder_success', { count: 1 }),
            tone: 'success',
        })
    }
}

function buildFolderMenuItems(
    post: BlogPost,
    folders: BlogFolder[],
    handleMoveToFolder: (folderId: string | null) => Promise<void>,
): MenuItem[] {
    return [
        {
            id: 'none',
            label: t('blog.no_folder'),
            icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
            checked: !post.folderId,
            onSelect: () => void handleMoveToFolder(null),
        },
        ...folders.map((f) => ({
            id: f.id,
            label: f.name,
            icon: (
                <span style={{ color: f.color ?? undefined }} className="shrink-0">
                    <FolderClosed size={13} />
                </span>
            ),
            checked: post.folderId === f.id,
            onSelect: () => void handleMoveToFolder(f.id),
        })),
    ]
}

interface CardMenuCtx {
    post: BlogPost
    postUrl: string
    folders: BlogFolder[]
    onOpenEdit: (post: BlogPost) => void
    setActiveTab: BlogStoreState['setActiveTab']
    handleCopyLink: (slug: string) => Promise<void>
    handleDelete: () => Promise<void>
    handleMoveToFolder: (folderId: string | null) => Promise<void>
    updatePost: BlogStoreState['updatePost']
}

function buildCardContextMenuItems(ctx: CardMenuCtx): MenuItem[] {
    return [
        { id: 'open_link', label: t('preview.open_in_new_tab'), icon: <ExternalLink size={13} />, onSelect: () => window.open(ctx.postUrl, '_blank') },
        { id: 'copy_link', label: t('blog.copy_link'), icon: <Copy size={13} />, onSelect: () => void ctx.handleCopyLink(ctx.post.slug) },
        { id: 'analytics', label: t('share.view_note_analytics'), icon: <BarChart2 size={13} />, onSelect: () => ctx.setActiveTab('dashboard') },
        { id: 'settings', label: t('blog.post_settings'), icon: <Settings2 size={13} />, onSelect: () => ctx.onOpenEdit(ctx.post) },
        {
            id: 'move',
            label: t('blog.batch_move_folder'),
            icon: <FolderInput size={13} />,
            separatorBefore: true,
            submenu: ({ closeMenu }) => <FolderMoveSubmenu post={ctx.post} folders={ctx.folders} onMove={ctx.handleMoveToFolder} closeMenu={closeMenu} />,
        },
        {
            id: 'toggle',
            label: ctx.post.isPublished ? t('blog.unpublish') : t('blog.publish'),
            icon: ctx.post.isPublished ? <PauseCircle size={13} className="text-[var(--warning)]" /> : <PlayCircle size={13} className="text-[var(--success)]" />,
            onSelect: () => void ctx.updatePost(ctx.post.id, { isPublished: !ctx.post.isPublished }),
        },
        { id: 'pin', label: ctx.post.isPinned ? t('blog.unpin_post') : t('blog.pin_post'), icon: <Pin size={13} className={ctx.post.isPinned ? 'text-[var(--accent)] fill-current' : ''} />, onSelect: () => void ctx.updatePost(ctx.post.id, { isPinned: !ctx.post.isPinned }) },
        { id: 'delete', label: t('common.delete'), icon: <Trash2 size={13} />, tone: 'danger', separatorBefore: true, onSelect: () => void ctx.handleDelete() },
    ]
}

function FolderMoveSubmenu({
    post,
    folders,
    onMove,
    closeMenu,
}: {
    post: BlogPost
    folders: BlogFolder[]
    onMove: (folderId: string | null) => Promise<void>
    closeMenu: () => void
}) {
    return (
        <div className="py-1 min-w-[160px]">
            <button
                type="button"
                onClick={() => {
                    closeMenu()
                    void onMove(null)
                }}
                className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
                    !post.folderId && 'text-[var(--accent)] font-semibold',
                )}
            >
                <FolderClosed size={13} className="text-[var(--text-quaternary)]" />
                <span className="flex-1 truncate">{t('blog.no_folder')}</span>
                {!post.folderId && <Check size={12} className="text-[var(--accent)]" />}
            </button>
            {folders.map((f) => (
                <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                        closeMenu()
                        void onMove(f.id)
                    }}
                    className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
                        post.folderId === f.id && 'text-[var(--accent)] font-semibold',
                    )}
                >
                    <FolderClosed size={13} style={{ color: f.color ?? undefined }} className="shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {post.folderId === f.id && <Check size={12} className="text-[var(--accent)]" />}
                </button>
            ))}
        </div>
    )
}