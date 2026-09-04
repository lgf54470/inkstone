import { useRef, useState } from 'react'
import {
  BarChart2,
  Check,
  ExternalLink,
  Copy,
  Settings2,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Eye,
  MessageSquare,
  Pin,
  FolderClosed,
  FolderInput,
  PauseCircle,
  PlayCircle,
} from 'lucide-react'
import type { BlogPost, BlogCategory, BlogFolder } from '@shared/types'
import { extractCoverUrl } from '@shared/markdown-utils'
import { IconButton } from '../../components/primitives'
import { Menu, confirm, useContextMenu, type MenuItem } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useBlogStore } from './blog-store'

export function PostCoverImage({
  src,
  alt,
  className = 'size-full object-cover transition-transform duration-300 group-hover:scale-105',
  fallbackIconSize = 28,
}: {
  src?: string
  alt: string
  className?: string
  fallbackIconSize?: number
}) {
  const [error, setError] = useState(false)
  const clean = src ? extractCoverUrl(src) : ''
  const isValid = Boolean(
    clean &&
      (clean.startsWith('http://') ||
        clean.startsWith('https://') ||
        clean.startsWith('/') ||
        clean.startsWith('data:image/')),
  )

  if (!isValid || error) {
    return (
      <div className="flex size-full items-center justify-center text-[var(--text-quaternary)]">
        <ImageIcon size={fallbackIconSize} className="opacity-40" />
      </div>
    )
  }

  return (
    <img
      src={clean}
      alt={alt}
      onError={() => setError(true)}
      className={className}
    />
  )
}

export function BlogGridView({
  posts,
  onOpenEdit,
}: {
  posts: BlogPost[]
  onOpenEdit: (post: BlogPost) => void
}) {
  const categories = useBlogStore((s) => s.categories)
  const folders = useBlogStore((s) => s.folders)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const toggleSelectPost = useBlogStore((s) => s.toggleSelectPost)
  const settings = useBlogStore((s) => s.settings)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 text-[12.5px]">
      {posts.map((post) => {
        const isSelected = selectedPostIds.has(post.id)
        const cat = post.categoryId ? categoryMap.get(post.categoryId) ?? null : null
        const folder = post.folderId ? folderMap.get(post.folderId) ?? null : null

        return (
          <BlogGridCard
            key={post.id}
            post={post}
            isSelected={isSelected}
            cat={cat}
            folder={folder}
            folders={folders}
            frontendBase={frontendBase}
            onToggleSelect={() => toggleSelectPost(post.id)}
            onOpenEdit={onOpenEdit}
          />
        )
      })}
    </div>
  )
}

