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
      className='group relative flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 sm:p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-xs cursor-pointer min-h-20'
    >
      <DetailedLinkCardBody link={link} categoryName={categoryName} isFavorite={isFavorite} isPinned={isPinned} />
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

function DetailedLinkCardBody({
  link,
  categoryName,
  isFavorite,
  isPinned,
}: {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  isPinned: boolean
}) {
  return (
    <>
      <div>
        <div className='flex items-center gap-2.5'>
          <CardAvatar avatar={link.avatar} name={link.name} size='md' />
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-1.5'>
              <h4 className='truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors' title={link.name}>
                {link.name}
              </h4>
              {isPinned && <Pin className='size-3 text-amber-500 shrink-0' />}
              {isFavorite && <Star className='size-3 text-amber-500 fill-amber-500 shrink-0' />}
              {categoryName && (
                <span className='rounded bg-[var(--bg-sunken)] px-1.5 py-0.5 text-xs text-[var(--text-tertiary)] shrink-0 hidden sm:inline-block'>
                  {categoryName}
                </span>
              )}
            </div>
          </div>
        </div>
        {link.description && (
          <p className='mt-1.5 line-clamp-2 text-xs text-[var(--text-secondary)] leading-relaxed' title={link.description}>
            {link.description}
          </p>
        )}
      </div>
      <p className='mt-1.5 truncate text-xs text-[var(--text-tertiary)]' title={link.url}>
        {link.url}
      </p>
    </>
  )
}


function CardIconButton({
  onClick,
  title,
  children,
  className = 'text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]',
}: {
  onClick: (e: React.MouseEvent) => void
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`p-1 rounded transition-colors cursor-pointer ${className}`}
      title={title}
    >
      {children}
    </button>
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
      className='absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-[var(--bg-surface)]/95 backdrop-blur-xs p-0.5 opacity-0 shadow-2xs border border-[var(--border-subtle)] transition-opacity group-hover:opacity-100 z-10'
      onClick={(e) => e.stopPropagation()}
    >
      {onCopyLink && <CardIconButton onClick={onCopyLink} title='Copy link'><Copy className='size-3' /></CardIconButton>}
      {onOpenQr && <CardIconButton onClick={onOpenQr} title='Show QR'><QrCode className='size-3' /></CardIconButton>}
      <CardIconButton
        onClick={onToggleFavorite}
        title='Favorite'
        className={isFavorite ? 'text-amber-500 fill-amber-500 hover:bg-[var(--bg-hover)]' : 'text-[var(--text-quaternary)] hover:text-amber-500 hover:bg-[var(--bg-hover)]'}
      >
        <Star className={`size-3 ${isFavorite ? 'fill-current' : ''}`} />
      </CardIconButton>
      <CardIconButton onClick={onOpenMenu} title='More'><MoreVertical className='size-3' /></CardIconButton>
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
      className='group relative flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-2 transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] cursor-pointer overflow-hidden'
    >
      <CardAvatar avatar={link.avatar} name={link.name} size='sm' />
      <div className='flex items-center gap-1.5 min-w-0 flex-1'>
        <span className='text-xs font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] truncate' title={link.name}>
          {link.name}
        </span>
        {isPinned && <Pin className='size-2.5 text-amber-500 shrink-0' />}
        {isFavorite && <Star className='size-2.5 text-amber-500 fill-amber-500 shrink-0' />}
      </div>
      <div
        className='absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded bg-[var(--bg-surface)]/90 backdrop-blur-xs px-1 py-0.5 opacity-0 group-hover:opacity-100 shadow-2xs border border-[var(--border-subtle)] transition-opacity'
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type='button'
          onClick={onOpenMenu}
          className='p-0.5 rounded text-[var(--text-quaternary)] hover:text-[var(--text-primary)] cursor-pointer'
          title='More'
        >
          <MoreVertical className='size-3' />
        </button>
      </div>
    </div>
  )
}

function CardAvatar({ avatar, name, size = 'md' }: { avatar: string | null; name: string; size?: 'sm' | 'md' }) {
  const isSm = size === 'sm'
  const containerClass = isSm
    ? 'size-7 sm:size-8 rounded-md'
    : 'size-9 sm:size-10 rounded-lg'
  const imgClass = isSm ? 'size-4.5 sm:size-5' : 'size-6 sm:size-7'

  if (avatar) {
    return (
      <div className={`${containerClass} overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-sunken)] flex items-center justify-center shrink-0`}>
        <img
          src={avatar}
          alt={name}
          className={`${imgClass} object-contain`}
          loading='lazy'
          referrerPolicy='no-referrer'
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      </div>
    )
  }

  return (
    <div
      className={`${containerClass} border border-[var(--border-subtle)] bg-[var(--accent-softer)] text-[var(--accent)] flex items-center justify-center font-bold text-xs shrink-0`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

