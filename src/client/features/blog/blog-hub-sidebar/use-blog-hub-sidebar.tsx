import { useEffect, useMemo, useState, type Dispatch, type MouseEvent, type ReactNode, type SetStateAction } from 'react'
import { FileEdit, FileText, LayoutDashboard, MessageSquare, Pin, PlayCircle } from 'lucide-react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogStats, BlogTag, Tag } from '@shared/types'
import { confirm } from '../../../components/overlay'
import { HubFolderItem } from '../../../components/hub-folder-item'
import { t } from '../../../lib/i18n'
import type { UiState } from '../../../store/ui'
import { useUi } from '../../../store/ui'
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../../lib/tag-tree'
import { buildBlogFolderTree, useBlogStore, type BlogFolderNode, type BlogStoreState, type BlogTab } from '../blog-store'

export interface SidebarNavItem {
  id: string
  label: string
  icon: ReactNode
  count?: number
  active: boolean
  onClick: () => void
  badgeTone?: 'default' | 'danger' | 'warning'
}


interface FolderRowCtx {
  expandedFolders: Set<string>
  activeTab: BlogTab
  selectedFolderId: string | null
  stats: BlogStats | null
  renamingFolderId: string | null
  batchBusy: boolean
  setFolderId: (id: string | null) => void
  setExpandedFolders: Dispatch<SetStateAction<Set<string>>>
  setRenamingFolderId: (id: string | null) => void
  batchToggleGroup: BlogStoreState['batchToggleGroup']
  toast: UiState['toast']
  patchFolder: BlogStoreState['patchFolder']
  createFolder: BlogStoreState['createFolder']
  deleteFolder: BlogStoreState['deleteFolder']
  batchMoveToFolder: BlogStoreState['batchMoveToFolder']
}

export interface TagRowCtx {
  activeTab: BlogTab
  selectedTag: string | null
  expandedTagPaths: Set<string>
  renamingTagId: string | null
  batchBusy: boolean
  getTagNodeCounts: (node: TagTreeNode) => { total: number; published: number }
  tags: BlogTag[]
  setTag: (tag: string | null) => void
  setExpandedTagPaths: Dispatch<SetStateAction<Set<string>>>
  setRenamingTagId: (id: string | null) => void
  batchToggleGroup: BlogStoreState['batchToggleGroup']
  toast: UiState['toast']
  patchTag: BlogStoreState['patchTag']
  deleteTag: BlogStoreState['deleteTag']
}

export function useBlogHubSidebar() {
  const store = useBlogHubSidebarStore()

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(() => new Set())
  const [isFoldersSectionOpen, setIsFoldersSectionOpen] = useState(true)
  const [isTagsSectionOpen, setIsTagsSectionOpen] = useState(true)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null)

  const folderTree = useMemo(() => buildBlogFolderTree(store.folders), [store.folders])
  const tagTree = useMemo(() => buildTagTree(mapBlogTags(store.tags, store.stats)), [store.tags, store.stats])
  const parentTagPaths = useMemo(() => collectParentTagPaths(tagTree), [tagTree])
  const flattenedTagNodes = useMemo(() => flattenTagTree(tagTree, expandedTagPaths), [tagTree, expandedTagPaths])

  useBlogHubSidebarEffects(store, parentTagPaths, setExpandedTagPaths)

  const pendingCommentsCount = store.comments.filter((c) => c.status === 'pending').length
  const frontendBase = (store.settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')

  const navItems = buildNavItems({ activeTab: store.activeTab, statusFilter: store.statusFilter, selectedFolderId: store.selectedFolderId, selectedTag: store.selectedTag, stats: store.stats, commentsCount: store.comments.length, pendingCommentsCount, setActiveTab: store.setActiveTab, setStatusFilter: store.setStatusFilter })
  const handleCreateRootFolder = () => createRootFolder(store.createFolder, setExpandedFolders, setRenamingFolderId)
  const handleCreateNewTag = () => createNewTag(store.createTag)

  const folderRowCtx: FolderRowCtx = {
    expandedFolders, activeTab: store.activeTab, selectedFolderId: store.selectedFolderId,
    stats: store.stats, renamingFolderId, batchBusy: store.batchBusy, setFolderId: store.setFolderId,
    setExpandedFolders, setRenamingFolderId, batchToggleGroup: store.batchToggleGroup,
    toast: store.toast, patchFolder: store.patchFolder, createFolder: store.createFolder,
    deleteFolder: store.deleteFolder, batchMoveToFolder: store.batchMoveToFolder,
  }

  const tagRowCtx: TagRowCtx = {
    activeTab: store.activeTab, selectedTag: store.selectedTag, expandedTagPaths, renamingTagId,
    batchBusy: store.batchBusy, getTagNodeCounts: (node) => getTagNodeCounts(node, store.stats),
    tags: store.tags, setTag: store.setTag, setExpandedTagPaths, setRenamingTagId,
    batchToggleGroup: store.batchToggleGroup, toast: store.toast, patchTag: store.patchTag, deleteTag: store.deleteTag,
  }

  return {
    toast: store.toast, stats: store.stats, batchBusy: store.batchBusy, folders: store.folders, frontendBase,
    handleCreateNewTag, handleCreateRootFolder, navItems,
    isFoldersSectionOpen, setIsFoldersSectionOpen, isTagsSectionOpen, setIsTagsSectionOpen,
    folderTree, flattenedTagNodes, folderRowCtx, tagRowCtx,
  }
}