function BlogGridCard({
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
  const toast = useUi((s) => s.toast)
  const updatePost = useBlogStore((s) => s.updatePost)
  const deletePost = useBlogStore((s) => s.deletePost)
  const syncPost = useBlogStore((s) => s.syncPost)
  const batchMoveToFolder = useBlogStore((s) => s.batchMoveToFolder)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)

  const contextMenu = useContextMenu()
  const [folderMenuOpen, setFolderMenuOpen] = useState(false)
  const folderButtonRef = useRef<HTMLButtonElement>(null)

  const postUrl = `${frontendBase}/posts/${post.slug}`

  const handleCopyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${frontendBase}/posts/${slug}`)
      toast({ title: t('blog.link_copied'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleSync = async () => {
    try {
      await syncPost(post.id)
      toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      description: t('blog.confirm_delete_post', { value0: post.title }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deletePost(post.id)
    toast({ title: t('blog.post_deleted'), tone: 'default' })
  }

  const handleMoveToFolder = async (folderId: string | null) => {
    const ok = await batchMoveToFolder([post.id], folderId)
    if (ok) {
      toast({
        title: t('blog.batch_move_folder_success', { count: 1 }),
        tone: 'success',
      })
    }
  }

  const folderMenuItems: MenuItem[] = [
    {
      id: 'none',
      label: t('blog.no_folder'),
      icon: <FolderClosed size={13} className="text-[var(--text-quaternary)]" />,
      checked: !post.folderId,
      onSelect: () => void handleMoveToFolder(null),
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className="shrink-0">
          <FolderClosed size={13} />
        </span>
      ),
      checked: post.folderId === f.id,
      onSelect: () => void handleMoveToFolder(f.id),
    })),
  ]

  const contextMenuItems: MenuItem[] = [
    {
      id: 'open_link',
      label: t('preview.open_in_new_tab'),
      icon: <ExternalLink size={13} />,
      onSelect: () => window.open(postUrl, '_blank'),
    },
    {
      id: 'copy_link',
      label: t('blog.copy_link'),
      icon: <Copy size={13} />,
      onSelect: () => void handleCopyLink(post.slug),
    },
    {
      id: 'analytics',
      label: t('share.view_note_analytics'),
      icon: <BarChart2 size={13} />,
      onSelect: () => setActiveTab('dashboard'),
    },
    {
      id: 'settings',
      label: t('blog.post_settings'),
      icon: <Settings2 size={13} />,
      onSelect: () => onOpenEdit(post),
    },
    {
      id: 'move',
      label: t('blog.batch_move_folder'),
      icon: <FolderInput size={13} />,
      separatorBefore: true,
      submenu: ({ closeMenu }) => (
        <div className="py-1 min-w-[160px]">
          <button
            type="button"
            onClick={() => {
              closeMenu()
              void handleMoveToFolder(null)
            }}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
              !post.folderId && 'text-[var(--accent)] font-semibold',
            )}
          >
            <FolderClosed size={13} className="text-[var(--text-quaternary)]" />
            <span className="flex-1 truncate">{t('blog.no_folder')}</span>
            {!post.folderId && <Check size={12} className="text-[var(--accent)]" />}
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                closeMenu()
                void handleMoveToFolder(f.id)
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--bg-hover)] text-[var(--text-primary)]',
                post.folderId === f.id && 'text-[var(--accent)] font-semibold',
              )}
            >
              <FolderClosed size={13} style={{ color: f.color ?? undefined }} className="shrink-0" />
              <span className="flex-1 truncate">{f.name}</span>
              {post.folderId === f.id && <Check size={12} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      ),
    },
    {
      id: 'toggle',
      label: post.isPublished ? t('blog.unpublish') : t('blog.publish'),
      icon: post.isPublished ? (
        <PauseCircle size={13} className="text-[var(--warning)]" />
      ) : (
        <PlayCircle size={13} className="text-[var(--success)]" />
      ),
      onSelect: () => void updatePost(post.id, { isPublished: !post.isPublished }),
    },
    {
      id: 'pin',
      label: post.isPinned ? t('blog.unpin_post') : t('blog.pin_post'),
      icon: <Pin size={13} className={post.isPinned ? 'text-[var(--accent)] fill-current' : ''} />,
      onSelect: () => void updatePost(post.id, { isPinned: !post.isPinned }),
    },
    {
      id: 'delete',
      label: t('common.delete'),
      icon: <Trash2 size={13} />,
      tone: 'danger',
      separatorBefore: true,
      onSelect: () => void handleDelete(),
    },
  ]

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([post.id]))
        e.dataTransfer.effectAllowed = 'move'
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setFolderMenuOpen(false)
        contextMenu.onContextMenu(e)
      }}
      onDoubleClick={() => onOpenEdit(post)}
      className={cn(
        'group relative flex flex-col rounded-[var(--r-xl)] border transition-all overflow-hidden cursor-grab active:cursor-grabbing select-none',
        isSelected
          ? 'border-[var(--accent)] bg-[var(--accent-softer)] shadow-sm'
          : 'border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:shadow-sm',
      )}
      title={t('blog.drag_to_folder_hint')}
    >
      <div className="absolute top-2.5 left-2.5 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="size-4 rounded accent-[var(--accent)] cursor-pointer drop-shadow-sm"
        />
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          void updatePost(post.id, { isPinned: !post.isPinned })
        }}
        className={cn(
          'absolute top-2.5 right-2.5 z-10 flex size-6 items-center justify-center rounded-full shadow-sm backdrop-blur transition-all',
          post.isPinned
            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
            : 'bg-[var(--bg-overlay)]/90 text-[var(--text-quaternary)] opacity-0 group-hover:opacity-100 hover:text-[var(--accent)]',
        )}
        title={post.isPinned ? t('blog.unpin_post') : t('blog.pin_post')}
      >
        <Pin size={12} className={post.isPinned ? 'fill-current' : ''} />
      </button>

      <div className="relative h-36 w-full bg-[var(--bg-sunken)] overflow-hidden">
        <PostCoverImage src={post.coverUrl} alt={post.title} />

        <div className="absolute bottom-2 left-2">
          {post.isPublished ? (
            <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm backdrop-blur whitespace-nowrap">
              {t('blog.published')}
            </span>
          ) : (
            <span className="rounded-full bg-stone-600/80 px-2 py-0.5 text-[10.5px] font-medium text-white shadow-sm backdrop-blur whitespace-nowrap">
              {t('blog.draft')}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          {folder && (
            <span
              className="flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.2 text-[10.5px] font-medium truncate"
              style={{
                backgroundColor: folder.color ? `${folder.color}15` : 'var(--bg-sunken)',
                color: folder.color || 'var(--text-secondary)',
              }}
            >
              <FolderClosed size={10} className="shrink-0" />
              <span className="truncate max-w-[90px]">{folder.name}</span>
            </span>
          )}

          {cat && (
            <span
              className="rounded-[var(--r-sm)] px-1.5 py-0.2 text-[10.5px] font-medium truncate max-w-[90px]"
              style={{
                backgroundColor: cat.color ? `${cat.color}15` : 'var(--bg-sunken)',
                color: cat.color || 'var(--text-secondary)',
              }}
            >
              {cat.name}
            </span>
          )}

          <span className="text-[11px] text-[var(--text-quaternary)] ml-auto whitespace-nowrap">
            {new Date(post.publishedAt).toLocaleDateString()}
          </span>
        </div>

        <h3 className="font-semibold text-[14px] text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent)] transition-colors">
          {post.title}
        </h3>

        <p className="mt-1 text-[12px] text-[var(--text-tertiary)] line-clamp-2 leading-relaxed flex-1">
          {post.excerpt || t('blog.no_excerpt')}
        </p>

        {post.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {post.tags.slice(0, 3).map((tg) => (
              <span
                key={tg}
                className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-[10px] text-[var(--text-tertiary)] truncate max-w-[90px]"
                title={tg}
              >
                #{tg.includes('/') ? tg.split('/').pop() : tg}
              </span>
            ))}
            {post.tags.length > 3 && (
              <span className="text-[10px] text-[var(--text-quaternary)]">
                +{post.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 text-[11px] text-[var(--text-quaternary)]">
            <span className="flex items-center gap-1">
              <Eye size={12} /> {post.views}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare size={12} /> {post.commentsCount ?? 0}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <IconButton
              ref={folderButtonRef}
              size="sm"
              label={t('blog.batch_move_folder')}
              onClick={() => setFolderMenuOpen((prev) => !prev)}
            >
              <FolderInput size={13} />
            </IconButton>

            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-quaternary)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
              title={t('blog.view_in_blog')}
            >
              <ExternalLink size={13} />
            </a>

            <IconButton
              size="sm"
              label={t('blog.copy_link')}
              onClick={() => void handleCopyLink(post.slug)}
            >
              <Copy size={13} />
            </IconButton>

            <IconButton
              size="sm"
              label={t('blog.post_settings')}
              onClick={() => onOpenEdit(post)}
            >
              <Settings2 size={13} />
            </IconButton>

            <IconButton
              size="sm"
              label={t('blog.sync_post')}
              onClick={() => void handleSync()}
            >
              <RefreshCw size={13} />
            </IconButton>

            <IconButton
              size="sm"
              label={t('common.delete')}
              onClick={() => void handleDelete()}
              className="text-[var(--danger)] hover:opacity-80"
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
        </div>
      </div>

      <Menu
        open={folderMenuOpen}
        anchor={folderButtonRef}
        items={folderMenuItems}
        onClose={() => setFolderMenuOpen(false)}
      />

      {contextMenu.point && (
        <Menu
          open
          anchor={contextMenu.point}
          items={contextMenuItems}
          onClose={contextMenu.close}
        />
      )}
    </div>
  )
}
