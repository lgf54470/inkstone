import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
    AlertTriangle,
    Globe,
    Infinity as InfinityIcon,
    KeyRound,
    LayoutDashboard,
    PauseCircle,
    Pin,
    PlayCircle,
    Star,
    Timer,
} from 'lucide-react'
import type { ShareCategory, ShareFolder, ShareTag } from '@shared/types'
import { t } from '../../lib/i18n'
import { confirm } from '../../components/overlay'
import { useUi } from '../../store/ui'
import type { UiState } from '../../store/ui'
import { HubFolderItem } from '../../components/hub-folder-item'
import { HubTagItem } from '../../components/hub-tag-item'
import { buildShareFolderTree, useShareStore, type ShareFolderNode, type ShareStoreState } from './share-store'

export type ShareHubSidebarBundle = ReturnType<typeof useShareHubSidebar>

export function useShareHubSidebarState() {
    const createFolder = useShareStore((s) => s.createFolder)
    const createTag = useShareStore((s) => s.createTag)
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
    const [isFoldersSectionOpen, setIsFoldersSectionOpen] = useState(true)
    const [isTagsSectionOpen, setIsTagsSectionOpen] = useState(true)
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
    const [renamingTagId, setRenamingTagId] = useState<string | null>(null)
    const handleCreateRootFolder = async () => {
        const created = await createFolder(t('folders.create_new'))
        if (created) {
            setExpandedFolders((prev) => new Set([...prev, created.id]))
            setRenamingFolderId(created.id)
        }
    }
    const handleCreateNewTag = async () => {
        const name = window.prompt(t('tags.new_placeholder'))
        if (name?.trim()) {
            await createTag(name.trim())
        }
    }
    return {
        expandedFolders, setExpandedFolders,
        isFoldersSectionOpen, setIsFoldersSectionOpen,
        isTagsSectionOpen, setIsTagsSectionOpen,
        renamingFolderId, setRenamingFolderId, renamingTagId, setRenamingTagId,
        handleCreateRootFolder, handleCreateNewTag,
    }
}

export function useShareHubSidebar() {
    const state = useShareHubSidebarState()
    const toast = useUi((s) => s.toast)
    const category = useShareStore((s) => s.category)
    const setCategory = useShareStore((s) => s.setCategory)
    const selectedFolderId = useShareStore((s) => s.folderId)
    const setFolderId = useShareStore((s) => s.setFolderId)
    const selectedTag = useShareStore((s) => s.tag)
    const setTag = useShareStore((s) => s.setTag)
    const globalStats = useShareStore((s) => s.globalStats)
    const batchToggleGroup = useShareStore((s) => s.batchToggleGroup)
    const batchMoveToFolder = useShareStore((s) => s.batchMoveToFolder)
    const folders = useShareStore((s) => s.folders)
    const tags = useShareStore((s) => s.tags)
    const batchBusy = useShareStore((s) => s.batchBusy)
    const loadFolders = useShareStore((s) => s.loadFolders)
    const loadTags = useShareStore((s) => s.loadTags)
    const patchFolder = useShareStore((s) => s.patchFolder)
    const deleteFolder = useShareStore((s) => s.deleteFolder)
    const createFolder = useShareStore((s) => s.createFolder)
    const patchTag = useShareStore((s) => s.patchTag)
    const deleteTag = useShareStore((s) => s.deleteTag)

    const folderTree = useMemo(() => buildShareFolderTree(folders), [folders])
    useEffect(() => {
        void loadFolders(); void loadTags()
    }, [loadFolders, loadTags])

    const ctx: SidebarCtx = {
        ...state,
        category, selectedFolderId, selectedTag,
        setFolderId, setTag, globalStats, batchBusy,
        batchToggleGroup, batchMoveToFolder,
        patchFolder, deleteFolder, createFolder, patchTag, deleteTag, toast,
    }
    const renderFolderNode = (node: ShareFolderNode) => buildFolderNode(node, ctx)
    const renderTagNode = (tag: ShareTag) => buildTagNode(tag, ctx)
    return {
        categories: buildCategories(globalStats),
        renderFolderNode, renderTagNode,
        folderTree, tags, globalStats,
        category, selectedFolderId, selectedTag, setCategory,
        ...state,
    }
}

