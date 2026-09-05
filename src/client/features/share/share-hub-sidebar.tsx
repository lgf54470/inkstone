import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Globe,
  Infinity as InfinityIcon,
  KeyRound,
  LayoutDashboard,
  PauseCircle,
  Pin,
  PlayCircle,
  Plus,
  Star,
  Timer,
} from 'lucide-react';
import type { ShareCategory } from '@shared/types';
import { cn } from '../../lib/cn';
import { t } from '../../lib/i18n';
import { IconButton } from '../../components/primitives';
import { Tooltip, confirm } from '../../components/overlay';
import { useUi } from '../../store/ui';
import { buildShareFolderTree, useShareStore, type ShareFolderNode } from './share-store';
import { ShareFolderItem } from './share-hub/share-folder-item';
import { ShareTagItem } from './share-hub/share-tag-item';


export function ShareHubSidebar() {
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
  const loadFolders = useShareStore((s) => s.loadFolders)
  const loadTags = useShareStore((s) => s.loadTags)
  const createFolder = useShareStore((s) => s.createFolder)
  const patchFolder = useShareStore((s) => s.patchFolder)
  const deleteFolder = useShareStore((s) => s.deleteFolder)
  const createTag = useShareStore((s) => s.createTag)
  const patchTag = useShareStore((s) => s.patchTag)
  const deleteTag = useShareStore((s) => s.deleteTag)

  const folderTree = useMemo(() => buildShareFolderTree(folders), [folders])

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())
  const [isFoldersSectionOpen, setIsFoldersSectionOpen] = useState(true)
  const [isTagsSectionOpen, setIsTagsSectionOpen] = useState(true)
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [renamingTagId, setRenamingTagId] = useState<string | null>(null)

  useEffect(() => {
    void loadFolders()
    void loadTags()
  }, [loadFolders, loadTags])

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

  const categories: Array<{
    id: ShareCategory
    label: string
    icon: React.ReactNode
    count?: number
  }> = [
    {
      id: 'dashboard',
      label: t('share.category_dashboard'),
      icon: <LayoutDashboard size={14} className="text-[var(--accent)]" />,
    },
    {
      id: 'all',
      label: t('share.category_all'),
      icon: <Globe size={14} />,
      count: globalStats?.totalShares,
    },
    {
      id: 'active',
      label: t('share.category_active'),
      icon: <PlayCircle size={14} className="text-[var(--success)]" />,
      count: globalStats?.activeShares,
    },
    {
      id: 'pinned',
      label: t('share.category_pinned'),
      icon: <Pin size={14} className="text-[var(--accent)]" />,
      count: globalStats?.pinnedShares,
    },
    {
      id: 'starred',
      label: t('share.category_starred'),
      icon: <Star size={14} className="text-amber-500 fill-amber-500" />,
      count: globalStats?.starredShares,
    },
    {
      id: 'paused',
      label: t('share.category_paused'),
      icon: <PauseCircle size={14} className="text-[var(--warning)]" />,
      count: globalStats?.pausedShares,
    },
    {
      id: 'password',
      label: t('share.category_password'),
      icon: <KeyRound size={14} />,
    },
    {
      id: 'expiring',
      label: t('share.category_expiring'),
      icon: <Timer size={14} />,
    },
    {
      id: 'permanent',
      label: t('share.category_permanent'),
      icon: <InfinityIcon size={14} />,
    },
    {
      id: 'expired',
      label: t('share.category_expired'),
      icon: <AlertTriangle size={14} className="text-[var(--danger)]" />,
      count: globalStats?.expiredShares,
    },
  ]

  const renderFolderNode = (node: ShareFolderNode) => {
    const isExpanded = expandedFolders.has(node.folder.id)
    const isSelected = selectedFolderId === node.folder.id && !selectedTag && category === 'all'
    const counts = globalStats?.folderCounts[node.folder.id] || { total: 0, shared: 0 }
    const isRenaming = renamingFolderId === node.folder.id

    return (
      <ShareFolderItem
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
                ? t('share.folder_batch_enabled_toast')
                : t('share.folder_batch_disabled_toast'),
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
          const created = await createFolder(t('sidebar.new_subfolder'), node.folder.id)
          if (created) {
            setExpandedFolders((prev) => new Set([...prev, node.folder.id]))
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
        onDropNotes={async (noteIds) => {
          const ok = await batchMoveToFolder(noteIds, node.folder.id)
          if (ok) {
            toast({
              title: t('share.batch_move_success', { count: noteIds.length }),
              tone: 'success',
            })
          }
        }}
      >
        {isExpanded && node.children.length > 0 && node.children.map(renderFolderNode)}
      </ShareFolderItem>
    )
  }

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)]">
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-0.5">
          {categories.map((cat) => {
            const isSelected = category === cat.id && !selectedFolderId && !selectedTag
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={cn(
                  'flex h-8 w-full items-center gap-2 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors',
                  isSelected
                    ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                {cat.icon}
                <span className="flex-1 text-left">{cat.label}</span>
                {cat.count !== undefined && cat.count > 0 && (
                  <span className="tabular rounded bg-[var(--bg-card)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)] shadow-sm">
                    {cat.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="my-3 h-px bg-[var(--border-subtle)]" />

        {/* Share folders */}
        <div className="group/head mb-1 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setIsFoldersSectionOpen(!isFoldersSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {isFoldersSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{t('navigation.folder')}</span>
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
            {folderTree.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_folders')}
              </p>
            ) : (
              folderTree.map(renderFolderNode)
            )}
          </div>
        )}

        <div className="my-3 h-px bg-[var(--border-subtle)]" />

        {/* Share tags */}
        <div className="group/head mb-1 flex items-center justify-between px-2">
          <button
            type="button"
            onClick={() => setIsTagsSectionOpen(!isTagsSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {isTagsSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>{t('navigation.tag')}</span>
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
            {tags.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_tags')}
              </p>
            ) : (
              tags.map((tag) => {
                const isSelected = selectedTag === tag.name
                const counts = globalStats?.tagCounts[tag.name] || { total: 0, shared: 0 }
                const isRenaming = renamingTagId === tag.id

                return (
                  <ShareTagItem
                    key={tag.id}
                    tag={tag}
                    isSelected={isSelected}
                    counts={counts}
                    isRenaming={isRenaming}
                    onSelect={() => setTag(tag.name)}
                    onBatchToggle={async (enabled) => {
                      const ok = await batchToggleGroup('tag', tag.name, enabled)
                      if (ok) {
                        toast({
                          title: enabled
                            ? t('share.tag_batch_enabled_toast')
                            : t('share.tag_batch_disabled_toast'),
                          tone: 'success',
                        })
                      }
                    }}
                    onStartRename={() => setRenamingTagId(tag.id)}
                    onFinishRename={(nextName) => {
                      setRenamingTagId(null)
                      if (nextName && nextName !== tag.name) {
                        void patchTag(tag.id, { name: nextName })
                      }
                    }}
                    onColorChange={(color) => void patchTag(tag.id, { color })}
                    onDelete={async () => {
                      const ok = await confirm({
                        title: t('tags.delete'),
                        description: t('tags.delete_confirm_value0', { value0: tag.name }),
                        confirmLabel: t('common.delete'),
                        tone: 'danger',
                      })
                      if (ok) {
                        void deleteTag(tag.id)
                      }
                    }}
                  />
                )
              })
            )}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5">
        <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_shares_count')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalShares ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_pv_views')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalViews ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--text-tertiary)]">
          <span>{t('share.total_uv_visitors')}</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {globalStats?.totalVisitors ?? 0}
          </span>
        </div>
      </div>
    </aside>
  )
}


