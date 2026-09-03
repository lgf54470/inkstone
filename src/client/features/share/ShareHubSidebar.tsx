import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  Globe,
  Hash,
  Infinity as InfinityIcon,
  KeyRound,
  LayoutDashboard,
  MoreHorizontal,
  Palette,
  PauseCircle,
  Pencil,
  Pin,
  PlayCircle,
  Plus,
  Star,
  Timer,
  Trash2,
} from 'lucide-react'
import type { ShareCategory, ShareTag } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { IconButton } from '../../components/primitives'
import { Menu, Tooltip, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { Switch } from '../../components/form'
import { FolderColorSubmenu } from '../folders/FolderColorSubmenu'
import { TagColorSubmenu } from '../tags/TagColorSubmenu'
import { buildShareFolderTree, useShareStore, type ShareFolderNode } from './share-store'

export function ShareHubSidebar() {
  const category = useShareStore((s) => s.category)
  const setCategory = useShareStore((s) => s.setCategory)
  const selectedFolderId = useShareStore((s) => s.folderId)
  const setFolderId = useShareStore((s) => s.setFolderId)
  const selectedTag = useShareStore((s) => s.tag)
  const setTag = useShareStore((s) => s.setTag)
  const globalStats = useShareStore((s) => s.globalStats)
  const batchToggleGroup = useShareStore((s) => s.batchToggleGroup)
  const batchBusy = useShareStore((s) => s.batchBusy)

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
  const [foldersSectionOpen, setFoldersSectionOpen] = useState(true)
  const [tagsSectionOpen, setTagsSectionOpen] = useState(true)
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
    },
  ]

  const renderFolderNode = (node: ShareFolderNode) => {
    const isExpanded = expandedFolders.has(node.folder.id)
    const isSelected = selectedFolderId === node.folder.id && !selectedTag && category === 'all'
    const counts = globalStats?.folderCounts[node.folder.id] || { total: 0, shared: 0 }
    const isChecked = counts.shared > 0
    const isRenaming = renamingFolderId === node.folder.id

    return (
      <ShareFolderItem
        key={node.folder.id}
        node={node}
        isExpanded={isExpanded}
        isSelected={isSelected}
        counts={counts}
        isChecked={isChecked}
        isRenaming={isRenaming}
        batchBusy={batchBusy}
        onToggleExpand={(e) => toggleFolderExpand(node.folder.id, e)}
        onSelect={() => setFolderId(node.folder.id)}
        onToggleSwitch={(enabled) => void batchToggleGroup('folder', node.folder.id, enabled)}
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
            onClick={() => setFoldersSectionOpen(!foldersSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {foldersSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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

        {foldersSectionOpen && (
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
            onClick={() => setTagsSectionOpen(!tagsSectionOpen)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {tagsSectionOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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

        {tagsSectionOpen && (
          <div className="space-y-0.5 pt-0.5">
            {tags.length === 0 ? (
              <p className="px-2.5 py-1 text-[11px] text-[var(--text-quaternary)]">
                {t('share.no_tags')}
              </p>
            ) : (
              tags.map((tag) => {
                const isSelected = selectedTag === tag.name
                const counts = globalStats?.tagCounts[tag.name] || { total: 0, shared: 0 }
                const isChecked = counts.shared > 0
                const isRenaming = renamingTagId === tag.id

                return (
                  <ShareTagItem
                    key={tag.id}
                    tag={tag}
                    isSelected={isSelected}
                    counts={counts}
                    isChecked={isChecked}
                    isRenaming={isRenaming}
                    batchBusy={batchBusy}
                    onSelect={() => setTag(tag.name)}
                    onToggleSwitch={(enabled) => void batchToggleGroup('tag', tag.name, enabled)}
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

function ShareFolderItem({
  node,
  isExpanded,
  isSelected,
  counts,
  isChecked,
  isRenaming,
  batchBusy,
  onToggleExpand,
  onSelect,
  onToggleSwitch,
  onStartRename,
  onFinishRename,
  onCreateSubfolder,
  onColorChange,
  onDelete,
  children,
}: {
  node: ShareFolderNode
  isExpanded: boolean
  isSelected: boolean
  counts: { total: number; shared: number }
  isChecked: boolean
  isRenaming: boolean
  batchBusy: boolean
  onToggleExpand: (e: React.MouseEvent) => void
  onSelect: () => void
  onToggleSwitch: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onCreateSubfolder: () => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
  children?: React.ReactNode
}) {
  const [nameInput, setNameInput] = useState(node.folder.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  useEffect(() => {
    if (isRenaming) {
      setNameInput(node.folder.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, node.folder.name])

  const menuItems: MenuItem[] = [
    {
      id: 'new_subfolder',
      label: t('sidebar.new_subfolder'),
      icon: <FolderPlus size={13} />,
      onSelect: onCreateSubfolder,
    },
    {
      id: 'rename',
      label: t('sidebar.rename'),
      icon: <Pencil size={13} />,
      onSelect: onStartRename,
    },
    {
      id: 'color',
      label: t('folders.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <FolderColorSubmenu
          folder={{ color: node.folder.color }}
          onSelectColor={(color) => {
            onColorChange(color)
            closeMenu()
          }}
          onManageFolders={closeMenu}
        />
      ),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: onDelete,
    },
  ]

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onContextMenu={contextMenu.onContextMenu}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        style={{ paddingLeft: `${8 + node.depth * 12}px` }}
        className={cn(
          'group flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[12px] font-medium transition-colors cursor-pointer',
          isSelected
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-3" />
        )}

        <span
          style={{ color: node.folder.color ?? undefined }}
          className={cn('shrink-0', !node.folder.color && 'text-[var(--text-quaternary)]')}
        >
          {isExpanded ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
        </span>

        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => onFinishRename(nameInput.trim() || node.folder.name)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename(nameInput.trim() || node.folder.name)
              if (e.key === 'Escape') onFinishRename(node.folder.name)
            }}
            className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
          />
        ) : (
          <span className="flex-1 truncate">{node.folder.name}</span>
        )}

        <span className="tabular text-[10px] text-[var(--text-quaternary)]">
          {counts.shared > 0 ? (
            <span className="text-[var(--accent)] font-medium">{counts.shared}</span>
          ) : (
            '0'
          )}
          /{counts.total}
        </span>

        {/* Batch toggle switch for entire folder */}
        <div onClick={(e) => e.stopPropagation()} className="flex items-center pl-1">
          <Switch
            checked={isChecked}
            disabled={batchBusy || counts.total === 0}
            onChange={onToggleSwitch}
          />
        </div>

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
        <Menu open anchor={contextMenu.point} items={menuItems} onClose={contextMenu.close} />
      )}

      {children}
    </div>
  )
}

function ShareTagItem({
  tag,
  isSelected,
  counts,
  isChecked,
  isRenaming,
  batchBusy,
  onSelect,
  onToggleSwitch,
  onStartRename,
  onFinishRename,
  onColorChange,
  onDelete,
}: {
  tag: ShareTag
  isSelected: boolean
  counts: { total: number; shared: number }
  isChecked: boolean
  isRenaming: boolean
  batchBusy: boolean
  onSelect: () => void
  onToggleSwitch: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
}) {
  const [nameInput, setNameInput] = useState(tag.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  useEffect(() => {
    if (isRenaming) {
      setNameInput(tag.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, tag.name])

  const menuItems: MenuItem[] = [
    {
      id: 'rename',
      label: t('tags.rename'),
      icon: <Pencil size={13} />,
      onSelect: onStartRename,
    },
    {
      id: 'color',
      label: t('folders.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <TagColorSubmenu
          tag={{
            id: tag.id,
            name: tag.name,
            color: tag.color ?? null,
            count: 0,
            isPinned: Boolean(tag.isPinned),
            createdAt: tag.createdAt,
          }}
          onSelectColor={(color) => {
            onColorChange(color)
            closeMenu()
          }}
          onManageTags={closeMenu}
        />
      ),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: onDelete,
    },
  ]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={contextMenu.onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      className={cn(
        'group flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors cursor-pointer',
        isSelected
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      )}
    >
      <Hash size={13} className="shrink-0" style={{ color: tag.color ?? undefined }} />

      {isRenaming ? (
        <input
          ref={inputRef}
          type="text"
          value={nameInput}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setNameInput(e.target.value)}
          onBlur={() => onFinishRename(nameInput.trim() || tag.name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onFinishRename(nameInput.trim() || tag.name)
            if (e.key === 'Escape') onFinishRename(tag.name)
          }}
          className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
        />
      ) : (
        <span className="flex-1 truncate">{tag.name}</span>
      )}

      <span className="tabular text-[10px] text-[var(--text-quaternary)]">
        {counts.shared > 0 ? (
          <span className="text-[var(--accent)] font-medium">{counts.shared}</span>
        ) : (
          '0'
        )}
        /{counts.total}
      </span>

      {/* Batch toggle switch for tag */}
      <div onClick={(e) => e.stopPropagation()} className="pl-1">
        <Switch
          checked={isChecked}
          disabled={batchBusy || counts.total === 0}
          onChange={onToggleSwitch}
        />
      </div>

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

      <Menu
        open={menuOpen}
        anchor={moreButtonRef}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      {contextMenu.point && (
        <Menu open anchor={contextMenu.point} items={menuItems} onClose={contextMenu.close} />
      )}
    </div>
  )
}
