import type { ReactNode, RefObject } from 'react'
import { Copy, ExternalLink, Eye, FolderClosed, FolderInput, MessageSquare, Pin, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import type { BlogCategory, BlogFolder, BlogPost } from '@shared/types'
import { IconButton } from '../../../components/primitives'
import { Menu, type MenuItem } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { useBlogPostCard } from './use-blog-post-card'
import { PostCoverImage } from './cover-image'

export function BlogGridCard({
  post,
  isSelected,
  cat,
  folder,
  folders,
  frontendBase,
  onToggleSelect,
  onOpenEdit,
}: {
  post: BlogPost
  isSelected: boolean
  cat: BlogCategory | null
  folder: BlogFolder | null
  folders: BlogFolder[]
  frontendBase: string
  onToggleSelect: () => void
  onOpenEdit: (post: BlogPost) => void
}) {
  const card = useBlogPostCard({ post, folders, frontendBase, onOpenEdit })

  return (
    <div
      draggable
      onDragStart={(e) => startCardDrag(e, post.id)}
      onContextMenu={(e) => openCardContextMenu(e, card)}
      onDoubleClick={() => onOpenEdit(post)}
      className={cn(
        'group relative flex flex-col rounded-[var(--r-xl)] border transition-all overflow-hidden cursor-grab active:cursor-grabbing select-none',
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-softer)] shadow-[var(--shadow-sm)]'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]',
      )}
      title={t('blog.drag_to_folder_hint')}
    >
      <CardTopControls post={post} isSelected={isSelected} onToggleSelect={onToggleSelect} onTogglePin={() => void card.updatePost(post.id, { isPinned: !post.isPinned })} />

      <CardCover post={post} />

      <div className='flex flex-1 flex-col p-4'>
        <CardBody post={post} folder={folder} cat={cat} />

        <CardFooter
          post={post}
          postUrl={card.postUrl}
          folderButtonRef={card.folderButtonRef}
          isFolderMenuOpen={card.isFolderMenuOpen}
          onToggleFolderMenu={() => card.setIsFolderMenuOpen((prev) => !prev)}
          onCloseFolderMenu={() => card.setIsFolderMenuOpen(false)}
          folderMenuItems={card.folderMenuItems}
          onCopyLink={() => void card.handleCopyLink(post.slug)}
          onOpenEdit={() => onOpenEdit(post)}
          onSync={() => void card.handleSync()}
          onDelete={() => void card.handleDelete()}
        />
      </div>

      {card.contextMenu.point && (
        <Menu
          open
          anchor={card.contextMenu.point}
          items={card.contextMenuItems}
          onClose={card.contextMenu.close}
        />
      )}
    </div>
  )
}

function startCardDrag(e: React.DragEvent, postId: string): void {
  e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([postId]))
  e.dataTransfer.effectAllowed = 'move'
}

function openCardContextMenu(e: React.MouseEvent, card: ReturnType<typeof useBlogPostCard>): void {
  e.preventDefault()
  e.stopPropagation()
  card.setIsFolderMenuOpen(false)
  card.contextMenu.onContextMenu(e)
}

function CardBody({ post, folder, cat }: { post: BlogPost; folder: BlogFolder | null; cat: BlogCategory | null }) {
  return (
    <>
      <CardMeta post={post} folder={folder} cat={cat} />
      <h3 className='font-semibold text-[length:var(--text-14)] text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors'>
        {post.title}
      </h3>
      <p className='mt-1 text-[length:var(--text-12)] text-[var(--text-tertiary)] line-clamp-2 leading-relaxed flex-1'>
        {post.excerpt || t('blog.no_excerpt')}
      </p>
      <CardTags post={post} />
    </>
  )
}

function CardTopControls({
  post,
  isSelected,
  onToggleSelect,
  onTogglePin,
}: {
  post: BlogPost
  isSelected: boolean
  onToggleSelect: () => void
  onTogglePin: () => void
}) {
  return (
    <>
      <div className='absolute top-2.5 left-2.5 z-[var(--z-sticky)]'>
        <input
          type='checkbox'
          checked={isSelected}
          onChange={onToggleSelect}
          className='size-4 rounded accent-[var(--accent)] cursor-pointer drop-shadow-[var(--drop-shadow-sm)]'
        />
      </div>

      <button
        type='button'
        onClick={onTogglePin}
        className={cn(
          'absolute top-2.5 right-2.5 z-[var(--z-sticky)] flex size-6 items-center justify-center rounded-full shadow-[var(--shadow-sm)] backdrop-blur transition-all',
          post.isPinned
            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
            : 'bg-[var(--bg-overlay)]/90 text-[var(--text-quaternary)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]',
        )}
        title={post.isPinned ? t('blog.unpin_post') : t('blog.pin_post')}
      >
        <Pin size={12} className={post.isPinned ? 'fill-current' : ''} />
      </button>
    </>
  )
}

