import {
  ExternalLink,
  Copy,
  Settings2,
  RefreshCw,
  Trash2,
  Pin,
  FolderClosed,
} from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'
import { PostCoverImage } from './BlogGridView'

export function BlogTableView({
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
  const selectAllPosts = useBlogStore((s) => s.selectAllPosts)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
  const updatePost = useBlogStore((s) => s.updatePost)
  const deletePost = useBlogStore((s) => s.deletePost)
  const syncPost = useBlogStore((s) => s.syncPost)
  const settings = useBlogStore((s) => s.settings)

  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')

  const isAllSelected =
    posts.length > 0 && posts.every((p) => selectedPostIds.has(p.id))

  const handleToggleAll = () => {
    if (isAllSelected) {
      clearPostSelection()
    } else {
      selectAllPosts(posts.map((p) => p.id))
    }
  }

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
      description: t('blog.confirm_delete_post_detail', { value0: post.title }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await deletePost(post.id)
    toast({ title: t('blog.post_deleted'), tone: 'default' })
  }

  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  return (
    <div className="w-full overflow-x-auto text-[12.5px]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[11px] font-medium text-[var(--text-tertiary)]">
            <th className="w-10 px-3 py-2.5 text-center">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={handleToggleAll}
                className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
              />
            </th>
            <th className="px-3 py-2.5 min-w-[200px]">{t('blog.col_title')}</th>
            <th className="px-3 py-2.5 w-[110px]">{t('blog.folders')}</th>
            <th className="px-3 py-2.5 w-[100px]">{t('blog.category')}</th>
            <th className="px-3 py-2.5 w-[130px]">{t('blog.tags')}</th>
            <th className="px-3 py-2.5 w-[85px]">{t('blog.col_status')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('share.metric_pv')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('blog.col_comments')}</th>
            <th className="px-3 py-2.5 w-[105px]">{t('blog.col_created_at')}</th>
            <th className="px-3 py-2.5 w-[140px] text-right">{t('blog.col_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {posts.map((post) => {
            const isSelected = selectedPostIds.has(post.id)
            const cat = post.categoryId ? categoryMap.get(post.categoryId) : null
            const folder = post.folderId ? folderMap.get(post.folderId) : null
            const postUrl = `${frontendBase}/posts/${post.slug}`

            return (
              <tr
                key={post.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/inkstone-blog-post-ids', JSON.stringify([post.id]))
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className={cn(
                  'transition-colors hover:bg-[var(--bg-hover)] cursor-grab active:cursor-grabbing',
                  isSelected && 'bg-[var(--accent-softer)]',
                )}
                title={t('blog.drag_to_folder_hint')}
              >
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectPost(post.id)}
                    className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
                  />
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="size-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
                      <PostCoverImage
                        src={post.coverUrl}
                        alt={post.title}
                        fallbackIconSize={14}
                        className="size-full object-cover"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {post.isPinned && (
                          <Pin size={11} className="text-[var(--accent)] shrink-0 fill-current" />
                        )}
                        <span className="truncate font-medium text-[var(--text-primary)]">
                          {post.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-quaternary)] truncate">
                        /{post.slug}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  {folder ? (
                    <span
                      className="inline-flex items-center gap-1 truncate max-w-[100px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: folder.color ? `${folder.color}15` : 'var(--bg-sunken)',
                        color: folder.color || 'var(--text-secondary)',
                      }}
                    >
                      <FolderClosed size={10} className="shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-quaternary)]">-</span>
                  )}
                </td>

                <td className="px-3 py-2.5">
                  {cat ? (
                    <span
                      className="inline-block truncate max-w-[95px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: cat.color ? `${cat.color}15` : 'var(--bg-sunken)',
                        color: cat.color || 'var(--text-secondary)',
                      }}
                    >
                      {cat.name}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--text-quaternary)]">-</span>
                  )}
                </td>

                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[130px]">
                    {post.tags.slice(0, 2).map((t) => (
                      <span
                        key={t}
                        className="rounded bg-[var(--bg-sunken)] px-1 py-0.2 text-[10px] text-[var(--text-tertiary)]"
                      >
                        #{t}
                      </span>
                    ))}
                    {post.tags.length > 2 && (
                      <span className="text-[10px] text-[var(--text-quaternary)]">
                        +{post.tags.length - 2}
                      </span>
                    )}
                  </div>
                </td>

                <td className="px-3 py-2.5">
                  {post.isPublished ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">
                      {t('blog.published')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-stone-500/10 px-2 py-0.5 text-[10.5px] font-medium text-stone-500">
                      {t('blog.draft')}
                    </span>
                  )}
                </td>

                <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
                  {post.views}
                </td>

                <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
                  {post.commentsCount ?? 0}
                </td>

                <td className="px-3 py-2.5 text-[11.5px] text-[var(--text-quaternary)] whitespace-nowrap">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </td>

                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => void updatePost(post.id, { isPinned: !post.isPinned })}
                      className={cn(
                        'p-1 transition-colors',
                        post.isPinned
                          ? 'text-[var(--accent)]'
                          : 'text-[var(--text-quaternary)] hover:text-[var(--accent)]',
                      )}
                      title={post.isPinned ? t('blog.unpin_post') : t('blog.pin_post')}
                    >
                      <Pin size={13} className={post.isPinned ? 'fill-current' : ''} />
                    </button>

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
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
