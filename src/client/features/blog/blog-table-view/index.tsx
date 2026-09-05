import type { BlogPost } from '@shared/types'
import { useBlogStore } from '../blog-store'
import { t } from '../../../lib/i18n'
import { BlogTableRow } from './row'

export function BlogTableView({
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
  const selectAllPosts = useBlogStore((s) => s.selectAllPosts)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
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

  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  return (
    <div className="w-full overflow-x-auto text-[length:var(--text-12\.5)]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[length:var(--text-11)] font-medium text-[var(--text-tertiary)]">
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
            <th className="px-3 py-2.5 w-[85px] min-w-[76px] whitespace-nowrap">{t('blog.col_status')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('share.metric_pv')}</th>
            <th className="px-3 py-2.5 w-[65px] text-right">{t('blog.col_comments')}</th>
            <th className="px-3 py-2.5 w-[105px] whitespace-nowrap">{t('blog.col_created_at')}</th>
            <th className="px-3 py-2.5 w-[170px] text-right whitespace-nowrap">{t('blog.col_actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {posts.map((post) => {
            const isSelected = selectedPostIds.has(post.id)
            const cat = post.categoryId ? categoryMap.get(post.categoryId) ?? null : null
            const folder = post.folderId ? folderMap.get(post.folderId) ?? null : null

            return (
              <BlogTableRow
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
        </tbody>
      </table>
    </div>
  )
}