function CardCover({ post }: { post: BlogPost }) {
  return (
    <div className='relative h-36 w-full bg-[var(--bg-sunken)] overflow-hidden'>
      <PostCoverImage src={post.coverUrl} alt={post.title} />

      <div className='absolute bottom-2 left-2'>
        {post.isPublished ? (
          <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[length:var(--text-10\.5)] font-semibold text-white shadow-[var(--shadow-sm)] backdrop-blur whitespace-nowrap">
            {t('blog.published')}
          </span>
        ) : (
          <span className="rounded-full bg-stone-600/80 px-2 py-0.5 text-[length:var(--text-10\.5)] font-medium text-white shadow-[var(--shadow-sm)] backdrop-blur whitespace-nowrap">
            {t('blog.draft')}
          </span>
        )}
      </div>
    </div>
  )
}

function CardMeta({ post, folder, cat }: { post: BlogPost; folder: BlogFolder | null; cat: BlogCategory | null }) {
  return (
    <div className='flex items-center gap-1.5 mb-1.5 flex-wrap'>
      {folder && (
        <span
          className="flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-medium truncate"
          style={{
            backgroundColor: folder.color ? `${folder.color}15` : 'var(--bg-sunken)',
            color: folder.color || 'var(--text-secondary)',
          }}
        >
          <FolderClosed size={10} className='shrink-0' />
          <span className='truncate max-w-22.5'>{folder.name}</span>
        </span>
      )}

      {cat && (
        <span
          className="rounded-[var(--r-sm)] px-1.5 py-0.2 text-[length:var(--text-10\.5)] font-medium truncate max-w-22.5"
          style={{
            backgroundColor: cat.color ? `${cat.color}15` : 'var(--bg-sunken)',
            color: cat.color || 'var(--text-secondary)',
          }}
        >
          {cat.name}
        </span>
      )}

      <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)] ml-auto whitespace-nowrap'>
        {new Date(post.publishedAt).toLocaleDateString()}
      </span>
    </div>
  )
}

function CardTags({ post }: { post: BlogPost }) {
  if (post.tags.length === 0) return null
  return (
    <div className='mt-2.5 flex flex-wrap gap-1'>
      {post.tags.slice(0, 3).map((tg) => (
        <span
          key={tg}
          className='rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] truncate max-w-22.5'
          title={tg}
        >
          #{tg.includes('/') ? tg.split('/').pop() : tg}
        </span>
      ))}
      {post.tags.length > 3 && (
        <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
          +{post.tags.length - 3}
        </span>
      )}
    </div>
  )
}

function CardFooter({
  post,
  postUrl,
  folderButtonRef,
  isFolderMenuOpen,
  onToggleFolderMenu,
  onCloseFolderMenu,
  folderMenuItems,
  onCopyLink,
  onOpenEdit,
  onSync,
  onDelete,
}: {
  post: BlogPost
  postUrl: string
  folderButtonRef: RefObject<HTMLButtonElement | null>
  isFolderMenuOpen: boolean
  onToggleFolderMenu: () => void
  onCloseFolderMenu: () => void
  folderMenuItems: MenuItem[]
  onCopyLink: () => void
  onOpenEdit: () => void
  onSync: () => void
  onDelete: () => void
}) {
  return (
    <div className='mt-3.5 flex items-center justify-between pt-2.5 border-t border-[var(--border-subtle)]'>
      <div className='flex items-center gap-3 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
        <span className='flex items-center gap-1'>
          <Eye size={12} /> {post.views}
        </span>
        <span className='flex items-center gap-1'>
          <MessageSquare size={12} /> {post.commentsCount ?? 0}
        </span>
      </div>

      <div className='flex items-center gap-1'>
        <IconButton
          ref={folderButtonRef}
          size='sm'
          label={t('blog.batch_move_folder')}
          onClick={onToggleFolderMenu}
        >
          <FolderInput size={13} />
        </IconButton>
        <Menu open={isFolderMenuOpen} anchor={folderButtonRef} items={folderMenuItems} onClose={onCloseFolderMenu} />

        <a
          href={postUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
          title={t('blog.view_in_blog')}
        >
          <ExternalLink size={13} />
        </a>

        <CardIconButton label={t('blog.copy_link')} onClick={onCopyLink}>
          <Copy size={13} />
        </CardIconButton>
        <CardIconButton label={t('blog.post_settings')} onClick={onOpenEdit}>
          <Settings2 size={13} />
        </CardIconButton>
        <CardIconButton label={t('blog.sync_post')} onClick={onSync}>
          <RefreshCw size={13} />
        </CardIconButton>
        <CardIconButton label={t('common.delete')} onClick={onDelete} danger>
          <Trash2 size={13} />
        </CardIconButton>
      </div>
    </div>
  )
}

function CardIconButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  danger?: boolean
  children: ReactNode
}) {
  return (
    <IconButton
      size='sm'
      label={label}
      onClick={onClick}
      className={danger ? 'text-[var(--danger)] hover:opacity-80' : ''}
    >
      {children}
    </IconButton>
  )
}