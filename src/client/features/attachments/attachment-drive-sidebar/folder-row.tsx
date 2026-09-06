import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderClosed, FolderOpen, FolderPlus, MoreHorizontal, Palette, Pencil, Smile, Trash2 } from 'lucide-react';
import type { Folder } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { tryParseStringArray } from '../../../lib/json';
import type { FolderNode } from '../../../store/notes/selectors';
import { Menu, confirm, useContextMenu, type MenuItem } from '../../../components/overlay';
import { FolderColorSubmenu, FolderIconSubmenu } from '../../folders';

export interface DriveFolderRowProps {
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
}

interface FolderMenuContext {
  node: FolderNode
  createFolder: DriveFolderRowProps['createFolder']
  patchFolder: DriveFolderRowProps['patchFolder']
  deleteFolder: DriveFolderRowProps['deleteFolder']
  onStartRename: (id: string) => void
  onChooseParent: (id: string) => void
}

function castFolderOf(node: FolderNode): Folder {
  return {
    id: node.id,
    parentId: node.parentId,
    name: node.name,
    icon: node.icon ?? null,
    color: node.color ?? null,
    position: node.position ?? 0,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

const colorSubmenu = (ctx: FolderMenuContext) => ({ closeMenu }: { closeMenu: () => void }) => (
  <FolderColorSubmenu
    folder={castFolderOf(ctx.node)}
    onSelectColor={(color) => {
      void ctx.patchFolder(ctx.node.id, { color })
      closeMenu()
    }}
    onManageFolders={closeMenu}
  />
)

const iconSubmenu = (ctx: FolderMenuContext) => ({ closeMenu }: { closeMenu: () => void }) => (
  <FolderIconSubmenu
    folder={castFolderOf(ctx.node)}
    onSelectIcon={(icon) => {
      void ctx.patchFolder(ctx.node.id, { icon })
      closeMenu()
    }}
  />
)

function buildFolderMenuItems(ctx: FolderMenuContext): MenuItem[] {
  const { node } = ctx
  return [
    { id: 'new_subfolder', label: t('sidebar.new_subfolder'), icon: <FolderPlus size={13} />, onSelect: () => void ctx.createFolder(undefined, node.id) },
    { id: 'rename', label: t('sidebar.rename'), icon: <Pencil size={13} />, onSelect: () => ctx.onStartRename(node.id) },
    { id: 'color', label: t('folders.color'), icon: <Palette size={13} />, submenu: colorSubmenu(ctx) },
    { id: 'icon', label: t('folders.icon'), icon: <Smile size={13} />, submenu: iconSubmenu(ctx) },
    { id: 'move', label: t('folders.move_to'), icon: <FolderClosed size={13} />, onSelect: () => ctx.onChooseParent(node.id) },
    {
      id: 'delete',
      label: t('sidebar.delete_folder'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => {
        void confirm({ title: t('sidebar.delete_folder_value0', { value0: node.name }), confirmLabel: t('common.delete'), tone: 'danger' }).then((ok) => {
          if (ok) void ctx.deleteFolder(node.id)
        })
      },
    },
  ]
}

export function DriveFolderRow(props: DriveFolderRowProps) {
  const { node, selectedFolderId, renamingFolderId, expandedFolders, onToggleExpand, onStartRename, onFinishRename, onSelectFolder, onChooseParent, onDropFilesToFolder, createFolder, patchFolder, deleteFolder } = props
  const isRenaming = renamingFolderId === node.id
  const [nameInput, setNameInput] = useState(node.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  useEffect(() => {
    if (isRenaming) {
      setNameInput(node.name)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, node.name])

  const expanded = expandedFolders.includes(node.id)
  const hasChildren = Boolean(node.children?.length)
  const active = selectedFolderId === node.id

  const menuItems = buildFolderMenuItems({ node, createFolder, patchFolder, deleteFolder, onStartRename, onChooseParent })

  return (
    <div>
      <FolderRowBody
        node={node}
        active={active}
        expanded={expanded}
        hasChildren={hasChildren}
        isRenaming={isRenaming}
        nameInput={nameInput}
        inputRef={inputRef}
        moreButtonRef={moreButtonRef}
        onNameChange={setNameInput}
        onToggleExpand={onToggleExpand}
        onFinishRename={onFinishRename}
        onSelectFolder={onSelectFolder}
        onMoreClick={() => setIsMenuOpen((prev) => !prev)}
        onRowContextMenu={(e) => {
          setIsMenuOpen(false)
          contextMenu.onContextMenu(e)
        }}
        onDropFilesToFolder={onDropFilesToFolder}
      />
      <FolderRowMenus moreButtonRef={moreButtonRef} isMenuOpen={isMenuOpen} contextMenu={contextMenu} menuItems={menuItems} onCloseMenu={() => setIsMenuOpen(false)} />
      {hasChildren && expanded && <FolderRowChildren node={node} selectedFolderId={selectedFolderId} renamingFolderId={renamingFolderId} expandedFolders={expandedFolders} onToggleExpand={onToggleExpand} onStartRename={onStartRename} onFinishRename={onFinishRename} onSelectFolder={onSelectFolder} onChooseParent={onChooseParent} onDropFilesToFolder={onDropFilesToFolder} createFolder={createFolder} patchFolder={patchFolder} deleteFolder={deleteFolder} />}
    </div>
  )
}

interface FolderRowBodyProps {
  node: FolderNode
  active: boolean
  expanded: boolean
  hasChildren: boolean
  isRenaming: boolean
  nameInput: string
  inputRef: React.RefObject<HTMLInputElement | null>
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
  onNameChange: (value: string) => void
  onToggleExpand: (id: string) => void
  onFinishRename: (id: string, name: string) => void
  onSelectFolder: (id: string | null) => void
  onMoreClick: () => void
  onRowContextMenu: (e: React.MouseEvent) => void
  onDropFilesToFolder: DriveFolderRowProps['onDropFilesToFolder']
}

function FolderRowBody(props: FolderRowBodyProps) {
  const { node, active, expanded, hasChildren, isRenaming, nameInput, inputRef, moreButtonRef, onNameChange, onToggleExpand, onFinishRename, onSelectFolder, onMoreClick, onRowContextMenu, onDropFilesToFolder } = props
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false) }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const raw = e.dataTransfer.getData('application/inkstone-attachment-ids')
    if (raw) {
      const ids = tryParseStringArray(raw)
      if (ids.length) void onDropFilesToFolder(ids, node.id)
    }
  }

  return (
    <div
      onContextMenu={onRowContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
      className={cn(
        'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[length:var(--text-12)] font-medium transition-colors',
        active ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        isDragOver && 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]',
      )}
    >
      <FolderToggle expanded={expanded} hasChildren={hasChildren} onToggleExpand={() => onToggleExpand(node.id)} />
      <FolderNameCell node={node} expanded={expanded} isRenaming={isRenaming} nameInput={nameInput} inputRef={inputRef} onNameChange={onNameChange} onFinishRename={onFinishRename} onSelectFolder={onSelectFolder} />
      <FolderMoreButton moreButtonRef={moreButtonRef} onMoreClick={onMoreClick} />
    </div>
  )
}

function FolderNameCell({ node, expanded, isRenaming, nameInput, inputRef, onNameChange, onFinishRename, onSelectFolder }: {
  node: FolderNode
  expanded: boolean
  isRenaming: boolean
  nameInput: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onNameChange: (value: string) => void
  onFinishRename: (id: string, name: string) => void
  onSelectFolder: (id: string | null) => void
}) {
  if (isRenaming) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={nameInput}
        onChange={(e) => onNameChange(e.target.value)}
        onBlur={() => onFinishRename(node.id, nameInput.trim() || node.name)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onFinishRename(node.id, nameInput.trim() || node.name)
          if (e.key === 'Escape') onFinishRename(node.id, node.name)
        }}
        className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
      />
    )
  }
  return (
    <button type="button" onClick={() => onSelectFolder(node.id)} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left">
      <span style={{ color: node.color ?? undefined }} className={cn('shrink-0', !node.color && 'text-[var(--text-quaternary)]')}>
        {node.icon ? <span className="text-xs">{node.icon}</span> : expanded ? <FolderOpen size={13} /> : <FolderClosed size={13} />}
      </span>
      <span className="truncate">{node.name}</span>
    </button>
  )
}

