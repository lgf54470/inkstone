import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronRight,
  Copy,
  Edit2,
  ExternalLink,
  FolderInput,
  Pin,
  QrCode,
  Search,
  Star,
  Trash2,
} from 'lucide-react'
import type { BlogLink, BlogLinkCategory } from '@shared/types'
import { useClickOutside, useEscape } from '../../../components/overlay'
import { t } from '../../../lib/i18n'

const MENU_ESTIMATED_WIDTH = 220
const MENU_ESTIMATED_HEIGHT = 360
const VIEWPORT_PADDING = 10
const SUBMENU_WIDTH_THRESHOLD = 360
const SUBMENU_BOTTOM_THRESHOLD = 260

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
  const menuRef = useRef<HTMLDivElement>(null)
  useContextMenuDismiss(menuRef, state.isOpen, onClose)
  const pos = useMenuCoordinates(state.x, state.y)
  if (!state.isOpen || !state.link) return null

  const { link } = state
  return createPortal(
    <div
      ref={menuRef}
      style={{ left: pos.posX, top: pos.posY }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className='fixed z-[var(--z-pop)] min-w-44 rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 text-[var(--text-primary)] shadow-lg animate-in fade-in zoom-in-95 duration-100 text-[length:var(--text-12)] select-none'
    >
      <div className='px-2 py-1 border-b border-[var(--border-subtle)] mb-1'>
        <p className='truncate font-semibold text-[length:var(--text-11)] text-[var(--text-secondary)]'>{link.name}</p>
      </div>

      <PrimaryMenuItems link={link} onCopy={onCopy} onQRCode={onQRCode} onClose={onClose} />
      <div className='my-1 h-px bg-[var(--border-subtle)]' />

      <StateMenuItems link={link} onTogglePin={onTogglePin} onToggleFavorite={onToggleFavorite} onCheckLink={onCheckLink} onClose={onClose} />
      <CategorySubmenuItem
        link={link}
        categories={categories}
        onMoveCategory={onMoveCategory}
        onClose={onClose}
        isNearRight={pos.isNearRight}
        isNearBottom={pos.isNearBottom}
      />
      <div className='my-1 h-px bg-[var(--border-subtle)]' />

      <ActionMenuItems link={link} onEdit={onEdit} onDelete={onDelete} onClose={onClose} />
    </div>,
    document.body,
  )
}

function useMenuCoordinates(x: number, y: number) {
  const posX = Math.max(VIEWPORT_PADDING, Math.min(x, window.innerWidth - MENU_ESTIMATED_WIDTH))
  const posY = Math.max(VIEWPORT_PADDING, Math.min(y, window.innerHeight - MENU_ESTIMATED_HEIGHT))
  const isNearRight = posX > window.innerWidth - SUBMENU_WIDTH_THRESHOLD
  const isNearBottom = posY > window.innerHeight - SUBMENU_BOTTOM_THRESHOLD
  return { posX, posY, isNearRight, isNearBottom }
}

function ActionMenuItems({
  link,
  onEdit,
  onDelete,
  onClose,
}: {
  link: BlogLink
  onEdit: (link: BlogLink) => void
  onDelete: (link: BlogLink) => void
  onClose: () => void
}) {
  return (
    <>
      <ContextMenuItem icon={<Edit2 size={13} />} label={t('blog.edit_link')} onClick={() => { onEdit(link); onClose() }} />
      <ContextMenuItem icon={<Trash2 size={13} />} label={t('blog.delete_link')} danger onClick={() => { onDelete(link); onClose() }} />
    </>
  )
}