type SidebarCtx = {
    expandedFolders: Set<string>
    setExpandedFolders: (updater: (prev: Set<string>) => Set<string>) => void
    renamingFolderId: string | null
    setRenamingFolderId: (id: string | null) => void
    renamingTagId: string | null
    setRenamingTagId: (id: string | null) => void
    category: ShareCategory
    selectedFolderId: string | null
    selectedTag: string | null
    setFolderId: (id: string | null) => void
    setTag: (tag: string | null) => void
    globalStats: ShareStoreState['globalStats']
    batchBusy: ShareStoreState['batchBusy']
    batchToggleGroup: ShareStoreState['batchToggleGroup']
    batchMoveToFolder: ShareStoreState['batchMoveToFolder']
    patchFolder: ShareStoreState['patchFolder']
    deleteFolder: ShareStoreState['deleteFolder']
    createFolder: ShareStoreState['createFolder']
    patchTag: ShareStoreState['patchTag']
    deleteTag: ShareStoreState['deleteTag']
    toast: UiState['toast']
}

function buildCategories(globalStats: ShareStoreState['globalStats']): {
    id: ShareCategory
    label: string
    icon: ReactNode
    count?: number
}[] {
    return [
        { id: 'dashboard', label: t('share.category_dashboard'), icon: <LayoutDashboard size={14} className="text-[var(--accent)]" /> },
        { id: 'all', label: t('share.category_all'), icon: <Globe size={14} />, count: globalStats?.totalShares },
        { id: 'active', label: t('share.category_active'), icon: <PlayCircle size={14} className="text-[var(--success)]" />, count: globalStats?.activeShares },
        { id: 'pinned', label: t('share.category_pinned'), icon: <Pin size={14} className="text-[var(--accent)]" />, count: globalStats?.pinnedShares },
        { id: 'starred', label: t('share.category_starred'), icon: <Star size={14} className="text-amber-500 fill-amber-500" />, count: globalStats?.starredShares },
        { id: 'paused', label: t('share.category_paused'), icon: <PauseCircle size={14} className="text-[var(--warning)]" />, count: globalStats?.pausedShares },
        { id: 'password', label: t('share.category_password'), icon: <KeyRound size={14} /> },
        { id: 'expiring', label: t('share.category_expiring'), icon: <Timer size={14} /> },
        { id: 'permanent', label: t('share.category_permanent'), icon: <InfinityIcon size={14} /> },
        { id: 'expired', label: t('share.category_expired'), icon: <AlertTriangle size={14} className="text-[var(--danger)]" />, count: globalStats?.expiredShares },
    ]
}

function buildFolderNode(node: ShareFolderNode, ctx: SidebarCtx): ReactNode {
    const { folder } = node
    const isExpanded = ctx.expandedFolders.has(folder.id)
    const isSelected = ctx.selectedFolderId === folder.id && !ctx.selectedTag && ctx.category === 'all'
    const counts = ctx.globalStats?.folderCounts[folder.id] || { total: 0, shared: 0 }
    const isRenaming = ctx.renamingFolderId === folder.id
    return (
        <HubFolderItem
            key={folder.id}
            node={node}
            isExpanded={isExpanded}
            isSelected={isSelected}
            counts={{ total: counts.total, enabled: counts.shared }}
            isRenaming={isRenaming}
            batchBusy={ctx.batchBusy}
            dropMime="application/inkstone-share-note-ids"
            labels={{
                enable: t('share.batch_enable'),
                disable: t('share.batch_disable'),
                toggleLabel: t('share.batch_toggle_label'),
                emptyHint: t('share.folder_empty_hint'),
            }}
            onToggleExpand={(e) => toggleFolderExpandFlow(folder.id, e, ctx)}
            onSelect={() => ctx.setFolderId(folder.id)}
            onBatchToggle={(enabled) => toggleFolderBatchFlow(folder.id, enabled, ctx)}
            onStartRename={() => ctx.setRenamingFolderId(folder.id)}
            onFinishRename={(nextName) => finishFolderRenameFlow(folder, nextName, ctx)}
            onCreateSubfolder={() => createSubfolderFlow(folder, ctx)}
            onColorChange={(color) => void ctx.patchFolder(folder.id, { color })}
            onDelete={() => deleteFolderFlow(folder, ctx)}
            onDropItems={(noteIds) => dropFolderItemsFlow(folder.id, noteIds, ctx)}
        >
            {isExpanded && node.children.length > 0 && node.children.map((child) => buildFolderNode(child, ctx))}
        </HubFolderItem>
    )
}