function FolderToggle({ expanded, hasChildren, onToggleExpand }: { expanded: boolean; hasChildren: boolean; onToggleExpand: () => void }) {
  return (
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
  )
}

function FolderMoreButton({ moreButtonRef, onMoreClick }: { moreButtonRef: React.RefObject<HTMLButtonElement | null>; onMoreClick: () => void }) {
  return (
    <button
      ref={moreButtonRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onMoreClick()
      }}
      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity"
    >
      <MoreHorizontal size={12} />
    </button>
  )
}

interface FolderRowMenusProps {
  moreButtonRef: React.RefObject<HTMLButtonElement | null>
  isMenuOpen: boolean
  contextMenu: ReturnType<typeof useContextMenu>
  menuItems: MenuItem[]
  onCloseMenu: () => void
}

function FolderRowMenus(props: FolderRowMenusProps) {
  const { moreButtonRef, isMenuOpen, contextMenu, menuItems, onCloseMenu } = props
  return (
    <>
      <Menu open={isMenuOpen} anchor={moreButtonRef} items={menuItems} onClose={onCloseMenu} />
      {contextMenu.point && <Menu open anchor={contextMenu.point} items={menuItems} onClose={contextMenu.close} />}
    </>
  )
}

function FolderRowChildren({ node, ...rest }: { node: FolderNode } & Omit<DriveFolderRowProps, 'node'>) {
  return (
    <div className="space-y-px">
      {node.children!.map((child) => (
        <DriveFolderRow key={child.id} node={child} {...rest} />
      ))}
    </div>
  )
}