function useContextMenuDismiss(ref: React.RefObject<HTMLDivElement | null>, isOpen: boolean, onClose: () => void) {
  useEscape(isOpen, onClose)
  useClickOutside([ref], isOpen, onClose)
  useEffect(() => {
    if (!isOpen) return
    const handleScroll = () => onClose()
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [isOpen, onClose])
}

function PrimaryMenuItems({
  link,
  onCopy,
  onQRCode,
  onClose,
}: {
  link: BlogLink
  onCopy: (link: BlogLink) => void
  onQRCode: (link: BlogLink) => void
  onClose: () => void
}) {
  return (
    <>
      <ContextMenuItem icon={<Copy size={13} />} label={t('blog.link_menu_copy')} onClick={() => { onCopy(link); onClose() }} />
      <ContextMenuItem icon={<QrCode size={13} />} label={t('blog.link_menu_qrcode')} onClick={() => { onQRCode(link); onClose() }} />
      <ContextMenuItem icon={<ExternalLink size={13} />} label={t('blog.link_menu_open')} onClick={() => { window.open(link.url, '_blank', 'noopener,noreferrer'); onClose() }} />
    </>
  )
}

function StateMenuItems({
  link,
  onTogglePin,
  onToggleFavorite,
  onCheckLink,
  onClose,
}: {
  link: BlogLink
  onTogglePin: (link: BlogLink) => void
  onToggleFavorite: (link: BlogLink) => void
  onCheckLink: (link: BlogLink) => void
  onClose: () => void
}) {
  return (
    <>
      <ContextMenuItem
        icon={<Star size={13} className={link.isFavorite ? 'fill-amber-500 text-amber-500' : ''} />}
        label={link.isFavorite ? t('blog.link_unfavorite') : t('blog.link_favorite')}
        onClick={() => { onToggleFavorite(link); onClose() }}
      />
      <ContextMenuItem
        icon={<Pin size={13} className={link.isPinned ? 'text-[var(--accent)]' : ''} />}
        label={link.isPinned ? t('blog.link_unpin') : t('blog.link_pin')}
        onClick={() => { onTogglePin(link); onClose() }}
      />
      <ContextMenuItem icon={<Search size={13} />} label={t('blog.link_menu_check')} onClick={() => { onCheckLink(link); onClose() }} />
    </>
  )
}

interface CategorySubmenuProps {
  link: BlogLink
  categories: BlogLinkCategory[]
  onMoveCategory: (link: BlogLink, categoryId: string | null) => void
  onClose: () => void
  isNearRight?: boolean
  isNearBottom?: boolean
}

function CategorySubmenuItem(props: CategorySubmenuProps) {
  const [show, setShow] = useState(false)
  return (
    <div className='relative' onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)] hover:bg-[var(--bg-hover)]'
      >
        <div className='flex items-center gap-2'>
          <FolderInput size={13} />
          <span>{t('blog.link_menu_move_category')}</span>
        </div>
        <ChevronRight size={12} className='text-[var(--text-quaternary)]' />
      </button>

      {show && <CategorySubmenuList {...props} />}
    </div>
  )
}

function CategorySubmenuList({
  link,
  categories,
  onMoveCategory,
  onClose,
  isNearRight,
  isNearBottom,
}: CategorySubmenuProps) {
  return (
    <div
      className={`absolute ${isNearRight ? 'right-full mr-1' : 'left-full ml-1'} ${
        isNearBottom ? 'bottom-0' : 'top-0'
      } min-w-36 max-h-56 overflow-y-auto rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-lg`}
    >
      <button
        type='button'
        onClick={() => { onMoveCategory(link, null); onClose() }}
        className={`flex w-full items-center justify-between rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] hover:bg-[var(--bg-hover)] ${
          !link.categoryId ? 'font-semibold text-[var(--accent)]' : ''
        }`}
      >
        <span>{t('blog.link_no_category')}</span>
        {!link.categoryId && <Check size={12} />}
      </button>
      {categories.map((cat) => (
        <CategoryItemButton
          key={cat.id}
          cat={cat}
          isSelected={link.categoryId === cat.id}
          onClick={() => { onMoveCategory(link, cat.id); onClose() }}
        />
      ))}
    </div>
  )
}

function CategoryItemButton({
  cat,
  isSelected,
  onClick,
}: {
  cat: BlogLinkCategory
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-11)] hover:bg-[var(--bg-hover)] ${
        isSelected ? 'font-semibold text-[var(--accent)]' : ''
      }`}
    >
      <span className='truncate'>{cat.parentId ? `  └ ${cat.name}` : cat.name}</span>
      {isSelected && <Check size={12} />}
    </button>
  )
}

function ContextMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)] transition-colors ${
        danger
          ? 'text-[var(--danger)] hover:bg-[var(--danger-subtle)]'
          : 'hover:bg-[var(--bg-hover)]'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
