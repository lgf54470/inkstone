import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent, RefObject } from 'react'
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
} from 'lucide-react'
import { cn } from '../lib/cn'
import { t } from '../lib/i18n'
import { Switch } from './form'
import { Menu, Tooltip, useContextMenu, type MenuItem } from './overlay'
import { useUi } from '../store/ui'
import { TagColorSubmenu } from '../features/tags'

const TREE_INDENT_BASE = 8
const TREE_INDENT_STEP = 12

interface HubTagLike {
  id: string
  name: string
  color?: string | null
  isPinned?: boolean
  createdAt?: number
}

interface HubTagLabels {
  rename: string
  color: string
  enable: string
  disable: string
  toggleLabel: string
  emptyHint: string
}

interface HubTagItemProps {
  tag: HubTagLike
  displayName?: string
  depth?: number
  hasChildren?: boolean
  isExpanded?: boolean
  onToggleExpand?: (e: MouseEvent) => void
  isSelected: boolean
  counts: { total: number; enabled: number }
  isRenaming: boolean
  batchBusy: boolean
  labels: HubTagLabels
  onSelect: () => void
  onBatchToggle: (enabled: boolean) => void
  onStartRename: () => void
  onFinishRename: (nextName: string) => void
  onColorChange: (color: string | null) => void
  onDelete: () => void
}

interface MenuContext {
  tag: HubTagLike
  safeTotal: number
  safeEnabled: number
  labels: HubTagLabels
  onStartRename: () => void
  onColorChange: (color: string | null) => void
  onBatchToggle: (enabled: boolean) => void
  onDelete: () => void
}

function ColorMenuEntry({ ctx, closeMenu }: { ctx: MenuContext; closeMenu: () => void }) {
  return (
    <TagColorSubmenu
      tag={{
        id: ctx.tag.id,
        name: ctx.tag.name,
        color: ctx.tag.color ?? null,
        count: ctx.safeTotal,
        isPinned: Boolean(ctx.tag.isPinned),
        createdAt: ctx.tag.createdAt ?? Date.now(),
      }}
      onSelectColor={(color) => {
        ctx.onColorChange(color)
        closeMenu()
      }}
      onManageTags={closeMenu}
    />
  )
}

function buildTagMenuItems(ctx: MenuContext): MenuItem[] {
  const items: MenuItem[] = [
    {
      id: 'rename',
      label: ctx.labels.rename,
      icon: <Pencil size={13} />,
      onSelect: ctx.onStartRename,
    },
    {
      id: 'color',
      label: ctx.labels.color,
      icon: <Palette size={13} />,
      submenu: ({ closeMenu }) => <ColorMenuEntry ctx={ctx} closeMenu={closeMenu} />,
    },
  ]
  if (ctx.safeTotal > 0) {
    if (ctx.safeEnabled < ctx.safeTotal) {
      items.push({
        id: 'enable_all',
        label: ctx.labels.enable,
        icon: <PlayCircle size={13} className='text-[var(--success)]' />,
        onSelect: () => ctx.onBatchToggle(true),
      })
    }
    if (ctx.safeEnabled > 0) {
      items.push({
        id: 'disable_all',
        label: ctx.labels.disable,
        icon: <PauseCircle size={13} className='text-[var(--warning)]' />,
        onSelect: () => ctx.onBatchToggle(false),
      })
    }
  }
  items.push({
    id: 'delete',
    label: t('common.delete'),
    icon: <Trash2 size={13} />,
    tone: 'danger',
    separatorBefore: true,
    onSelect: ctx.onDelete,
  })
  return items
}

function TagExpandAffordance({
  hasChildren,
  depth,
  isExpanded,
  onToggle,
}: {
  hasChildren: boolean
  depth: number
  isExpanded: boolean
  onToggle?: (e: MouseEvent) => void
}) {
  if (!hasChildren) {
    return depth > 0 ? <span className='w-2 shrink-0' /> : null
  }
  return (
    <button
      type='button'
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.(e)
      }}
      className='p-0.5 -ml-1 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-colors shrink-0'
    >
      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
    </button>
  )
}

function TagNameEditor({
  initialName,
  onCommit,
}: {
  initialName: string
  onCommit: (nextName: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(initialName)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const commit = (next: string) => onCommit(next.trim() || initialName)

  return (
    <input
      ref={inputRef}
      type='text'
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => commit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(value)
        if (e.key === 'Escape') onCommit(initialName)
      }}
      className='flex-1 bg-[var(--bg-surface)] px-1 py-0.5 text-xs text-[var(--text-primary)] border border-[var(--border-focus)] rounded outline-hidden'
    />
  )
}

function TagNameText({ name, fullName }: { name: string; fullName: string }) {
  return (
    <span className='flex-1 truncate' title={fullName}>
      {name}
    </span>
  )
}

