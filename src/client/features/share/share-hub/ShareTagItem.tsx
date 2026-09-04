import { useEffect, useRef, useState } from 'react';
import {
  Hash,
  MoreHorizontal,
  Palette,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import type { ShareTag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { Switch } from '../../../components/form';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { TagColorSubmenu } from '../../tags/TagColorSubmenu';
import { useShareStore } from '.././share-store';

export function ShareTagItem({
  tag,
  isSelected,
  counts,
  isRenaming,
  onSelect,
  onBatchToggle,
  onStartRename,
  onFinishRename,
  onColorChange,
  onDelete,
}: {
  tag: ShareTag
  isSelected: boolean
  counts: { total: number; shared: number }
  isRenaming: boolean
  onSelect: () => void
  onBatchToggle: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
}) {
  const toast = useUi((s) => s.toast)
  const batchBusy = useShareStore((s) => s.batchBusy)
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

  const safeTotal = Math.max(0, counts.total)
  const safeShared = Math.min(Math.max(0, counts.shared), safeTotal)
  const isChecked = safeTotal > 0 && safeShared > 0

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
        'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] px-2.5 text-[12px] font-medium transition-colors cursor-pointer',
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
            toast({ title: t('share.tag_empty_hint'), tone: 'default' })
          }
        }}
        className="flex items-center pl-1 shrink-0"
      >
        <Tooltip
          label={
            safeTotal === 0
              ? t('share.tag_empty_hint')
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

