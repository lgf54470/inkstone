import { useMemo, useRef, useState } from 'react'
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
  Link2Off,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  Settings2,
  Smile,
  Star,
  Trash2,
} from 'lucide-react'
import type { AttachmentStats } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useUi } from '../../store/ui'
import { useFolderTree, type FolderNode } from '../../store/notes/selectors'
import { buildTagTree, flattenTagTree, type TagTreeNode } from '../../lib/tag-tree'
import { createTag, deleteTag, setTagColor, toggleTagPinned } from '../tags/tagMutations'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { FolderColorSubmenu } from '../folders/FolderColorSubmenu'
import { FolderIconSubmenu } from '../folders/FolderIconSubmenu'
import { TagColorSubmenu } from '../tags/TagColorSubmenu'
import { FolderPicker } from '../folders/FolderPicker'
import { formatFileSize, type AttachmentCategory } from './attachment-helpers'

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
  const tags = useNotes((s) => s.tags ?? [])
  const createFolder = useNotes((s) => s.createFolder)
  const openPanel = useUi((s) => s.openPanel)

  const tree = useFolderTree()
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null)

  const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(new Set())

  const handleCreateRootFolder = () => {
    const id = createFolder({})
    if (id) {
      setRenamingFolderId(id)
    }
  }

  const tagTree = useMemo(() => buildTagTree(tags), [tags])
  const flattenedTags = useMemo(() => flattenTagTree(tagTree, expandedTagPaths), [tagTree, expandedTagPaths])
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

  const toggleTag = (fullPath: string) => {
    setExpandedTagPaths((prev) => {
      const next = new Set(prev)
      if (next.has(fullPath)) {
        next.delete(fullPath)
      } else {
        next.add(fullPath)
      }
      return next
    })
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
    { id: 'all', label: t('attachments.all_files'), icon: <HardDrive size={14} /> },
    { id: 'image', label: t('attachments.photos'), icon: <Images size={14} /> },
    { id: 'document', label: t('attachments.documents'), icon: <FileText size={14} /> },
    { id: 'media', label: t('attachments.media'), icon: <Film size={14} /> },
    { id: 'archive', label: t('attachments.archives'), icon: <Archive size={14} /> },
    { id: 'starred', label: t('attachments.starred_files'), icon: <Star size={14} /> },
    { id: 'pinned', label: t('attachments.pinned_files'), icon: <Pin size={14} /> },
    { id: 'unreferenced', label: t('attachments.unreferenced_files'), icon: <Link2Off size={14} /> },
  ]

  const allFoldersExpanded = tree.every((f) => useUi.getState().expandedFolders.includes(f.id))
  const toggleAllFolders = () => {
    if (allFoldersExpanded) {
      useUi.setState({ expandedFolders: [] })
    } else {
      const allIds: string[] = []
      const collect = (nodes: FolderNode[]) => {
        for (const n of nodes) {
          allIds.push(n.id)
          if (n.children?.length) collect(n.children)
        }
      }
      collect(tree)
      useUi.setState({ expandedFolders: allIds })
    }
  }

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
                onStartRename={setRenamingFolderId}
                onFinishRename={() => setRenamingFolderId(null)}
                onSelectFolder={(id) => {
                  onSelectFolder(id)
                  onSelectTag(null)
                }}
                onChooseParent={setMovingFolderId}
                onDropFilesToFolder={onDropFilesToFolder}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="group/head flex items-center justify-between px-2 pb-1">
            <SectionLabel>{t('navigation.tag')}</SectionLabel>
            <div className="flex items-center gap-0.5">
              {parentTagPaths.length > 0 && (
                <Tooltip
                  label={allTagsExpanded ? t('tags.collapse_all') : t('tags.expand_all')}
                  side="left"
                >
                  <IconButton
                    label={allTagsExpanded ? t('tags.collapse_all') : t('tags.expand_all')}
                    size="sm"
                    onClick={toggleAllTags}
                  >
                    {allTagsExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip label={t('tags.manage_tags')} side="left">
                <IconButton
                  label={t('tags.manage_tags')}
                  size="sm"
                  onClick={() => openPanel('tags')}
                >
                  <Settings2 size={13} />
                </IconButton>
              </Tooltip>
              <Tooltip label={t('tags.new')} side="right">
                <IconButton
                  label={t('tags.new')}
                  size="sm"
                  onClick={() => void handleCreateNewTag()}
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
                expanded={expandedTagPaths.has(node.fullPath)}
                onToggleExpand={() => toggleTag(node.fullPath)}
                onSelectTag={(tagName) => {
                  onSelectTag(tagName)
                  onSelectFolder(null)
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {stats && (
        <div className="border-t border-[var(--border-subtle)] p-3 bg-[var(--bg-sunken)]/40 text-[11px] space-y-1.5">
          <div className="flex items-center justify-between font-semibold text-[var(--text-secondary)]">
            <span>{t('attachments.stats_title')}</span>
            <span>{formatFileSize(stats.totalBytes)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--border-subtle)] flex">
            <div
              style={{ width: `${(stats.imageBytes / (stats.totalBytes || 1)) * 100}%` }}
              className="h-full bg-blue-500"
            />
            <div
              style={{ width: `${(stats.documentBytes / (stats.totalBytes || 1)) * 100}%` }}
              className="h-full bg-emerald-500"
            />
            <div
              style={{ width: `${(stats.mediaBytes / (stats.totalBytes || 1)) * 100}%` }}
              className="h-full bg-purple-500"
            />
            <div
              style={{ width: `${(stats.archiveBytes / (stats.totalBytes || 1)) * 100}%` }}
              className="h-full bg-amber-500"
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
          folders={useNotes.getState().folders ?? []}
          currentId={movingFolderId}
          onSelect={(parentId) => {
            void useNotes.getState().patchFolder(movingFolderId, { parentId })
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
  onStartRename,
  onFinishRename,
  onSelectFolder,
  onChooseParent,
  onDropFilesToFolder,
}: {
  node: FolderNode
  selectedFolderId: string | null
  renamingFolderId: string | null
  onStartRename: (id: string) => void
  onFinishRename: () => void
  onSelectFolder: (id: string) => void
  onChooseParent: (id: string) => void
  onDropFilesToFolder: (fileIds: string[], targetFolderId: string | null) => Promise<void>
}) {
  const expanded = useUi((s) => s.expandedFolders.includes(node.id))
  const toggleFolder = useUi((s) => s.toggleFolder)
  const openPanel = useUi((s) => s.openPanel)
  const patchFolder = useNotes((s) => s.patchFolder)
  const deleteFolderAction = useNotes((s) => s.deleteFolder)
  const createFolder = useNotes((s) => s.createFolder)

  const [nameInput, setNameInput] = useState(node.name)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isDropOver, setIsDropOver] = useState(false)
  const contextMenu = useContextMenu()

  const isRenaming = renamingFolderId === node.id
  const hasChildren = node.children.length > 0
  const active = selectedFolderId === node.id

  const handleFinishRename = () => {
    const trimmed = nameInput.trim()
    if (trimmed && trimmed !== node.name) {
      void patchFolder(node.id, { name: trimmed })
    }
    onFinishRename()
  }

  const menuItems: MenuItem[] = [
    {
      id: 'new-subfolder',
      label: t('sidebar.new_subfolder'),
      icon: <FolderPlus size={13} />,
      onSelect: () => {
        const childId = createFolder({ parentId: node.id })
        if (childId) {
          useUi.getState().expandFolder(node.id)
          onStartRename(childId)
        }
      },
    },
    {
      id: 'rename',
      label: t('sidebar.rename'),
      icon: <Pencil size={13} />,
      onSelect: () => {
        setNameInput(node.name)
        onStartRename(node.id)
      },
    },
    {
      id: 'color',
      label: t('folders.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderColorSubmenu
          folder={node}
          onSelectColor={(color) => {
            void patchFolder(node.id, { color })
            closeMenu()
          }}
          onManageFolders={() => {
            closeMenu()
            openPanel('folders')
          }}
        />
      ),
    },
    {
      id: 'icon',
      label: t('folders.icon'),
      icon: <Smile size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderIconSubmenu
          folder={node}
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
      separatorBefore: true,
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
          void deleteFolderAction(node.id)
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
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-inkstone-attachments')) {
            e.preventDefault()
            setIsDropOver(true)
          }
        }}
        onDragLeave={() => setIsDropOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDropOver(false)
          const data = e.dataTransfer.getData('application/x-inkstone-attachments')
          if (data) {
            try {
              const fileIds = JSON.parse(data) as string[]
              void onDropFilesToFolder(fileIds, node.id)
            } catch {}
          }
        }}
        style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
        className={cn(
          'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[12px] font-medium transition-colors',
          active
            ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          isDropOver && 'ring-2 ring-inset ring-[var(--accent)] bg-[var(--accent-soft)]',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleFolder(node.id)
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
          onClick={() => onSelectFolder(node.id)}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        >
          {node.icon ? (
            <span className="shrink-0 text-sm leading-none">{node.icon}</span>
          ) : expanded ? (
            <FolderOpen
              size={13}
              style={{ color: node.color ?? undefined }}
              className={cn('shrink-0', !node.color && 'text-[var(--text-tertiary)]')}
            />
          ) : (
            <FolderClosed
              size={13}
              style={{ color: node.color ?? undefined }}
              className={cn('shrink-0', !node.color && 'text-[var(--text-tertiary)]')}
            />
          )}

          {isRenaming ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleFinishRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFinishRename()
                if (e.key === 'Escape') onFinishRename()
              }}
              className="h-5 w-full rounded border border-[var(--accent)] bg-[var(--bg-base)] px-1 text-[12px] outline-none"
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
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

      {hasChildren && expanded && (
        <div className="space-y-px">
          {node.children.map((child) => (
            <DriveFolderRow
              key={child.id}
              node={child}
              selectedFolderId={selectedFolderId}
              renamingFolderId={renamingFolderId}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
              onSelectFolder={onSelectFolder}
              onChooseParent={onChooseParent}
              onDropFilesToFolder={onDropFilesToFolder}
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
  expanded,
  onToggleExpand,
  onSelectTag,
}: {
  node: TagTreeNode
  selectedTag: string | null
  expanded: boolean
  onToggleExpand: () => void
  onSelectTag: (tagName: string) => void
}) {
  const openPanel = useUi((s) => s.openPanel)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  const hasChildren = node.children.length > 0
  const active = selectedTag === node.fullPath

  const menuItems: MenuItem[] = [
    {
      id: 'pin',
      label: node.tag?.isPinned ? t('tags.unpin') : t('tags.pin'),
      icon: <Pin size={13} />,
      onSelect: () => {
        if (node.tag) void toggleTagPinned(node.tag)
      },
    },
    {
      id: 'color',
      label: t('tags.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) =>
        node.tag ? (
          <TagColorSubmenu
            tag={node.tag}
            onSelectColor={(color) => {
              void setTagColor(node.tag, color)
              closeMenu()
            }}
            onManageTags={() => {
              closeMenu()
              openPanel('tags')
            }}
          />
        ) : null,
    },
    {
      id: 'delete',
      label: t('tags.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => {
        if (node.tag) void deleteTag(node.tag)
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
