import { useEffect, useRef } from 'react'
import {
  Copy,
  ExternalLink,
  Flag,
  Pin,
  QrCode,
  Share2,
  Star,
} from 'lucide-react'
import type { BlogPublicLink } from '../../lib/types'
import { t, type BlogLocale } from '../../lib/i18n'
import { useCurrentLocale } from '../../lib/i18n/use-current-locale'
import type { ContextMenuState } from './types'

export interface LinkContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onOpenQr: (link: BlogPublicLink) => void
  onToggleFavorite: (id: string) => void
  onTogglePin: (id: string) => void
  isFavorite: boolean
  isPinned: boolean
  onShowToast: (msg: string) => void
  onVisit: (link: BlogPublicLink) => void
}

export function LinkContextMenu(props: LinkContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const locale = useCurrentLocale()
  useDismissible(menuRef, props.state.isOpen, props.onClose)

  if (!props.state.isOpen || !props.state.link) return null

  const { link } = props.state
  const posStyle = computeMenuPosition(props.state.x, props.state.y)

  return (
    <div
      ref={menuRef}
      style={posStyle}
      className='fixed z-50 min-w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100'
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className='px-2.5 py-1.5 border-b border-[var(--border-subtle)] mb-1'>
        <p className='text-xs font-semibold text-[var(--text-primary)] truncate max-w-44'>
          {link.name}
        </p>
      </div>

      <div className='flex flex-col gap-0.5'>
        <ActionItems link={link} locale={locale} props={props} />
        <div className='my-1 h-px bg-[var(--border-subtle)]' />
        <FavoritePinItems link={link} locale={locale} props={props} />
        <div className='my-1 h-px bg-[var(--border-subtle)]' />
        <ReportItem locale={locale} props={props} />
      </div>
    </div>
  )
}

function useDismissible(ref: React.RefObject<HTMLDivElement | null>, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleOutside)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('mousedown', handleOutside)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose, ref])
}

function ActionItems({
  link,
  locale,
  props,
}: {
  link: BlogPublicLink
  locale: BlogLocale
  props: LinkContextMenuProps
}) {
  return (
    <>
      <MenuItem
        icon={<Copy className='size-3.5' />}
        label={t('links.menu_copy', {}, locale)}
        onClick={() => handleCopyLink(link, props.onShowToast, props.onClose, locale)}
      />
      <MenuItem
        icon={<QrCode className='size-3.5' />}
        label={t('links.menu_qrcode', {}, locale)}
        onClick={() => {
          props.onClose()
          props.onOpenQr(link)
        }}
      />
      <MenuItem
        icon={<ExternalLink className='size-3.5' />}
        label={t('links.menu_open_new', {}, locale)}
        onClick={() => handleOpenNew(link, props.onVisit, props.onClose)}
      />
      <MenuItem
        icon={<Share2 className='size-3.5' />}
        label={t('links.menu_share', {}, locale)}
        onClick={() => handleShareLink(link, props.onShowToast, props.onClose, locale)}
      />
    </>
  )
}

function FavoritePinItems({
  link,
  locale,
  props,
}: {
  link: BlogPublicLink
  locale: BlogLocale
  props: LinkContextMenuProps
}) {
  return (
    <>
      <MenuItem
        icon={<Star className={`size-3.5 ${props.isFavorite ? 'fill-amber-500 text-amber-500' : ''}`} />}
        label={t(props.isFavorite ? 'links.menu_unfavorite' : 'links.menu_favorite', {}, locale)}
        onClick={() => {
          props.onToggleFavorite(link.id)
          props.onClose()
        }}
      />
      <MenuItem
        icon={<Pin className={`size-3.5 ${props.isPinned ? 'text-[var(--accent)]' : ''}`} />}
        label={t(props.isPinned ? 'links.menu_unpin' : 'links.menu_pin', {}, locale)}
        onClick={() => {
          props.onTogglePin(link.id)
          props.onClose()
        }}
      />
    </>
  )
}

function ReportItem({ locale, props }: { locale: BlogLocale; props: LinkContextMenuProps }) {
  return (
    <MenuItem
      icon={<Flag className='size-3.5 text-rose-500' />}
      label={t('links.menu_report', {}, locale)}
      danger
      onClick={() => {
        props.onClose()
        props.onShowToast(t('links.report_thanks', {}, locale))
      }}
    />
  )
}

function MenuItem({
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
      className={`flex items-center gap-2.5 w-full rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
        danger
          ? 'text-rose-500 hover:bg-rose-500/10'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
      }`}
    >
      <span className='shrink-0'>{icon}</span>
      <span className='font-medium truncate'>{label}</span>
    </button>
  )
}

function computeMenuPosition(x: number, y: number): React.CSSProperties {
  const menuWidth = 190
  const menuHeight = 280
  const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1024
  const winHeight = typeof window !== 'undefined' ? window.innerHeight : 768

  const adjustedX = x + menuWidth > winWidth ? Math.max(8, winWidth - menuWidth - 8) : x
  const adjustedY = y + menuHeight > winHeight ? Math.max(8, winHeight - menuHeight - 8) : y

  return {
    left: `${adjustedX}px`,
    top: `${adjustedY}px`,
  }
}

function handleCopyLink(
  link: BlogPublicLink,
  showToast: (msg: string) => void,
  close: () => void,
  locale: BlogLocale,
) {
  close()
  copyText(link.url, () => showToast(t('links.copied_toast', {}, locale)))
}

function handleOpenNew(
  link: BlogPublicLink,
  onVisit: (link: BlogPublicLink) => void,
  close: () => void,
) {
  close()
  onVisit(link)
  window.open(link.url, '_blank', 'noopener,noreferrer')
}

function handleShareLink(
  link: BlogPublicLink,
  showToast: (msg: string) => void,
  close: () => void,
  locale: BlogLocale,
) {
  close()
  const nav = typeof window !== 'undefined' ? window.navigator : null
  if (nav && 'share' in nav) {
    nav
      .share({
        title: link.name,
        text: link.description || link.name,
        url: link.url,
      })
      .catch(() => {
        // Share dismissed or unsupported
      })
    return
  }
  copyText(`${link.name} - ${link.url}`, () => showToast(t('links.copied_toast', {}, locale)))
}

function copyText(text: string, onSuccess: () => void) {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.clipboard) {
    void window.navigator.clipboard.writeText(text).then(onSuccess)
  }
}
