import { useState } from 'react'
import {
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
} from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { extractCoverUrl } from '@shared/markdown-utils'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
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
  const toast = useUi((s) => s.toast)
  const categories = useBlogStore((s) => s.categories)
  const folders = useBlogStore((s) => s.folders)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const toggleSelectPost = useBlogStore((s) => s.toggleSelectPost)
  const updatePost = useBlogStore((s) => s.updatePost)
  const deletePost = useBlogStore((s) => s.deletePost)
  const syncPost = useBlogStore((s) => s.syncPost)
  const settings = useBlogStore((s) => s.settings)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  const handleCopyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${frontendBase}/posts/${slug}`)
      toast({ title: t('blog.link_copied'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleSync = async (post: BlogPost) => {
    try {
      await syncPost(post.id)
      toast({ title: t('blog.sync_success'), tone: 'success' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  const handleDelete = async (post: BlogPost) => {
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 text-[12.5px]">
      {posts.map((post) => {
        const isSelected = selectedPostIds.has(post.id)
        const cat = post.categoryId ? categoryMap.get(post.categoryId) : null
        const folder = post.folderId ? folderMap.get(post.folderId) : null
        const postUrl = `${frontendBase}/posts/${post.slug}`

        return (
          <div
            key={post.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([post.id]))
              e.dataTransfer.effectAllowed = 'move'
            }}
            className={cn(
              'group relative flex flex-col rounded-[var(--r-xl)] border transition-all overflow-hidden cursor-grab active:cursor-grabbing',
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
                onChange={() => toggleSelectPost(post.id)}
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
                  <span className="rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10.5px] font-semibold text-white shadow-sm backdrop-blur">
                    {t('blog.published')}
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-600/80 px-2 py-0.5 text-[10.5px] font-medium text-white shadow-sm backdrop-blur">
                    {t('blog.draft')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                {folder && (
                  <span
                    className="flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.2 text-[10.5px] font-medium"
                    style={{
                      backgroundColor: folder.color ? `${folder.color}15` : 'var(--bg-sunken)',
                      color: folder.color || 'var(--text-secondary)',
                    }}
                  >
                    <FolderClosed size={10} />
                    <span className="truncate max-w-[90px]">{folder.name}</span>
                  </span>
                )}

                {cat && (
                  <span
                    className="rounded-[var(--r-sm)] px-1.5 py-0.2 text-[10.5px] font-medium"
                    style={{
                      backgroundColor: cat.color ? `${cat.color}15` : 'var(--bg-sunken)',
                      color: cat.color || 'var(--text-secondary)',
                    }}
                  >
                    {cat.name}
                  </span>
                )}

                <span className="text-[11px] text-[var(--text-quaternary)] ml-auto">
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
                  {post.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded bg-[var(--bg-sunken)] px-1.5 py-0.2 text-[10px] text-[var(--text-tertiary)]"
                    >
                      #{t}
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
                  <a
                    href={postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 text-[var(--text-quaternary)] hover:text-[var(--accent)]"
                    title={t('blog.view_in_blog')}
                  >
                    <ExternalLink size={13} />
                  </a>

                  <button
                    type="button"
                    onClick={() => void handleCopyLink(post.slug)}
                    className="p-1 text-[var(--text-quaternary)] hover:text-[var(--accent)]"
                    title={t('blog.copy_link')}
                  >
                    <Copy size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenEdit(post)}
                    className="p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                    title={t('blog.post_settings')}
                  >
                    <Settings2 size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSync(post)}
                    className="p-1 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
                    title={t('blog.sync_post')}
                  >
                    <RefreshCw size={13} />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDelete(post)}
                    className="p-1 text-[var(--danger)] hover:opacity-80"
                    title={t('common.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
