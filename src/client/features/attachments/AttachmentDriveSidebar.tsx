import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Film,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Hash,
  Images,
  LayoutDashboard,
  Link2Off,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  Smile,
  Star,
  Trash2,
} from 'lucide-react'
import type { AttachmentStats, Folder, Tag } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import type { FolderNode } from '../../store/notes/selectors'
import type { TagTreeNode } from '../../lib/tag-tree'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { FolderColorSubmenu } from '../folders/FolderColorSubmenu'
import { FolderIconSubmenu } from '../folders/FolderIconSubmenu'
import { TagColorSubmenu } from '../tags/TagColorSubmenu'
import { FolderPicker } from '../folders/FolderPicker'
import { formatFileSize, type AttachmentCategory } from './attachment-helpers'
import {
  useAttachmentFolderTree,
  useAttachmentStore,
  useAttachmentTagTree,
} from './attachment-store'

export function AttachmentDriveSidebar({
  selectedCategory,
  onSelectCategory,
  selectedFolderId,
  onSelectFolder,
  selectedTag,
  onSelectTag,
  stats,
  onDropFilesToFolder,
}: {
  selectedCategory: AttachmentCategory
  onSelectCategory: (cat: AttachmentCategory) => void
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  selectedTag: string | null
  onSelectTag: (tag: string | null) => void
  stats?: AttachmentStats
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => Promise<void>
}) {
  const tree = useAttachmentFolderTree()
  const { tree: tagTree, flatTree: flattenedTags } = useAttachmentTagTree()
  const folders = useAttachmentStore((s) => s.folders)
  const load = useAttachmentStore((s) => s.load)
  const createFolder = useAttachmentStore((s) => s.createFolder)
  const patchFolder = useAttachmentStore((s) => s.patchFolder)
  const deleteFolder = useAttachmentStore((s) => s.deleteFolder)
  const createTag = useAttachmentStore((s) => s.createTag)
  const patchTag = useAttachmentStore((s) => s.patchTag)
  const deleteTag = useAttachmentStore((s) => s.deleteTag)
  const expandedFolders = useAttachmentStore((s) => s.expandedFolders)
  const toggleFolderExpanded = useAttachmentStore((s) => s.toggleFolderExpanded)
  const setExpandedFolders = useAttachmentStore((s) => s.setExpandedFolders)
  const expandedTagPaths = useAttachmentStore((s) => s.expandedTagPaths)
  const toggleTagExpanded = useAttachmentStore((s) => s.toggleTagExpanded)
  const setExpandedTagPaths = useAttachmentStore((s) => s.setExpandedTagPaths)

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  const handleCreateRootFolder = async () => {
    const created = await createFolder()
    if (created) {
      setRenamingFolderId(created.id)
    }
  }

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

  const allTagsExpanded =
    parentTagPaths.length > 0 && parentTagPaths.every((p) => expandedTagPaths.has(p))

  const toggleAllTags = () => {
    if (allTagsExpanded) {
      setExpandedTagPaths(new Set())
    } else {
      setExpandedTagPaths(new Set(parentTagPaths))
    }
  }

  const handleCreateNewTag = async () => {
    const name = window.prompt(t('tags.new_placeholder'))
    if (name?.trim()) {
      await createTag(name.trim())
    }
  }

  const categories: Array<{
    id: AttachmentCategory
    label: string
    icon: React.ReactNode
  }> = [
    { id: 'dashboard', label: t('attachments.dashboard'), icon: <LayoutDashboard size={14} /> },
    { id: 'all', label: t('attachments.all_files'), icon: <HardDrive size={14} /> },
    { id: 'image', label: t('attachments.photos'), icon: <Images size={14} /> },
    { id: 'document', label: t('attachments.documents'), icon: <FileText size={14} /> },
    { id: 'media', label: t('attachments.media'), icon: <Film size={14} /> },
    { id: 'archive', label: t('attachments.archives'), icon: <Archive size={14} /> },
    { id: 'starred', label: t('attachments.starred_files'), icon: <Star size={14} /> },
    { id: 'pinned', label: t('attachments.pinned_files'), icon: <Pin size={14} /> },
    { id: 'unreferenced', label: t('attachments.unreferenced_files'), icon: <Link2Off size={14} /> },
  ]

  const allFoldersExpanded = tree.length > 0 && tree.every((f) => expandedFolders.includes(f.id))
  const toggleAllFolders = () => {
    if (allFoldersExpanded) {
      setExpandedFolders([])
    } else {
      const allIds: string[] = []
      const collect = (nodes: FolderNode[]) => {
        for (const n of nodes) {
          allIds.push(n.id)
          if (n.children?.length) collect(n.children)
        }
      }
      collect(tree)
      setExpandedFolders(allIds)
    }
  }

  const totalQuota = stats?.totalQuotaBytes || 10 * 1024 * 1024 * 1024
  const usedRatio = Math.min(1, Math.max(0, (stats?.totalBytes ?? 0) / totalQuota))
  const usedWidthPct = (usedRatio * 100).toFixed(2)

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[12.5px] select-none">
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div>
          <SectionLabel>{t('attachments.categories')}</SectionLabel>
          <div className="space-y-0.5">
            {categories.map((cat) => {
              const active = selectedCategory === cat.id && !selectedFolderId && !selectedTag
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={cn(
                    'flex h-7.5 w-full items-center gap-2 rounded-[var(--r-md)] px-2 text-left font-medium transition-colors',
                    active
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                  )}
                >
                  <span className={cn('shrink-0', active ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]')}>
                    {cat.icon}
                  </span>
                  <span className="truncate flex-1">{cat.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <SectionLabel>{t('navigation.folder')}</SectionLabel>
            <div className="flex items-center gap-0.5">
              <Tooltip
                label={allFoldersExpanded ? t('folders.collapse_all') : t('folders.expand_all')}
                side="left"
              >
                <IconButton
                  label={allFoldersExpanded ? t('folders.collapse_all') : t('folders.expand_all')}
                  size="sm"
                  onClick={toggleAllFolders}
                >
                  {allFoldersExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                </IconButton>
              </Tooltip>
              <Tooltip label={t('common.new_folder')} side="right">
                <IconButton
                  label={t('common.new_folder')}
                  size="sm"
                  onClick={handleCreateRootFolder}
                >
                  <Plus size={13} />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-px">
            {tree.map((node) => (
              <DriveFolderRow
                key={node.id}
                node={node}
                selectedFolderId={selectedFolderId}
                renamingFolderId={renamingFolderId}
                expandedFolders={expandedFolders}
                onToggleExpand={toggleFolderExpanded}
                onStartRename={setRenamingFolderId}
                onFinishRename={(id, name) => {
                  void patchFolder(id, { name })
                  setRenamingFolderId(null)
                }}
                onSelectFolder={onSelectFolder}
                onChooseParent={setMovingFolderId}
                onDropFilesToFolder={onDropFilesToFolder}
                createFolder={createFolder}
                patchFolder={patchFolder}
                deleteFolder={deleteFolder}
              />
            ))}
            {tree.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-[var(--text-tertiary)] italic">
                {t('folders.no_folders')}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <SectionLabel>{t('navigation.tag')}</SectionLabel>
            <div className="flex items-center gap-0.5">
              <Tooltip
                label={allTagsExpanded ? t('folders.collapse_all') : t('folders.expand_all')}
                side="left"
              >
                <IconButton
                  label={allTagsExpanded ? t('folders.collapse_all') : t('folders.expand_all')}
                  size="sm"
                  onClick={toggleAllTags}
                >
                  {allTagsExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                </IconButton>
              </Tooltip>
              <Tooltip label={t('tags.new')} side="right">
                <IconButton
                  label={t('tags.new')}
                  size="sm"
                  onClick={handleCreateNewTag}
                >
                  <Plus size={13} />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          <div className="space-y-px">
            {flattenedTags.map((node) => (
              <DriveTagRow
                key={node.fullPath}
                node={node}
                selectedTag={selectedTag}
                expandedTagPaths={expandedTagPaths}
                onToggleExpand={() => toggleTagExpanded(node.fullPath)}
                onSelectTag={onSelectTag}
                patchTag={patchTag}
                deleteTag={deleteTag}
              />
            ))}
            {flattenedTags.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-[var(--text-tertiary)] italic">
                {t('tags.no_match')}
              </div>
            )}
          </div>
        </div>
      </div>

      {stats && (
        <div className="mt-auto shrink-0 border-t border-[var(--border-subtle)] p-3 bg-[var(--bg-sunken)]/40 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-[var(--text-secondary)]">
            <span>{t('attachments.stats_title')}</span>
            <span className="font-mono text-[10.5px]">
              {`${formatFileSize(stats.totalBytes)} / 10 GB`}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)]">
            <div
              style={{ width: `${Math.max(stats.totalBytes > 0 ? 1 : 0, Number(usedWidthPct))}%` }}
              className="h-full bg-[var(--accent)] rounded-full transition-all duration-300"
            />
          </div>
          <div className="text-[10px] text-[var(--text-quaternary)] flex justify-between">
            <span>{t('attachments.total_value0', { value0: stats.totalCount })}</span>
            <span>{t('attachments.unreferenced_count_value0', { value0: stats.unreferencedCount })}</span>
          </div>
        </div>
      )}

      {movingFolderId && (
        <FolderPicker
          open={Boolean(movingFolderId)}
          title={t('folders.move_to')}
          folders={folders.map((f) => ({
            id: f.id,
            parentId: f.parentId,
            name: f.name,
            icon: f.icon ?? null,
            color: f.color ?? null,
            position: f.position ?? 0,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))}
          currentId={movingFolderId}
          onSelect={(parentId) => {
            void patchFolder(movingFolderId, { parentId })
            setMovingFolderId(null)
          }}
          onClose={() => setMovingFolderId(null)}
        />
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-2 pb-1 text-[10.5px] font-semibold tracking-wider text-[var(--text-tertiary)] uppercase">
      {children}
    </h3>
  )
}

function DriveFolderRow({
  node,
  selectedFolderId,
  renamingFolderId,
  expandedFolders,
  onToggleExpand,
  onStartRename,
  onFinishRename,
  onSelectFolder,
  onChooseParent,
  onDropFilesToFolder,
  createFolder,
  patchFolder,
  deleteFolder,
}: {
  node: FolderNode
  selectedFolderId: string | null
  renamingFolderId: string | null
  expandedFolders: string[]
  onToggleExpand: (id: string) => void
  onStartRename: (id: string) => void
  onFinishRename: (id: string, name: string) => void
  onSelectFolder: (id: string | null) => void
  onChooseParent: (id: string) => void
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => Promise<void>
  createFolder: (name?: string, parentId?: string | null) => Promise<unknown>
  patchFolder: (id: string, patch: Partial<Folder>) => Promise<void>
  deleteFolder: (id: string) => Promise<void>
}) {
  const isRenaming = renamingFolderId === node.id
  const [nameInput, setNameInput] = useState(node.name)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  const expanded = expandedFolders.includes(node.id)
  const hasChildren = Boolean(node.children?.length)
  const active = selectedFolderId === node.id

  useEffect(() => {
    if (isRenaming) {
      setNameInput(node.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, node.name])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData('application/inkstone-attachment-ids')
    if (raw) {
      try {
        const ids = JSON.parse(raw) as string[]
        if (Array.isArray(ids) && ids.length) {
          void onDropFilesToFolder(ids, node.id)
        }
      } catch {}
    }
  }

  const castFolder: Folder = {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    icon: node.icon ?? null,
    color: node.color ?? null,
    position: node.position ?? 0,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }

  const menuItems: MenuItem[] = [
    {
      id: 'new_subfolder',
      label: t('sidebar.new_subfolder'),
      icon: <FolderPlus size={13} />,
      onSelect: async () => {
        await createFolder(undefined, node.id)
      },
    },
    {
      id: 'rename',
      label: t('sidebar.rename'),
      icon: <Pencil size={13} />,
      onSelect: () => onStartRename(node.id),
    },
    {
      id: 'color',
      label: t('folders.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderColorSubmenu
          folder={castFolder}
          onSelectColor={(color) => {
            void patchFolder(node.id, { color })
            closeMenu()
          }}
          onManageFolders={closeMenu}
        />
      ),
    },
    {
      id: 'icon',
      label: t('folders.icon'),
      icon: <Smile size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderIconSubmenu
          folder={castFolder}
          onSelectIcon={(icon) => {
            void patchFolder(node.id, { icon })
            closeMenu()
          }}
        />
      ),
    },
    {
      id: 'move',
      label: t('folders.move_to'),
      icon: <FolderClosed size={13} />,
      onSelect: () => onChooseParent(node.id),
    },
    {
      id: 'delete',
      label: t('sidebar.delete_folder'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: async () => {
        const ok = await confirm({
          title: t('sidebar.delete_folder_value0', { value0: node.name }),
          confirmLabel: t('common.delete'),
          tone: 'danger',
        })
        if (ok) {
          void deleteFolder(node.id)
        }
      },
    },
  ]

  return (
    <div>
      <div
        onContextMenu={(e) => {
          setMenuOpen(false)
          contextMenu.onContextMenu(e)
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
        className={cn(
          'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[12px] font-medium transition-colors',
          active
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          isDragOver && 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(node.id)
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] transition-transform',
            !hasChildren && 'invisible',
            expanded && 'rotate-90',
          )}
        >
          <ChevronRight size={11} />
        </button>

        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => onFinishRename(node.id, nameInput.trim() || node.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename(node.id, nameInput.trim() || node.name)
              if (e.key === 'Escape') onFinishRename(node.id, node.name)
            }}
            className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelectFolder(node.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
          >
            <span
              style={{ color: node.color ?? undefined }}
              className={cn('shrink-0', !node.color && 'text-[var(--text-quaternary)]')}
            >
              {node.icon ? (
                <span className="text-xs">{node.icon}</span>
              ) : expanded ? (
                <FolderOpen size={13} />
              ) : (
                <FolderClosed size={13} />
              )}
            </span>
            <span className="truncate">{node.name}</span>
          </button>
        )}

        <button
          ref={moreButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      <Menu
        open={menuOpen}
        anchor={moreButtonRef}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      {contextMenu.point && (
        <Menu
          open
          anchor={contextMenu.point}
          items={menuItems}
          onClose={contextMenu.close}
        />
      )}

      {hasChildren && expanded && (
        <div className="space-y-px">
          {node.children!.map((child) => (
            <DriveFolderRow
              key={child.id}
              node={child}
              selectedFolderId={selectedFolderId}
              renamingFolderId={renamingFolderId}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
              onSelectFolder={onSelectFolder}
              onChooseParent={onChooseParent}
              onDropFilesToFolder={onDropFilesToFolder}
              createFolder={createFolder}
              patchFolder={patchFolder}
              deleteFolder={deleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DriveTagRow({
  node,
  selectedTag,
  expandedTagPaths,
  onToggleExpand,
  onSelectTag,
  patchTag,
  deleteTag,
}: {
  node: TagTreeNode
  selectedTag: string | null
  expandedTagPaths: Set<string>
  onToggleExpand: () => void
  onSelectTag: (tag: string | null) => void
  patchTag: (id: string, patch: Partial<Tag>) => Promise<void>
  deleteTag: (id: string) => Promise<void>
}) {
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  const expanded = expandedTagPaths.has(node.fullPath)
  const hasChildren = node.children.length > 0
  const active = selectedTag === node.fullPath

  const castTag: Tag = {
    id: node.tag?.id ?? node.fullPath,
    name: node.tag?.name ?? node.name,
    color: node.tag?.color ?? null,
    isPinned: Boolean(node.tag?.isPinned),
    count: 0,
    createdAt: node.tag?.createdAt ?? Date.now(),
  }

  const menuItems: MenuItem[] = [
    {
      id: 'pin',
      label: node.tag?.isPinned ? t('tags.unpin') : t('tags.pin'),
      icon: <Pin size={13} />,
      onSelect: () => {
        if (node.tag) void patchTag(node.tag.id, { isPinned: !node.tag.isPinned })
      },
    },
    {
      id: 'color',
      label: t('tags.color'),
      icon: <Palette size={13} />,
      submenu: node.tag
        ? ({ closeMenu }) => (
            <TagColorSubmenu
              tag={castTag}
              onSelectColor={(color) => {
                if (node.tag) void patchTag(node.tag.id, { color })
                closeMenu()
              }}
              onManageTags={closeMenu}
            />
          )
        : null,
    },
    {
      id: 'delete',
      label: t('tags.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => {
        if (node.tag) void deleteTag(node.tag.id)
      },
    },
  ]

  return (
    <div>
      <div
        onContextMenu={(e) => {
          setMenuOpen(false)
          contextMenu.onContextMenu(e)
        }}
        style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
        className={cn(
          'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[12px] font-medium transition-colors',
          active
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] transition-transform',
            !hasChildren && 'invisible',
            expanded && 'rotate-90',
          )}
        >
          <ChevronRight size={11} />
        </button>

        <button
          type="button"
          onClick={() => onSelectTag(node.fullPath)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          <Hash
            size={12}
            style={{ color: node.tag?.color ?? undefined }}
            className={cn('shrink-0', !node.tag?.color && 'text-[var(--text-quaternary)]')}
          />
          <span className="truncate">{node.name}</span>
        </button>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      <Menu
        open={menuOpen}
        anchor={moreButtonRef}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      {contextMenu.point && (
        <Menu
          open
          anchor={contextMenu.point}
          items={menuItems}
          onClose={contextMenu.close}
        />
      )}
    </div>
  )
}