function useBlogHubSidebarEffects(store: ReturnType<typeof useBlogHubSidebarStore>, parentTagPaths: string[], setExpandedTagPaths: Dispatch<SetStateAction<Set<string>>>) {
  useEffect(() => {
    if (parentTagPaths.length > 0) {
      setExpandedTagPaths((prev) => (prev.size === 0 ? new Set(parentTagPaths) : prev))
    }
  }, [parentTagPaths])

  useEffect(() => {
    void store.loadFolders()
    void store.loadTags()
  }, [store.loadFolders, store.loadTags])
}

function useBlogHubSidebarStore() {
  const toast = useUi((s) => s.toast)
  const activeTab = useBlogStore((s) => s.activeTab)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)
  const statusFilter = useBlogStore((s) => s.statusFilter)
  const setStatusFilter = useBlogStore((s) => s.setStatusFilter)
  const selectedFolderId = useBlogStore((s) => s.folderId)
  const setFolderId = useBlogStore((s) => s.setFolderId)
  const selectedTag = useBlogStore((s) => s.tag)
  const setTag = useBlogStore((s) => s.setTag)
  const stats = useBlogStore((s) => s.stats)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const folders = useBlogStore((s) => s.folders)
  const tags = useBlogStore((s) => s.tags)
  const batchBusy = useBlogStore((s) => s.batchBusy)
  const loadFolders = useBlogStore((s) => s.loadFolders)
  const loadTags = useBlogStore((s) => s.loadTags)
  const createFolder = useBlogStore((s) => s.createFolder)
  const patchFolder = useBlogStore((s) => s.patchFolder)
  const deleteFolder = useBlogStore((s) => s.deleteFolder)
  const createTag = useBlogStore((s) => s.createTag)
  const patchTag = useBlogStore((s) => s.patchTag)
  const deleteTag = useBlogStore((s) => s.deleteTag)
  const batchToggleGroup = useBlogStore((s) => s.batchToggleGroup)
  const batchMoveToFolder = useBlogStore((s) => s.batchMoveToFolder)
  return {
    toast, activeTab, setActiveTab, statusFilter, setStatusFilter,
    selectedFolderId, setFolderId, selectedTag, setTag,
    stats, comments, settings, folders, tags, batchBusy,
    loadFolders, loadTags, createFolder, patchFolder, deleteFolder,
    createTag, patchTag, deleteTag, batchToggleGroup, batchMoveToFolder,
  }
}

function mapBlogTags(tags: BlogTag[], stats: BlogStats | null): Tag[] {
  return tags.map((bt) => ({
    id: bt.id,
    name: bt.name,
    color: bt.color ?? null,
    count: stats?.tagCounts?.[bt.name]?.total ?? bt.postsCount ?? 0,
    isPinned: Boolean(bt.isPinned),
    createdAt: bt.createdAt ?? 0,
  }))
}

function collectParentTagPaths(tagTree: TagTreeNode[]): string[] {
  const result: string[] = []
  const visit = (nodes: readonly TagTreeNode[]) => {
    for (const node of nodes) {
      if (node.children.length > 0) {
        result.push(node.fullPath)
        visit(node.children)
      }
    }
  }
  visit(tagTree)
  return result
}

export function getTagNodeCounts(node: TagTreeNode, stats: BlogStats | null): { total: number; published: number } {
  let total = 0
  let published = 0
  const visit = (n: TagTreeNode) => {
    const direct = stats?.tagCounts?.[n.fullPath]
    if (direct) {
      total += direct.total
      published += direct.published
    }
    for (const ch of n.children) {
      visit(ch)
    }
  }
  visit(node)
  return { total: Math.max(total, node.totalCount), published }
}

interface NavCtx {
  activeTab: BlogTab
  statusFilter: 'all' | 'published' | 'draft' | 'pinned'
  selectedFolderId: string | null
  selectedTag: string | null
  stats: BlogStats | null
  commentsCount: number
  pendingCommentsCount: number
  setActiveTab: (tab: BlogTab) => void
  setStatusFilter: (status: 'all' | 'published' | 'draft' | 'pinned') => void
}

