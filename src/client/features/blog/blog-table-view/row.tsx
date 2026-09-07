import type { ReactNode } from 'react'
import { Copy, ExternalLink, FolderClosed, FolderInput, Pin, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import type { BlogCategory, BlogFolder, BlogPost } from '@shared/types'
import { IconButton } from '../../../components/primitives'
import { Menu } from '../../../components/overlay'
import { cn } from '../../../lib/cn'
import { t } from '../../../lib/i18n'
import { useBlogPostCard } from '../blog-grid-view/use-blog-post-card'
import { PostCoverImage } from '../blog-grid-view'

export function BlogTableRow({
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
  const row = useBlogPostCard({
    post,
    folders,
    frontendBase,
    onOpenEdit,
    deleteConfirmKey: 'blog.confirm_delete_post_detail',
  })

  return (
    <tr
      draggable
      onDragStart={(e) => startRowDrag(e, post.id)}
      onContextMenu={(e) => {
        row.setIsFolderMenuOpen(false)
        row.contextMenu.onContextMenu(e)
      }}
      onDoubleClick={() => onOpenEdit(post)}
      className={cn(
        'group transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing select-none',
        isSelected && 'bg-[var(--accent-softer)]',
      )}
      title={t('blog.drag_to_folder_hint')}
    >
      <td className='px-3 py-2.5 text-center'>
        <input
          type='checkbox'
          checked={isSelected}
          onChange={onToggleSelect}
          className='rounded border-[var(--border-default)] accent-[var(--accent)] cursor-pointer'
        />
      </td>
      <TableRowTitleCell post={post} />
      <td className='px-3 py-2.5 whitespace-nowrap'><ColoredBadge name={folder?.name} color={folder?.color} /></td>
      <td className='px-3 py-2.5 whitespace-nowrap'><ColoredBadge name={cat?.name} color={cat?.color} /></td>
      <TableRowTagsCell post={post} />
      <TableRowStatusCell post={post} />
      <td className='px-3 py-2.5 text-right font-mono text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] whitespace-nowrap'>{post.views}</td>
      <td className='px-3 py-2.5 text-right font-mono text-[length:var(--text-12)] font-medium text-[var(--text-secondary)] whitespace-nowrap'>{post.commentsCount ?? 0}</td>
      <td className='px-3 py-2.5 text-right text-[length:var(--text-11)] text-[var(--text-quaternary)] whitespace-nowrap'>{new Date(post.publishedAt).toLocaleDateString()}</td>
      <TableRowActionsCell row={row} post={post} isSelected={isSelected} onOpenEdit={onOpenEdit} />
    </tr>
  )
}

function startRowDrag(e: React.DragEvent, postId: string): void {
  e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([postId]))
  e.dataTransfer.effectAllowed = 'move'
}

function TableRowTitleCell({ post }: { post: BlogPost }) {
  return (
    <td className='px-3 py-2.5'>
      <div className='flex items-center gap-2.5 min-w-0'>
        <div className='size-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]'>
          <PostCoverImage
            src={post.coverUrl}
            alt={post.title}
            fallbackIconSize={14}
            className='size-full object-cover'
          />
        </div>

        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-1.5'>
            {post.isPinned && (
              <Pin size={11} className='text-[var(--accent)] shrink-0 fill-current' />
            )}
            <span className='truncate text-[length:var(--text-13)] font-medium text-[var(--text-primary)]'>
              {post.title}
            </span>
          </div>
          <div className='text-[length:var(--text-11)] text-[var(--text-quaternary)] truncate'>
            /{post.slug}
          </div>
        </div>
      </div>
    </td>
  )
}

function ColoredBadge({ name, color }: { name?: string; color?: string | null }) {
  if (!name) return <span className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>-</span>
  return (
    <span
      className='inline-flex items-center gap-1 truncate max-w-[80px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[length:var(--text-11)] font-medium'
      style={{
        backgroundColor: color ? `${color}15` : 'var(--bg-sunken)',
        color: color || 'var(--text-secondary)',
      }}
    >
      <FolderClosed size={10} className='shrink-0' />
      <span className='truncate'>{name}</span>
    </span>
  )
}

function TableRowTagsCell({ post }: { post: BlogPost }) {
  return (
    <td className='px-3 py-2.5 whitespace-nowrap'>
      <div className='flex flex-wrap gap-1 max-w-[110px]'>
        {post.tags.slice(0, 2).map((tg) => (
          <span
            key={tg}
            className='rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-[length:var(--text-10)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] truncate max-w-[70px]'
            title={tg}
          >
            #{tg.includes('/') ? tg.split('/').pop() : tg}
          </span>
        ))}
        {post.tags.length > 2 && (
          <span className='text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
            +{post.tags.length - 2}
          </span>
        )}
      </div>
    </td>
  )
}

function TableRowStatusCell({ post }: { post: BlogPost }) {
  return (
    <td className='px-3 py-2.5 text-center whitespace-nowrap'>
      {post.isPublished ? (
        <span className="inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--success)] whitespace-nowrap shrink-0">
          {t('blog.published')}
        </span>
      ) : (
        <span className="inline-flex items-center rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[length:var(--text-10\.5)] font-medium text-[var(--text-tertiary)] whitespace-nowrap shrink-0">
          {t('blog.draft')}
        </span>
      )}
    </td>
  )
}

function TableRowActionsCell({
  row,
  post,
  isSelected,
  onOpenEdit,
}: {
  row: ReturnType<typeof useBlogPostCard>
  post: BlogPost
  isSelected: boolean
  onOpenEdit: (post: BlogPost) => void
}) {
  return (
    <td
      className={cn(
        'sticky right-0 z-[var(--z-raised)] px-3 py-2.5 text-right whitespace-nowrap border-l border-[var(--border-subtle)]',
        'bg-[var(--bg-base)] group-hover:bg-[var(--bg-hover)] transition-colors',
        isSelected && 'bg-[var(--accent-softer)]',
      )}
    >
      <ActionButtonsGroup row={row} post={post} onOpenEdit={onOpenEdit} />
      <Menu open={row.isFolderMenuOpen} anchor={row.folderButtonRef} items={row.folderMenuItems} onClose={() => row.setIsFolderMenuOpen(false)} />
      {row.contextMenu.point && <Menu open anchor={row.contextMenu.point} items={row.contextMenuItems} onClose={row.contextMenu.close} />}
    </td>
  )
}

function ActionButtonsGroup({
  row,
  post,
  onOpenEdit,
}: {
  row: ReturnType<typeof useBlogPostCard>
  post: BlogPost
  onOpenEdit: (post: BlogPost) => void
}) {
  return (
    <div className='flex items-center justify-end gap-1'>
      <IconButton
        ref={row.folderButtonRef}
        size='sm'
        label={t('blog.batch_move_folder')}
        onClick={() => row.setIsFolderMenuOpen((prev) => !prev)}
      >
        <FolderInput size={13} />
      </IconButton>

      <IconButton
        size='sm'
        label={post.isPinned ? t('blog.unpin_post') : t('blog.pin_post')}
        onClick={() => void row.updatePost(post.id, { isPinned: !post.isPinned })}
        className={cn(post.isPinned ? 'text-[var(--accent)]' : 'text-[var(--text-quaternary)] hover:text-[var(--accent)]')}
      >
        <Pin size={13} className={post.isPinned ? 'fill-current' : ''} />
      </IconButton>

      <a
        href={row.postUrl}
        target='_blank'
        rel='noopener noreferrer'
        className='inline-flex size-6 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]'
        title={t('blog.view_in_blog')}
      >
        <ExternalLink size={13} />
      </a>

      <RowActionButton label={t('blog.copy_link')} onClick={() => void row.handleCopyLink(post.slug)}>
        <Copy size={13} />
      </RowActionButton>
      <RowActionButton label={t('blog.post_settings')} onClick={() => onOpenEdit(post)}>
        <Settings2 size={13} />
      </RowActionButton>
      <RowActionButton label={t('blog.sync_post')} onClick={() => void row.handleSync()}>
        <RefreshCw size={13} />
      </RowActionButton>
      <RowActionButton label={t('common.delete')} onClick={() => void row.handleDelete()} danger>
        <Trash2 size={13} />
      </RowActionButton>
    </div>
  )
}

function RowActionButton({
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