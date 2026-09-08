import { Copy, MoreVertical, Pin, QrCode, Star } from 'lucide-react'
import type { BlogPublicLink } from '../../lib/types'
import type { ViewMode } from './types'

export interface LinkCardProps {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  isPinned: boolean
  viewMode: ViewMode
  onToggleFavorite: (id: string) => void
  onContextMenu: (link: BlogPublicLink, x: number, y: number) => void
  onOpenQr?: (link: BlogPublicLink) => void
  onCopyLink?: (url: string) => void
  onVisit: (link: BlogPublicLink) => void
}

export function LinkCard(props: LinkCardProps) {
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    props.onContextMenu(props.link, e.clientX, e.clientY)
  }

  const handleClick = () => {
    props.onVisit(props.link)
    window.open(props.link.url, '_blank', 'noopener,noreferrer')
  }

  if (props.viewMode === 'simple') {
    return (
      <SimpleLinkItem
        link={props.link}
        isFavorite={props.isFavorite}
        isPinned={props.isPinned}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onOpenMenu={(e) => {
          e.stopPropagation()
          props.onContextMenu(props.link, e.clientX, e.clientY)
        }}
      />
    )
  }

  return (
    <DetailedLinkCard
      link={props.link}
      categoryName={props.categoryName}
      isFavorite={props.isFavorite}
      isPinned={props.isPinned}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onToggleFavorite={() => props.onToggleFavorite(props.link.id)}
      onOpenQr={props.onOpenQr ? () => props.onOpenQr?.(props.link) : undefined}
      onCopyLink={props.onCopyLink ? () => props.onCopyLink?.(props.link.url) : undefined}
      onOpenMenu={(e) => {
        e.stopPropagation()
        props.onContextMenu(props.link, e.clientX, e.clientY)
      }}
    />
  )
}

function DetailedLinkCard({
  link,
  categoryName,
  isFavorite,
  isPinned,
  onClick,
  onContextMenu,
  onToggleFavorite,
  onOpenQr,
  onCopyLink,
  onOpenMenu,
}: {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  isPinned: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleFavorite: () => void
  onOpenQr?: () => void
  onCopyLink?: () => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className='group relative flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 sm:p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-xs cursor-pointer'
    >
      <CardAvatar avatar={link.avatar} name={link.name} />
      <div className='min-w-0 flex-1 space-y-0.5'>
        <div className='flex items-center gap-1.5'>
          <h4 className='font-semibold text-sm sm:text-base text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate'>
            {link.name}
          </h4>
          {categoryName && (
            <span className='rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-xs text-[var(--text-tertiary)] shrink-0 hidden sm:inline-block'>
              {categoryName}
            </span>
          )}
          {isPinned && <Pin className='size-3 text-[var(--accent)] shrink-0' />}
          {isFavorite && <Star className='size-3 text-amber-500 fill-amber-500 shrink-0' />}
        </div>
        {link.description && (
          <p className='text-xs text-[var(--text-secondary)] line-clamp-1 leading-relaxed'>
            {link.description}
          </p>
        )}
        <p className='text-xs text-[var(--text-tertiary)] truncate'>
          {formatDisplayUrl(link.url)}
        </p>
      </div>

      <CardActions
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onOpenQr={onOpenQr}
        onCopyLink={onCopyLink}
        onOpenMenu={onOpenMenu}
      />
    </div>
  )
}

function CardActions({
  isFavorite,
  onToggleFavorite,
  onOpenQr,
  onCopyLink,
  onOpenMenu,
}: {
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpenQr?: () => void
  onCopyLink?: () => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className='flex items-center gap-0.5 shrink-0 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'
      onClick={(e) => e.stopPropagation()}
    >
      {onCopyLink && (
        <button
          type='button'
          onClick={onCopyLink}
          className='p-1.5 rounded-lg text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
          title='Copy link'
        >
          <Copy className='size-3.5' />
        </button>
      )}
      {onOpenQr && (
        <button
          type='button'
          onClick={onOpenQr}
          className='p-1.5 rounded-lg text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
          title='Show QR'
        >
          <QrCode className='size-3.5' />
        </button>
      )}
      <button
        type='button'
        onClick={onToggleFavorite}
        className={`p-1.5 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-hover)] ${
          isFavorite ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-quaternary)] hover:text-amber-500'
        }`}
        title='Favorite'
      >
        <Star className={`size-3.5 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
      <button
        type='button'
        onClick={onOpenMenu}
        className='p-1.5 rounded-lg text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
      >
        <MoreVertical className='size-3.5' />
      </button>
    </div>
  )
}

function SimpleLinkItem({
  link,
  isFavorite,
  isPinned,
  onClick,
  onContextMenu,
  onOpenMenu,
}: {
  link: BlogPublicLink
  isFavorite: boolean
  isPinned: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className='group flex items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5 transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] cursor-pointer'
    >
      <div className='flex items-center gap-2 min-w-0 flex-1'>
        <CardAvatar avatar={link.avatar} name={link.name} size='sm' />
        <span className='text-xs font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate'>
          {link.name}
        </span>
        {isPinned && <Pin className='size-2.5 text-[var(--accent)] shrink-0' />}
        {isFavorite && <Star className='size-2.5 text-amber-500 fill-amber-500 shrink-0' />}
      </div>
      <div className='flex items-center gap-1 shrink-0' onClick={(e) => e.stopPropagation()}>
        <button
          type='button'
          onClick={onOpenMenu}
          className='p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity'
        >
          <MoreVertical className='size-3' />
        </button>
      </div>
    </div>
  )
}

function CardAvatar({ avatar, name, size = 'md' }: { avatar: string | null; name: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'size-6 rounded-md' : 'size-11 sm:size-12 rounded-xl'
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={`${sizeClass} object-cover border border-[var(--border-subtle)] bg-[var(--bg-sunken)] shrink-0`}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} border border-[var(--border-subtle)] bg-[var(--accent-softer)] text-[var(--accent)] flex items-center justify-center font-bold text-xs sm:text-sm shrink-0`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch (error) {
    void error
    return url.replace(/^https?:\/\//, '')
  }
}

