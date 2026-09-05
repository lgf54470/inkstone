import { useEffect, useRef, useState } from 'react';
import { ChevronRight, FolderClosed, FolderOpen, FolderPlus, MoreHorizontal, Palette, Pencil, Smile, Trash2 } from 'lucide-react';
import type { Folder } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { tryParseStringArray } from '../../../lib/json';
import type { FolderNode } from '../../../store/notes/selectors';
import { Menu, confirm, useContextMenu, type MenuItem } from '../../../components/overlay';
import { FolderColorSubmenu, FolderIconSubmenu } from '../../folders';



export function DriveFolderRow({
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
  const [isMenuOpen, setIsMenuOpen] = useState(false)
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
      const ids = tryParseStringArray(raw)
      if (ids.length) {
        void onDropFilesToFolder(ids, node.id)
      }
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
          setIsMenuOpen(false)
          contextMenu.onContextMenu(e)
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ paddingLeft: `${node.depth * 12 + 6}px` }}
        className={cn(
          'group flex h-7.5 w-full items-center gap-1 rounded-[var(--r-md)] pr-1 text-left text-[length:var(--text-12)] font-medium transition-colors',
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
            setIsMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>

      <Menu
        open={isMenuOpen}
        anchor={moreButtonRef}
        items={menuItems}
        onClose={() => setIsMenuOpen(false)}
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
