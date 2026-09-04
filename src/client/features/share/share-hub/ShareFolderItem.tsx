import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Palette,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { Switch } from '../../../components/form';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { FolderColorSubmenu } from '../../folders/FolderColorSubmenu';
import { useShareStore, type ShareFolderNode } from '.././share-store';

export function ShareFolderItem({
  node,
  isExpanded,
  isSelected,
  counts,
  isRenaming,
  onToggleExpand,
  onSelect,
  onBatchToggle,
  onStartRename,
  onFinishRename,
  onCreateSubfolder,
  onColorChange,
  onDelete,
  onDropNotes,
  children,
}: {
  node: ShareFolderNode
  isExpanded: boolean
  isSelected: boolean
  counts: { total: number; shared: number }
  isRenaming: boolean
  onToggleExpand: (e: React.MouseEvent) => void
  onSelect: () => void
  onBatchToggle: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onCreateSubfolder: () => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
  onDropNotes: (noteIds: string[]) => void
  children?: React.ReactNode
}) {
  const toast = useUi((s) => s.toast)
  const batchBusy = useShareStore((s) => s.batchBusy)
  const [nameInput, setNameInput] = useState(node.folder.name)
  const [isDragOver, setIsDragOver] = useState(false)
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
    const raw = e.dataTransfer.getData('application/inkstone-share-note-ids')
    if (raw) {
      try {
        const ids = JSON.parse(raw) as string[]
        if (Array.isArray(ids) && ids.length) {
          onDropNotes(ids)
        }
      } catch {}
    }
  }

  const safeTotal = Math.max(0, counts.total)
  const safeShared = Math.min(Math.max(0, counts.shared), safeTotal)
  const isChecked = safeTotal > 0 && safeShared > 0

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
    ...(safeTotal > 0
      ? [
          safeShared < safeTotal
            ? {
                id: 'enable_all',
                label: t('share.batch_enable'),
                icon: <PlayCircle size={13} className="text-[var(--success)]" />,
                onSelect: () => onBatchToggle(true),
              }
            : null,
          safeShared > 0
            ? {
                id: 'pause_all',
                label: t('share.batch_disable'),
                icon: <PauseCircle size={13} className="text-[var(--warning)]" />,
                onSelect: () => onBatchToggle(false),
              }
            : null,
        ].filter(Boolean) as MenuItem[]
      : []),
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
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        style={{ paddingLeft: `${8 + node.depth * 12}px` }}
        className={cn(
          'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[12px] font-medium transition-colors cursor-pointer',
          isSelected
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
          isDragOver && 'bg-[var(--accent-subtle)] ring-1 ring-[var(--accent)]',
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

        <span className="tabular text-[10px] text-[var(--text-quaternary)] shrink-0">
          {safeTotal === 0 ? (
            '0'
          ) : safeShared < safeTotal ? (
            <>
              <span className={safeShared > 0 ? 'text-[var(--warning)] font-medium' : 'text-[var(--text-quaternary)]'}>
                {safeShared}
              </span>
              /{safeTotal}
            </>
          ) : (
            safeTotal
          )}
        </span>

        <div
          onClick={(e) => {
            e.stopPropagation()
            if (safeTotal === 0) {
              toast({ title: t('share.folder_empty_hint'), tone: 'default' })
            }
          }}
          className="flex items-center pl-1 shrink-0"
        >
          <Tooltip
            label={
              safeTotal === 0
                ? t('share.folder_empty_hint')
                : isChecked
                  ? t('share.batch_disable')
                  : t('share.batch_enable')
            }
            side="top"
          >
            <div>
              <Switch
                checked={isChecked}
                disabled={batchBusy || safeTotal === 0}
                onChange={(nextChecked) => onBatchToggle(nextChecked)}
                label={t('share.batch_toggle_label')}
              />
            </div>
          </Tooltip>
        </div>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity shrink-0"
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