function TagCountBadge({ total, enabled }: { total: number; enabled: number }) {
  return (
    <span className='tabular text-[length:var(--text-10)] text-[var(--text-quaternary)] shrink-0'>
      {total === 0 ? (
        '0'
      ) : enabled < total ? (
        <>
          <span className={enabled > 0 ? 'text-[var(--warning)] font-medium' : 'text-[var(--text-quaternary)]'}>
            {enabled}
          </span>
          /{total}
        </>
      ) : (
        total
      )}
    </span>
  )
}

function TagToggleControl({
  labels,
  total,
  enabled,
  busy,
  onChange,
}: {
  labels: HubTagLabels
  total: number
  enabled: number
  busy: boolean
  onChange: (enabled: boolean) => void
}) {
  const toast = useUi((s) => s.toast)
  const checked = total > 0 && enabled > 0
  const tooltipLabel = total === 0 ? labels.emptyHint : checked ? labels.disable : labels.enable
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        if (total === 0) {
          toast({ title: labels.emptyHint, tone: 'default' })
        }
      }}
      className='flex items-center pl-1 shrink-0'
    >
      <Tooltip label={tooltipLabel} side='top'>
        <div>
          <Switch
            checked={checked}
            disabled={busy || total === 0}
            onChange={onChange}
            label={labels.toggleLabel}
          />
        </div>
      </Tooltip>
    </div>
  )
}

function TagMoreButton({
  buttonRef,
  open,
  onToggle,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type='button'
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className='opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] transition-opacity shrink-0'
    >
      <MoreHorizontal size={12} />
    </button>
  )
}

interface HubTagRowProps extends HubTagItemProps {
  initialName: string
  safeTotal: number
  safeEnabled: number
  moreButtonRef: RefObject<HTMLButtonElement | null>
  isMenuOpen: boolean
  onToggleMenu: () => void
  onContextMenu: (e: MouseEvent) => void
}

function HubTagRow({
  tag,
  displayName,
  depth = 0,
  hasChildren = false,
  isExpanded = false,
  onToggleExpand,
  isSelected,
  isRenaming,
  batchBusy,
  labels,
  onSelect,
  onFinishRename,
  onBatchToggle,
  initialName,
  safeTotal,
  safeEnabled,
  moreButtonRef,
  isMenuOpen,
  onToggleMenu,
  onContextMenu,
}: HubTagRowProps) {
  const displayNameText = displayName || initialName
  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      style={{ paddingLeft: `${depth * TREE_INDENT_STEP + TREE_INDENT_BASE}px` }}
      className={cn(
        'group relative flex h-8 items-center gap-1.5 rounded-[var(--r-md)] pr-2 text-[length:var(--text-12)] font-medium transition-colors cursor-pointer',
        isSelected
          ? 'bg-[var(--accent-subtle)] text-[var(--accent)] font-semibold'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
      )}
    >
      <TagExpandAffordance hasChildren={hasChildren} depth={depth} isExpanded={isExpanded} onToggle={onToggleExpand} />
      <span
        style={{ color: tag.color ?? undefined }}
        className={cn('shrink-0', !tag.color && 'text-[var(--text-quaternary)]')}
      >
        <Hash size={13} />
      </span>
      {isRenaming ? (
        <TagNameEditor initialName={displayNameText} onCommit={onFinishRename} />
      ) : (
        <TagNameText name={displayNameText} fullName={tag.name} />
      )}
      <TagCountBadge total={safeTotal} enabled={safeEnabled} />
      <TagToggleControl
        labels={labels}
        total={safeTotal}
        enabled={safeEnabled}
        busy={batchBusy}
        onChange={onBatchToggle}
      />
      <TagMoreButton buttonRef={moreButtonRef} open={isMenuOpen} onToggle={onToggleMenu} />
    </div>
  )
}

export function HubTagItem(props: HubTagItemProps) {
  const { tag, displayName, counts, labels, onStartRename, onColorChange, onBatchToggle, onDelete } = props
  const contextMenu = useContextMenu()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const initialName = displayName || (tag.name.includes('/') ? tag.name.split('/').pop()! : tag.name)
  const safeTotal = Math.max(0, counts.total)
  const safeEnabled = Math.min(Math.max(0, counts.enabled), safeTotal)
  const menuItems = buildTagMenuItems({
    tag,
    safeTotal,
    safeEnabled,
    labels,
    onStartRename,
    onColorChange,
    onBatchToggle,
    onDelete,
  })
  return (
    <div className='flex flex-col'>
      <HubTagRow
        {...props}
        initialName={initialName}
        safeTotal={safeTotal}
        safeEnabled={safeEnabled}
        moreButtonRef={moreButtonRef}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((prev) => !prev)}
        onContextMenu={contextMenu.onContextMenu}
      />
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