function buildTagNode(tag: ShareTag, ctx: SidebarCtx): ReactNode {
    const isSelected = ctx.selectedTag === tag.name
    const counts = ctx.globalStats?.tagCounts[tag.name] || { total: 0, shared: 0 }
    const isRenaming = ctx.renamingTagId === tag.id
    return (
        <HubTagItem
            key={tag.id}
            tag={tag}
            isSelected={isSelected}
            counts={{ total: counts.total, enabled: counts.shared }}
            isRenaming={isRenaming}
            batchBusy={ctx.batchBusy}
            labels={{
                rename: t('tags.rename'),
                color: t('folders.color'),
                enable: t('share.batch_enable'),
                disable: t('share.batch_disable'),
                toggleLabel: t('share.batch_toggle_label'),
                emptyHint: t('share.tag_empty_hint'),
            }}
            onSelect={() => ctx.setTag(tag.name)}
            onBatchToggle={(enabled) => toggleTagBatchFlow(tag.name, enabled, ctx)}
            onStartRename={() => ctx.setRenamingTagId(tag.id)}
            onFinishRename={(nextName) => finishTagRenameFlow(tag, nextName, ctx)}
            onColorChange={(color) => void ctx.patchTag(tag.id, { color })}
            onDelete={() => deleteTagFlow(tag, ctx)}
        />
    )
}

function toggleFolderExpandFlow(folderId: string, e: React.MouseEvent, ctx: SidebarCtx): void {
    e.stopPropagation()
    ctx.setExpandedFolders((prev) => {
        const next = new Set(prev)
        if (next.has(folderId)) next.delete(folderId)
        else next.add(folderId)
        return next
    })
}

async function toggleFolderBatchFlow(folderId: string, enabled: boolean, ctx: SidebarCtx): Promise<void> {
    const ok = await ctx.batchToggleGroup('folder', folderId, enabled)
    if (ok) {
        ctx.toast({
            title: enabled ? t('share.folder_batch_enabled_toast') : t('share.folder_batch_disabled_toast'),
            tone: 'success',
        })
    }
}

function finishFolderRenameFlow(folder: ShareFolder, nextName: string, ctx: SidebarCtx): void {
    ctx.setRenamingFolderId(null)
    if (nextName && nextName !== folder.name) {
        void ctx.patchFolder(folder.id, { name: nextName })
    }
}

async function createSubfolderFlow(folder: ShareFolder, ctx: SidebarCtx): Promise<void> {
    const created = await ctx.createFolder(t('sidebar.new_subfolder'), folder.id)
    if (created) {
        ctx.setExpandedFolders((prev) => new Set([...prev, folder.id]))
        ctx.setRenamingFolderId(created.id)
    }
}

async function deleteFolderFlow(folder: ShareFolder, ctx: SidebarCtx): Promise<void> {
    const ok = await confirm({
        title: t('sidebar.delete_folder_value0', { value0: folder.name }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
    })
    if (ok) {
        void ctx.deleteFolder(folder.id)
    }
}

async function dropFolderItemsFlow(folderId: string, noteIds: string[], ctx: SidebarCtx): Promise<void> {
    const ok = await ctx.batchMoveToFolder(noteIds, folderId)
    if (ok) {
        ctx.toast({
            title: t('share.batch_move_success', { count: noteIds.length }),
            tone: 'success',
        })
    }
}

async function toggleTagBatchFlow(tagName: string, enabled: boolean, ctx: SidebarCtx): Promise<void> {
    const ok = await ctx.batchToggleGroup('tag', tagName, enabled)
    if (ok) {
        ctx.toast({
            title: enabled ? t('share.tag_batch_enabled_toast') : t('share.tag_batch_disabled_toast'),
            tone: 'success',
        })
    }
}

function finishTagRenameFlow(tag: ShareTag, nextName: string, ctx: SidebarCtx): void {
    ctx.setRenamingTagId(null)
    if (nextName && nextName !== tag.name) {
        void ctx.patchTag(tag.id, { name: nextName })
    }
}

async function deleteTagFlow(tag: ShareTag, ctx: SidebarCtx): Promise<void> {
    const ok = await confirm({
        title: t('tags.delete'),
        description: t('tags.delete_confirm_value0', { value0: tag.name }),
        confirmLabel: t('common.delete'),
        tone: 'danger',
    })
    if (ok) {
        void ctx.deleteTag(tag.id)
    }
}