import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Hash,
  MoreHorizontal,
  Palette,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import type { BlogTag } from '@shared/types';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/i18n';
import { Switch } from '../../../components/form';
import { Menu, Tooltip, useContextMenu, type MenuItem } from '../../../components/overlay';
import { useUi } from '../../../store/ui';
import { TagColorSubmenu } from '../../tags';
import { useBlogStore } from '.././blog-store';

export function BlogTagItem({
  tag,
  displayName,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
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
  tag: BlogTag
  displayName?: string
  depth?: number
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: (e: React.MouseEvent) => void
  isSelected: boolean
  counts: { total: number; published: number }
  isRenaming: boolean
  onSelect: () => void
  onBatchToggle: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
}) {
  const toast = useUi((s) => s.toast)
  const batchBusy = useBlogStore((s) => s.batchBusy)
  const initialName = displayName || (tag.name.includes('/') ? tag.name.split('/').pop()! : tag.name)
  const [nameInput, setNameInput] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const contextMenu = useContextMenu()

  useEffect(() => {
    if (isRenaming) {
      setNameInput(initialName)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isRenaming, initialName])

  const safeTotal = Math.max(0, counts.total)
  const safePublished = Math.min(Math.max(0, counts.published), safeTotal)
  const isChecked = safeTotal > 0 && safePublished > 0

  const menuItems: MenuItem[] = [
    {
      id: 'rename',
      label: t('sidebar.rename'),
      icon: <Pencil size={13} />,
      onSelect: onStartRename,
    },
    {
      id: 'color',
      label: t('tags.color'),
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => (
        <TagColorSubmenu
          tag={{
            id: tag.id,
            name: tag.name,
            color: tag.color ?? null,
            count: safeTotal,
            isPinned: Boolean(tag.isPinned),
            createdAt: tag.createdAt ?? Date.now(),
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
          safePublished < safeTotal
            ? {
                id: 'publish_all',
                label: t('blog.tag_batch_enabled_toast'),
                icon: <PlayCircle size={13} className="text-[var(--success)]" />,
                onSelect: () => onBatchToggle(true),
              }
            : null,
          safePublished > 0
            ? {
                id: 'draft_all',
                label: t('blog.tag_batch_disabled_toast'),
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect()
          }
        }}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        className={cn(
          'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[12px] font-medium transition-colors cursor-pointer',
          isSelected
            ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand?.(e)
            }}
            className="p-0.5 -ml-1 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-colors shrink-0"
          >
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : depth > 0 ? (
          <span className="w-2 shrink-0" />
        ) : null}

        <span
          style={{ color: tag.color ?? undefined }}
          className={cn('shrink-0', !tag.color && 'text-[var(--text-quaternary)]')}
        >
          <Hash size={13} />
        </span>

        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => onFinishRename(nameInput.trim() || initialName)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onFinishRename(nameInput.trim() || initialName)
              if (e.key === 'Escape') onFinishRename(initialName)
            }}
            className="flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden"
          />
        ) : (
          <span className="flex-1 truncate" title={tag.name}>
            {initialName}
          </span>
        )}

        <span className="tabular text-[10px] text-[var(--text-quaternary)] shrink-0">
          {safeTotal === 0 ? (
            '0'
          ) : safePublished < safeTotal ? (
            <>
              <span
                className={
                  safePublished > 0
                    ? 'text-[var(--warning)] font-medium'
                    : 'text-[var(--text-quaternary)]'
                }
              >
                {safePublished}
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
              toast({ title: t('blog.folder_empty_hint'), tone: 'default' })
            }
          }}
          className="flex items-center pl-1 shrink-0"
        >
          <Tooltip
            label={
              safeTotal === 0
                ? t('blog.folder_empty_hint')
                : isChecked
                  ? t('blog.tag_batch_disabled_toast')
                  : t('blog.tag_batch_enabled_toast')
            }
            side="top"
          >
            <div>
              <Switch
                checked={isChecked}
                disabled={batchBusy || safeTotal === 0}
                onChange={(nextChecked) => onBatchToggle(nextChecked)}
                label={t('blog.batch_toggle_label')}
              />
            </div>
          </Tooltip>
        </div>

        <button
          ref={moreButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setIsMenuOpen((prev) => !prev)
          }}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity shrink-0"
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
        <Menu open anchor={contextMenu.point} items={menuItems} onClose={contextMenu.close} />
      )}
    </div>
  )
}