function isPostsTab(ctx: NavCtx, status: 'all' | 'published' | 'draft' | 'pinned'): boolean {
  return ctx.activeTab === 'posts' && ctx.statusFilter === status && !ctx.selectedFolderId && !ctx.selectedTag
}

function buildNavItems(ctx: NavCtx): SidebarNavItem[] {
  return [
    { id: 'dashboard', label: t('blog.dashboard'), icon: <LayoutDashboard size={14} className='text-[var(--accent)]' />, active: ctx.activeTab === 'dashboard', onClick: () => ctx.setActiveTab('dashboard') },
    { id: 'all', label: t('blog.all_posts'), icon: <FileText size={14} />, count: ctx.stats?.totalPosts, active: isPostsTab(ctx, 'all'), onClick: () => ctx.setStatusFilter('all') },
    { id: 'published', label: t('blog.published_posts'), icon: <PlayCircle size={14} className='text-[var(--success)]' />, count: ctx.stats?.publishedPosts, active: isPostsTab(ctx, 'published'), onClick: () => ctx.setStatusFilter('published') },
    {
      id: 'draft',
      label: t('blog.draft_posts'),
      icon: <FileEdit size={14} className='text-[var(--warning)]' />,
      count: ctx.stats ? Math.max(0, (ctx.stats.totalPosts ?? 0) - (ctx.stats.publishedPosts ?? 0)) : undefined,
      active: isPostsTab(ctx, 'draft'),
      onClick: () => ctx.setStatusFilter('draft'),
    },
    { id: 'pinned', label: t('blog.pinned_posts'), icon: <Pin size={14} className='text-[var(--accent)]' />, count: ctx.stats?.pinnedPosts, active: isPostsTab(ctx, 'pinned'), onClick: () => ctx.setStatusFilter('pinned') },
    {
      id: 'comments',
      label: t('blog.comments'),
      icon: <MessageSquare size={14} />,
      count: ctx.pendingCommentsCount > 0 ? ctx.pendingCommentsCount : ctx.commentsCount,
      badgeTone: ctx.pendingCommentsCount > 0 ? 'danger' : 'default',
      active: ctx.activeTab === 'comments',
      onClick: () => ctx.setActiveTab('comments'),
    },
  ]
}

export function renderFolderNodes(nodes: BlogFolderNode[], ctx: FolderRowCtx) {
  const labels = {
    enable: t('blog.folder_batch_enabled_toast'),
    disable: t('blog.folder_batch_disabled_toast'),
    toggleLabel: t('blog.batch_toggle_label'),
    emptyHint: t('blog.folder_empty_hint'),
  }
  return nodes.map((node) => {
    const isExpanded = ctx.expandedFolders.has(node.folder.id)
    const isSelected = ctx.activeTab === 'posts' && ctx.selectedFolderId === node.folder.id
    const counts = ctx.stats?.folderCounts?.[node.folder.id] || { total: 0, published: 0 }
    const isRenaming = ctx.renamingFolderId === node.folder.id

    return (
      <HubFolderItem
        key={node.folder.id}
        node={node}
        isExpanded={isExpanded}
        isSelected={isSelected}
        counts={{ total: counts.total, enabled: counts.published }}
        isRenaming={isRenaming}
        batchBusy={ctx.batchBusy}
        dropMime='application/inkstone-blog-post-ids'
        labels={labels}
        onToggleExpand={(e) => toggleFolderExpand(node.folder.id, e, ctx.setExpandedFolders)}
        onSelect={() => ctx.setFolderId(node.folder.id)}
        onBatchToggle={(enabled) => batchToggleFolder(node, enabled, ctx.batchToggleGroup, ctx.toast)}
        onStartRename={() => ctx.setRenamingFolderId(node.folder.id)}
        onFinishRename={(nextName) => finishFolderRename(node, nextName, ctx.patchFolder, ctx.setRenamingFolderId)}
        onCreateSubfolder={() => createSubfolder(node, ctx.createFolder, ctx.setExpandedFolders, ctx.setRenamingFolderId)}
        onColorChange={(color) => void ctx.patchFolder(node.folder.id, { color })}
        onDelete={() => deleteFolderFlow(node, ctx.deleteFolder)}
        onDropItems={(postIds) => dropItemsOnFolder(postIds, node, ctx.batchMoveToFolder, ctx.toast)}
      >
        {isExpanded && node.children.length > 0 && renderFolderNodes(node.children, ctx)}
      </HubFolderItem>
    )
  })
}

