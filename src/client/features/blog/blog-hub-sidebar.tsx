import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileEdit,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Pin,
  PlayCircle,
  Plus,
  Settings,
} from 'lucide-react';
import type { Tag } from '@shared/types';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { IconButton } from '../../components/primitives';
import { Tooltip, confirm } from '../../components/overlay';
import { useUi } from '../../store/ui';
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../lib/tag-tree';
import { buildBlogFolderTree, useBlogStore, type BlogFolderNode } from './blog-store';
import { BlogFolderItem } from './blog-hub/blog-folder-item';
import { BlogTagItem } from './blog-hub/blog-tag-item';


export function BlogHubSidebar({
  onOpenCategoriesModal,
  onOpenSettingsModal,
}: {
  onOpenCategoriesModal: () => void
  onOpenSettingsModal: () => void
}) {
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
        <BlogFolderItem
          key={node.folder.id}
          node={node}
          isExpanded={isExpanded}
          isSelected={isSelected}
          counts={counts}
          isRenaming={isRenaming}
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
          onDropPosts={async (postIds) => {
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
        </BlogFolderItem>
      )
    })
  }

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] select-none">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={cn(
                'group flex w-full h-8 items-center justify-between rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors text-left',
                item.active
                  ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              )}
            >
              <div className="flex items-center gap-2 truncate">
                {item.icon}
                <span className="truncate">{item.label}</span>
              </div>
              {item.count !== undefined && (
                <span
                  className={cn(
                    'tabular text-[10px] px-1.5 py-0.5 rounded-full shrink-0',
                    item.badgeTone === 'danger'
                      ? 'bg-[var(--danger)] text-white font-bold animate-pulse'
                      : item.active
                        ? 'bg-[var(--accent)]/15 text-[var(--accent)] font-medium'
                        : 'text-[var(--text-quaternary)]',
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="pt-1">
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <button
              type="button"
              onClick={() => setIsFoldersSectionOpen(!isFoldersSectionOpen)}
              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              {isFoldersSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{t('blog.folders')}</span>
            </button>
            <Tooltip label={t('folders.create_new')} side="left">
              <IconButton
                label={t('folders.create_new')}
                size="sm"
                onClick={() => void handleCreateRootFolder()}
                className="opacity-0 group-hover/head:opacity-100 transition-opacity"
              >
                <Plus size={13} />
              </IconButton>
            </Tooltip>
          </div>

          {isFoldersSectionOpen && (
            <div className="space-y-0.5 pt-0.5">
              {folders.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                  {t('blog.no_folders')}
                </p>
              ) : (
                renderFolderNodes(folderTree)
              )}
            </div>
          )}
        </div>

        <div className="pt-1">
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <button
              type="button"
              onClick={() => setIsTagsSectionOpen(!isTagsSectionOpen)}
              className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
            >
              {isTagsSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>{t('blog.tags')}</span>
            </button>
            <Tooltip label={t('tags.new')} side="left">
              <IconButton
                label={t('tags.new')}
                size="sm"
                onClick={() => void handleCreateNewTag()}
                className="opacity-0 group-hover/head:opacity-100 transition-opacity"
              >
                <Plus size={13} />
              </IconButton>
            </Tooltip>
          </div>

          {isTagsSectionOpen && (
            <div className="space-y-0.5 pt-0.5">
              {flattenedTagNodes.length === 0 ? (
                <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                  {t('blog.no_tags')}
                </p>
              ) : (
                flattenedTagNodes.map((node) => {
                  const isSelected =
                    activeTab === 'posts' &&
                    (selectedTag === node.fullPath || selectedTag === node.name)
                  const counts = getTagNodeCounts(node)
                  const isRenaming = renamingTagId === node.tag.id
                  const hasChildren = node.children.length > 0
                  const isExpanded = expandedTagPaths.has(node.fullPath)

                  return (
                    <BlogTagItem
                      key={node.fullPath}
                      tag={{
                        id: node.tag.id,
                        userId: '',
                        name: node.fullPath,
                        color: node.tag.color,
                        isPinned: node.isPinned,
                        postsCount: node.count,
                        createdAt: node.tag.createdAt,
                      }}
                      displayName={node.name}
                      depth={node.depth}
                      hasChildren={hasChildren}
                      isExpanded={isExpanded}
                      onToggleExpand={() => {
                        setExpandedTagPaths((prev) => {
                          const next = new Set(prev)
                          if (next.has(node.fullPath)) next.delete(node.fullPath)
                          else next.add(node.fullPath)
                          return next
                        })
                      }}
                      isSelected={isSelected}
                      counts={counts}
                      isRenaming={isRenaming}
                      onSelect={() => setTag(node.fullPath)}
                      onBatchToggle={async (enabled) => {
                        const ok = await batchToggleGroup('tag', node.fullPath, enabled)
                        if (ok) {
                          toast({
                            title: enabled
                              ? t('blog.tag_batch_enabled_toast')
                              : t('blog.tag_batch_disabled_toast'),
                            tone: 'success',
                          })
                        }
                      }}
                      onStartRename={() => setRenamingTagId(node.tag.id)}
                      onFinishRename={(nextName) => {
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
                      }}
                      onColorChange={(color) => {
                        const realTag = tags.find((t) => t.id === node.tag.id || t.name === node.fullPath)
                        if (realTag) {
                          void patchTag(realTag.id, { color })
                        }
                      }}
                      onDelete={async () => {
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
                      }}
                    />
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] p-3 space-y-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCategoriesModal}
            className="flex-1 flex items-center justify-center gap-1 rounded-[var(--r-md)] px-2 py-1.5 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]"
          >
            <span>{t('blog.categories')}</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettingsModal}
            className="flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]"
            title={t('blog.settings')}
          >
            <Settings size={14} />
          </button>
          <a
            href={frontendBase}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-[var(--r-md)] p-1.5 text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors border border-[var(--border-subtle)]"
            title={t('blog.frontend_site')}
          >
            <ExternalLink size={14} />
          </a>
        </div>

        <div className="space-y-1 pt-1.5 border-t border-[var(--border-subtle)]/60 text-[11px] text-[var(--text-tertiary)]">
          <div className="flex items-center justify-between">
            <span>{t('blog.total_posts_count')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalPosts ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.total_published_count')}</span>
            <span className="font-semibold text-[var(--success)]">
              {stats?.publishedPosts ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.total_pv_views')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalViews ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>{t('blog.col_comments')}</span>
            <span className="font-semibold text-[var(--text-primary)]">
              {stats?.totalComments ?? 0}
            </span>
          </div>
        </div>
      </div>
    </aside>
  )
}


