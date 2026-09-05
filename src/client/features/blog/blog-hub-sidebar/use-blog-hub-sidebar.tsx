import { useEffect, useMemo, useState } from 'react';
import {
  FileEdit,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Pin,
  PlayCircle,
} from 'lucide-react';
import type { Tag } from '@shared/types';
import { confirm } from '../../../components/overlay';
import { HubFolderItem } from '../../../components/hub-folder-item';
import { t } from '../../../lib/i18n';
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../../lib/tag-tree';
import { useUi } from '../../../store/ui';
import { buildBlogFolderTree, useBlogStore, type BlogFolderNode } from '../blog-store';

export function useBlogHubSidebar() {
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

  const folderTree = useMemo(() => buildBlogFolderTree(folders), [folders])

  const mappedTags = useMemo<Tag[]>(() => {
    return tags.map((bt) => ({
      id: bt.id,
      name: bt.name,
      color: bt.color ?? null,
      count: stats?.tagCounts?.[bt.name]?.total ?? bt.postsCount ?? 0,
      isPinned: Boolean(bt.isPinned),
      createdAt: bt.createdAt ?? 0,
    }))
  }, [tags, stats])

  const tagTree = useMemo(() => buildTagTree(mappedTags), [mappedTags])

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(() => new Set())
  const [isFoldersSectionOpen, setIsFoldersSectionOpen] = useState(true)
  const [isTagsSectionOpen, setIsTagsSectionOpen] = useState(true)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null)

  const parentTagPaths = useMemo(() => {
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
  }, [tagTree])

  useEffect(() => {
    if (parentTagPaths.length > 0) {
      setExpandedTagPaths((prev) => {
        if (prev.size === 0) {
          return new Set(parentTagPaths)
        }
        return prev
      })
    }
  }, [parentTagPaths])

  const flattenedTagNodes = useMemo(
    () => flattenTagTree(tagTree, expandedTagPaths),
    [tagTree, expandedTagPaths],
  )

  const getTagNodeCounts = (node: TagTreeNode): { total: number; published: number } => {
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

  useEffect(() => {
    void loadFolders()
    void loadTags()
  }, [loadFolders, loadTags])

  const pendingCommentsCount = comments.filter((c) => c.status === 'pending').length
  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')

  const toggleFolderExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

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

  const navItems: Array<{
    id: string
    label: string
    icon: React.ReactNode
    count?: number
    active: boolean
    onClick: () => void
    badgeTone?: 'default' | 'danger' | 'warning'
  }> = [
    {
      id: 'dashboard',
      label: t('blog.dashboard'),
      icon: <LayoutDashboard size={14} className="text-[var(--accent)]" />,
      active: activeTab === 'dashboard',
      onClick: () => setActiveTab('dashboard'),
    },
    {
      id: 'all',
      label: t('blog.all_posts'),
      icon: <FileText size={14} />,
      count: stats?.totalPosts,
      active: activeTab === 'posts' && statusFilter === 'all' && !selectedFolderId && !selectedTag,
      onClick: () => setStatusFilter('all'),
    },
    {
      id: 'published',
      label: t('blog.published_posts'),
      icon: <PlayCircle size={14} className="text-[var(--success)]" />,
      count: stats?.publishedPosts,
      active: activeTab === 'posts' && statusFilter === 'published' && !selectedFolderId && !selectedTag,
      onClick: () => setStatusFilter('published'),
    },
    {
      id: 'draft',
      label: t('blog.draft_posts'),
      icon: <FileEdit size={14} className="text-[var(--warning)]" />,
      count: stats ? Math.max(0, (stats.totalPosts ?? 0) - (stats.publishedPosts ?? 0)) : undefined,
      active: activeTab === 'posts' && statusFilter === 'draft' && !selectedFolderId && !selectedTag,
      onClick: () => setStatusFilter('draft'),
    },
    {
      id: 'pinned',
      label: t('blog.pinned_posts'),
      icon: <Pin size={14} className="text-[var(--accent)]" />,
      count: stats?.pinnedPosts,
      active: activeTab === 'posts' && statusFilter === 'pinned' && !selectedFolderId && !selectedTag,
      onClick: () => setStatusFilter('pinned'),
    },
    {
      id: 'comments',
      label: t('blog.comments'),
      icon: <MessageSquare size={14} />,
      count: pendingCommentsCount > 0 ? pendingCommentsCount : comments.length,
      badgeTone: pendingCommentsCount > 0 ? 'danger' : 'default',
      active: activeTab === 'comments',
      onClick: () => setActiveTab('comments'),
    },
  ]

  const renderFolderNodes = (nodes: BlogFolderNode[]) => {
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.folder.id)
      const isSelected = activeTab === 'posts' && selectedFolderId === node.folder.id
      const counts = stats?.folderCounts?.[node.folder.id] || { total: 0, published: 0 }
      const isRenaming = renamingFolderId === node.folder.id

      return (
        <HubFolderItem
          key={node.folder.id}
          node={node}
          isExpanded={isExpanded}
          isSelected={isSelected}
          counts={{ total: counts.total, enabled: counts.published }}
          isRenaming={isRenaming}
          batchBusy={batchBusy}
          dropMime="application/inkstone-blog-post-ids"
          labels={{
            enable: t('blog.folder_batch_enabled_toast'),
            disable: t('blog.folder_batch_disabled_toast'),
            toggleLabel: t('blog.batch_toggle_label'),
            emptyHint: t('blog.folder_empty_hint'),
          }}
          onToggleExpand={(e) => toggleFolderExpand(node.folder.id, e)}
          onSelect={() => setFolderId(node.folder.id)}
          onBatchToggle={async (enabled) => {
            const ok = await batchToggleGroup('folder', node.folder.id, enabled)
            if (ok) {
              toast({
                title: enabled
                  ? t('blog.folder_batch_enabled_toast')
                  : t('blog.folder_batch_disabled_toast'),
                tone: 'success',
              })
            }
          }}
          onStartRename={() => setRenamingFolderId(node.folder.id)}
          onFinishRename={(nextName) => {
            setRenamingFolderId(null)
            if (nextName && nextName !== node.folder.name) {
              void patchFolder(node.folder.id, { name: nextName })
            }
          }}
          onCreateSubfolder={async () => {
            const created = await createFolder(t('folders.create_new'), node.folder.id)
            if (created) {
              setExpandedFolders((prev) => new Set([...prev, node.folder.id, created.id]))
              setRenamingFolderId(created.id)
            }
          }}
          onColorChange={(color) => void patchFolder(node.folder.id, { color })}
          onDelete={async () => {
            const ok = await confirm({
              title: t('sidebar.delete_folder_value0', { value0: node.folder.name }),
              confirmLabel: t('common.delete'),
              tone: 'danger',
            })
            if (ok) {
              void deleteFolder(node.folder.id)
            }
          }}
          onDropItems={async (postIds) => {
            const ok = await batchMoveToFolder(postIds, node.folder.id)
            if (ok) {
              toast({
                title: t('blog.batch_move_folder_success', { count: postIds.length }),
                tone: 'success',
              })
            }
          }}
        >
          {isExpanded && node.children.length > 0 && renderFolderNodes(node.children)}
        </HubFolderItem>
      )
    })
  }

  return {
    activeTab,
    toast,
    setTag,
    selectedTag,
    stats,
    batchBusy,
    batchToggleGroup,
    deleteTag,
    patchTag,
    tags,
    folderTree,
    flattenedTagNodes,
    getTagNodeCounts,
    folders,
    frontendBase,
    handleCreateNewTag,
    handleCreateRootFolder,
    navItems,
    isFoldersSectionOpen,
    setIsFoldersSectionOpen,
    isTagsSectionOpen,
    setIsTagsSectionOpen,
    expandedTagPaths,
    renamingTagId,
    renderFolderNodes,
    setExpandedTagPaths,
    setRenamingTagId,
  };
}
