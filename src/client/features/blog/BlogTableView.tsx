import {
  ExternalLink,
  Copy,
  Settings2,
  RefreshCw,
  Trash2,
  Image as ImageIcon,
  Pin,
} from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'

export function BlogTableView({
  posts,
  onOpenEdit,
}: {
  posts: BlogPost[]
  onOpenEdit: (post: BlogPost) => void
}) {
  const toast = useUi((s) => s.toast)
  const categories = useBlogStore((s) => s.categories)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const toggleSelectPost = useBlogStore((s) => s.toggleSelectPost)
  const selectAllPosts = useBlogStore((s) => s.selectAllPosts)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
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
            <th className="px-3 py-2.5 min-w-[220px]">{t('blog.col_title')}</th>
            <th className="px-3 py-2.5 w-[110px]">{t('blog.category')}</th>
            <th className="px-3 py-2.5 w-[140px]">{t('blog.tags')}</th>
            <th className="px-3 py-2.5 w-[85px]">{t('blog.col_status')}</th>
            <th className="px-3 py-2.5 w-[70px] text-right">{t('share.metric_pv')}</th>
            <th className="px-3 py-2.5 w-[70px] text-right">{t('blog.col_comments')}</th>
            <th className="px-3 py-2.5 w-[110px]">{t('blog.col_created_at')}</th>
            <th className="px-3 py-2.5 w-[130px] text-right">{t('blog.col_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {posts.map((post) => {
            const isSelected = selectedPostIds.has(post.id)
            const cat = post.categoryId ? categoryMap.get(post.categoryId) : null
            const postUrl = `${frontendBase}/posts/${post.slug}`

            return (
              <tr
                key={post.id}
                className={`transition-colors hover:bg-[var(--bg-hover)] ${
                  isSelected ? 'bg-[var(--accent-softer)]' : ''
                }`}
              >
                {/* Checkbox */}
                <td className="px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectPost(post.id)}
                    className="size-3.5 rounded accent-[var(--accent)] cursor-pointer"
                  />
                </td>

                {/* Title & Cover & Slug */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {post.coverUrl ? (
                      <div className="size-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)]">
                        {post.coverUrl.startsWith('http') || post.coverUrl.startsWith('/api') ? (
                          <img
                            src={post.coverUrl}
                            alt={post.title}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-[var(--text-tertiary)]">
                            <ImageIcon size={14} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-sunken)] text-[var(--text-quaternary)] border border-[var(--border-subtle)]">
                        <ImageIcon size={14} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {post.isPinned && (
                          <Pin size={11} className="text-[var(--accent)] shrink-0" />
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

                {/* Category */}
                <td className="px-3 py-2.5">
                  {cat ? (
                    <span
                      className="inline-block truncate max-w-[100px] rounded-[var(--r-sm)] px-1.5 py-0.5 text-[11px] font-medium"
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

                {/* Tags */}
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1 max-w-[140px]">
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

                {/* Status */}
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

                {/* Views */}
                <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
                  {post.views}
                </td>

                {/* Comments */}
                <td className="px-3 py-2.5 text-right font-medium text-[var(--text-secondary)]">
                  {post.commentsCount ?? 0}
                </td>

                {/* Published Date */}
                <td className="px-3 py-2.5 text-[11.5px] text-[var(--text-quaternary)] whitespace-nowrap">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </td>

                {/* Action buttons */}
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
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