function toggleFolderExpand(folderId: string, e: MouseEvent, setExpandedFolders: Dispatch<SetStateAction<Set<string>>>): void {
  e.stopPropagation()
  setExpandedFolders((prev) => {
    const next = new Set(prev)
    if (next.has(folderId)) next.delete(folderId)
    else next.add(folderId)
    return next
  })
}

async function batchToggleFolder(node: BlogFolderNode, enabled: boolean, batchToggleGroup: BlogStoreState['batchToggleGroup'], toast: UiState['toast']): Promise<void> {
  const ok = await batchToggleGroup('folder', node.folder.id, enabled)
  if (ok) {
    toast({ title: enabled ? t('blog.folder_batch_enabled_toast') : t('blog.folder_batch_disabled_toast'), tone: 'success' })
  }
}

function finishFolderRename(node: BlogFolderNode, nextName: string, patchFolder: BlogStoreState['patchFolder'], setRenamingFolderId: (id: string | null) => void): void {
  setRenamingFolderId(null)
  if (nextName && nextName !== node.folder.name) {
    void patchFolder(node.folder.id, { name: nextName })
  }
}

async function createSubfolder(node: BlogFolderNode, createFolder: BlogStoreState['createFolder'], setExpandedFolders: Dispatch<SetStateAction<Set<string>>>, setRenamingFolderId: (id: string | null) => void): Promise<void> {
  const created = await createFolder(t('folders.create_new'), node.folder.id)
  if (created) {
    setExpandedFolders((prev) => new Set([...prev, node.folder.id, created.id]))
    setRenamingFolderId(created.id)
  }
}

async function deleteFolderFlow(node: BlogFolderNode, deleteFolder: BlogStoreState['deleteFolder']): Promise<void> {
  const ok = await confirm({
    title: t('sidebar.delete_folder_value0', { value0: node.folder.name }),
    confirmLabel: t('common.delete'),
    tone: 'danger',
  })
  if (ok) {
    void deleteFolder(node.folder.id)
  }
}

async function dropItemsOnFolder(postIds: string[], node: BlogFolderNode, batchMoveToFolder: BlogStoreState['batchMoveToFolder'], toast: UiState['toast']): Promise<void> {
  const ok = await batchMoveToFolder(postIds, node.folder.id)
  if (ok) {
    toast({ title: t('blog.batch_move_folder_success', { count: postIds.length }), tone: 'success' })
  }
}

async function createRootFolder(createFolder: BlogStoreState['createFolder'], setExpandedFolders: Dispatch<SetStateAction<Set<string>>>, setRenamingFolderId: (id: string | null) => void): Promise<void> {
  const created = await createFolder(t('folders.create_new'))
  if (created) {
    setExpandedFolders((prev) => new Set([...prev, created.id]))
    setRenamingFolderId(created.id)
  }
}

async function createNewTag(createTag: BlogStoreState['createTag']): Promise<void> {
  const name = window.prompt(t('tags.new_placeholder'))
  if (name?.trim()) {
    await createTag(name.trim())
  }
}

export function toggleTagExpand(path: string, setExpandedTagPaths: Dispatch<SetStateAction<Set<string>>>): void {
  setExpandedTagPaths((prev) => {
    const next = new Set(prev)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return next
  })
}

export async function batchToggleTag(node: TagTreeNode, enabled: boolean, batchToggleGroup: BlogStoreState['batchToggleGroup'], toast: UiState['toast']): Promise<void> {
  const ok = await batchToggleGroup('tag', node.fullPath, enabled)
  if (ok) {
    toast({ title: enabled ? t('blog.tag_batch_enabled_toast') : t('blog.tag_batch_disabled_toast'), tone: 'success' })
  }
}

export function finishTagRename(node: TagTreeNode, nextName: string, tags: BlogTag[], patchTag: BlogStoreState['patchTag'], setRenamingTagId: (id: string | null) => void): void {
  setRenamingTagId(null)
  if (nextName && nextName !== node.name) {
    const segments = node.fullPath.split('/')
    segments[segments.length - 1] = nextName
    const nextFullPath = segments.join('/')
    const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
    if (realTag) {
      void patchTag(realTag.id, { name: nextFullPath })
    }
  }
}

export function tagColorChange(node: TagTreeNode, color: string | null, tags: BlogTag[], patchTag: BlogStoreState['patchTag']): void {
  const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
  if (realTag) {
    void patchTag(realTag.id, { color })
  }
}

export async function deleteTagFlow(node: TagTreeNode, tags: BlogTag[], deleteTag: BlogStoreState['deleteTag']): Promise<void> {
  const ok = await confirm({
    title: t('tags.delete'),
    description: t('tags.delete_confirm_value0', { value0: node.name }),
    confirmLabel: t('common.delete'),
    tone: 'danger',
  })
  if (ok) {
    const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
    if (realTag) {
      void deleteTag(realTag.id)
    }
  }
}