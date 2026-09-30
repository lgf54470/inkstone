import { Check, Copy, Edit2, ExternalLink, FolderInput, Pin, QrCode, Search, Star, Trash2 } from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { safeExternalUrl } from '@shared/url-safety'
import { Menu, type MenuItem } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'

const MENU_WIDTH = 208

/**
 * Where the panel opens for the event that asked for it: a pointer reports the coordinates it
 * happened at, while a keyboard-invoked `contextmenu` (the context-menu key, Shift+F10) reaches
 * some browsers with 0,0 — anchored there the panel landed pinned to the page corner. The
 * trigger's own box is the fallback that puts it where the reader is looking instead.
 */
export function linkMenuAnchorPoint(event: {
  clientX: number
  clientY: number
  currentTarget: EventTarget & Element
}): { x: number; y: number } {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY }
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: rect.left, y: rect.bottom }
}

export interface LinkContextMenuState {
  isOpen: boolean
  x: number
  y: number
  link: BlogLink | null
}

export interface LinkContextMenuProps {
  state: LinkContextMenuState
  categories: BlogLinkCategory[]
  onClose: () => void
  onCopy: (link: BlogLink) => void
  onQRCode: (link: BlogLink) => void
  onTogglePin: (link: BlogLink) => void
  onToggleFavorite: (link: BlogLink) => void
  onMoveCategory: (link: BlogLink, categoryId: string | null) => void
  onCheckLink: (link: BlogLink) => void
  onEdit: (link: BlogLink) => void
  onDelete: (link: BlogLink) => void
}

/**
 * The panel every row can open — from its own actions button and from a right-click. It is the
 * shared `Menu`, so the rows are real `menuitem`s with a cursor and a panel arrow, rather than the
 * hand-positioned portal this used to draw, whose submenu answered to hover alone and which put
 * itself in the corner when a keyboard opened it.
 */
export function LinkContextMenu({
  state,
  categories,
  onClose,
  onCopy,
  onQRCode,
  onTogglePin,
  onToggleFavorite,
  onMoveCategory,
  onCheckLink,
  onEdit,
  onDelete,
}: LinkContextMenuProps) {
  const link = state.link
  const items = link
    ? buildLinkMenuItems(link, categories, { onCopy, onQRCode, onTogglePin, onToggleFavorite, onMoveCategory, onCheckLink, onEdit, onDelete })
    : []
  return (
    <Menu
      anchor={{ x: state.x, y: state.y }}
      open={state.isOpen && Boolean(link)}
      onClose={onClose}
      items={items}
      width={MENU_WIDTH}
      label={link ? t('blog.link_menu_label', { value0: link.name }) : t('overlay.menu')}
    />
  )
}

interface LinkMenuActions {
  onCopy: (link: BlogLink) => void
  onQRCode: (link: BlogLink) => void
  onTogglePin: (link: BlogLink) => void
  onToggleFavorite: (link: BlogLink) => void
  onMoveCategory: (link: BlogLink, categoryId: string | null) => void
  onCheckLink: (link: BlogLink) => void
  onEdit: (link: BlogLink) => void
  onDelete: (link: BlogLink) => void
}

function buildLinkMenuItems(link: BlogLink, categories: BlogLinkCategory[], actions: LinkMenuActions): MenuItem[] {
  // A reader submitted this address; opening is offered only when it is one a link may carry, so the
  // menu never becomes the click that runs it inside the admin's session.
  const openUrl = safeExternalUrl(link.url)
  const items: MenuItem[] = [
    { id: 'copy', label: t('blog.link_menu_copy'), icon: <Copy size={13} />, onSelect: () => actions.onCopy(link) },
    { id: 'qr', label: t('blog.link_menu_qrcode'), icon: <QrCode size={13} />, onSelect: () => actions.onQRCode(link) },
  ]
  if (openUrl) {
    items.push({
      id: 'open',
      label: t('blog.link_menu_open'),
      icon: <ExternalLink size={13} />,
      onSelect: () => window.open(openUrl, '_blank', 'noopener,noreferrer'),
    })
  }
  items.push(
    {
      id: 'favorite',
      label: link.isFavorite ? t('blog.link_unfavorite') : t('blog.link_favorite'),
      icon: <Star size={13} className={link.isFavorite ? 'text-[var(--warning)]' : ''} />,
      checked: link.isFavorite,
      separatorBefore: true,
      onSelect: () => actions.onToggleFavorite(link),
    },
    {
      id: 'pin',
      label: link.isPinned ? t('blog.link_unpin') : t('blog.link_pin'),
      icon: <Pin size={13} className={link.isPinned ? 'text-[var(--accent)]' : ''} />,
      checked: link.isPinned,
      onSelect: () => actions.onTogglePin(link),
    },
    { id: 'check', label: t('blog.link_menu_check'), icon: <Search size={13} />, onSelect: () => actions.onCheckLink(link) },
    {
      id: 'move',
      label: t('blog.link_menu_move_category'),
      icon: <FolderInput size={13} />,
      separatorBefore: true,
      submenu: ({ closeMenu }) => (
        <CategorySubmenuList link={link} categories={categories} onMoveCategory={actions.onMoveCategory} closeMenu={closeMenu} />
      ),
    },
    { id: 'edit', label: t('blog.edit_link'), icon: <Edit2 size={13} />, separatorBefore: true, onSelect: () => actions.onEdit(link) },
    { id: 'delete', label: t('blog.delete_link'), icon: <Trash2 size={13} />, tone: 'danger', onSelect: () => actions.onDelete(link) },
  )
  return items
}

function CategorySubmenuList({
  link,
  categories,
  onMoveCategory,
  closeMenu,
}: {
  link: BlogLink
  categories: BlogLinkCategory[]
  onMoveCategory: (link: BlogLink, categoryId: string | null) => void
  closeMenu: () => void
}) {
  return (
    <div className='max-h-72 w-54.5 overflow-y-auto rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1.5 shadow-[var(--shadow-pop)]'>
      <CategoryOption
        label={t('blog.link_no_category')}
        isSelected={!link.categoryId}
        onSelect={() => {
          closeMenu()
          onMoveCategory(link, null)
        }}
      />
      {categories.map((cat) => (
        <CategoryOption
          key={cat.id}
          label={cat.parentId ? `${t('blog.tree_branch_prefix')}${cat.name}` : cat.name}
          isSelected={link.categoryId === cat.id}
          onSelect={() => {
            closeMenu()
            onMoveCategory(link, cat.id)
          }}
        />
      ))}
    </div>
  )
}

function CategoryOption({ label, isSelected, onSelect }: { label: string; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      type='button'
      aria-pressed={isSelected}
      onClick={onSelect}
      className={cn(
        'flex h-10 w-full items-center gap-2 rounded-[var(--r-sm)] px-2 text-left text-[length:var(--text-12)] transition-colors hover:bg-[var(--bg-hover)] md:h-7.5',
        isSelected ? 'font-semibold text-[var(--accent)]' : 'text-[var(--text-primary)]',
      )}
    >
      <span className='min-w-0 flex-1 truncate'>{label}</span>
      {isSelected && <Check size={12} className='shrink-0' aria-hidden />}
    </button>
  )
}
