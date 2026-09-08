import { ExternalLink, MoreVertical, Pin, Star } from 'lucide-react'
import type { BlogPublicLink } from '../../lib/types'
import { t } from '../../lib/i18n'
import { useCurrentLocale } from '../../lib/i18n/use-current-locale'
import type { ViewMode } from './types'

export interface LinkCardProps {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  isPinned: boolean
  viewMode: ViewMode
  onToggleFavorite: (id: string) => void
  onContextMenu: (link: BlogPublicLink, x: number, y: number) => void
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
  onOpenMenu,
}: {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  isPinned: boolean
  onClick: (e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent) => void
  onToggleFavorite: () => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className='group relative flex flex-col justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-xs cursor-pointer'
    >
      <div className='space-y-2.5'>
        <DetailedCardHeader
          link={link}
          categoryName={categoryName}
          isFavorite={isFavorite}
          onToggleFavorite={onToggleFavorite}
          onOpenMenu={onOpenMenu}
        />
        {link.description && (
          <p className='text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed'>
            {link.description}
          </p>
        )}
      </div>

      <DetailedCardFooter url={link.url} isPinned={isPinned} />
    </div>
  )
}

function DetailedCardHeader({
  link,
  categoryName,
  isFavorite,
  onToggleFavorite,
  onOpenMenu,
}: {
  link: BlogPublicLink
  categoryName?: string
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div className='flex items-start justify-between gap-2.5'>
      <div className='flex items-center gap-2.5 min-w-0 flex-1'>
        <CardAvatar avatar={link.avatar} name={link.name} />
        <div className='min-w-0 flex-1'>
          <h4 className='font-bold text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate'>
            {link.name}
          </h4>
          {categoryName && (
            <span className='inline-block rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-xs text-[var(--text-tertiary)]'>
              {categoryName}
            </span>
          )}
        </div>
      </div>

      <CardHeaderActions
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onOpenMenu={onOpenMenu}
      />
    </div>
  )
}

function CardHeaderActions({
  isFavorite,
  onToggleFavorite,
  onOpenMenu,
}: {
  isFavorite: boolean
  onToggleFavorite: () => void
  onOpenMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div className='flex items-center gap-1 shrink-0' onClick={(e) => e.stopPropagation()}>
      <button
        type='button'
        onClick={onToggleFavorite}
        className={`p-1 rounded-md transition-colors cursor-pointer ${
          isFavorite ? 'text-amber-500 fill-amber-500' : 'text-[var(--text-quaternary)] hover:text-amber-500'
        }`}
      >
        <Star className={`size-3.5 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
      <button
        type='button'
        onClick={onOpenMenu}
        className='p-1 rounded-md text-[var(--text-quaternary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer'
      >
        <MoreVertical className='size-3.5' />
      </button>
    </div>
  )
}

function DetailedCardFooter({ url, isPinned }: { url: string; isPinned: boolean }) {
  const locale = useCurrentLocale()
  return (
    <div className='flex items-center justify-between gap-2 pt-3 mt-2 border-t border-[var(--border-subtle)] text-xs text-[var(--text-tertiary)]'>
      <span className='truncate max-w-40'>{formatDisplayUrl(url)}</span>
      <div className='flex items-center gap-1.5 shrink-0'>
        {isPinned && (
          <span className='inline-flex items-center gap-0.5 rounded px-1 py-0.2 bg-[var(--accent-softer)] text-[var(--accent)] font-medium'>
            <Pin className='size-2.5' />
            {t('post.pinned', {}, locale)}
          </span>
        )}
        <ExternalLink className='size-3 group-hover:text-[var(--accent)] transition-colors' />
      </div>
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
      className='group flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 transition-all hover:border-[var(--accent)] hover:bg-[var(--bg-hover)] cursor-pointer'
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
  const sizeClass = size === 'sm' ? 'size-5 rounded-md' : 'size-8 rounded-lg'
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
      className={`${sizeClass} border border-[var(--border-subtle)] bg-[var(--accent-softer)] text-[var(--accent)] flex items-center justify-center font-bold text-xs shrink-0`}
    >
      {name.charAt(0)}
    </div>
  )
}

function formatDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\//, '')
  }
}
