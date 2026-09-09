import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogPost } from '@shared/types'
import { Checkbox } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useBlogStore } from '../blog-store'
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

  const frontendBase = (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')
  const isAllSelected = posts.length > 0 && posts.every((p) => selectedPostIds.has(p.id))
  const categoryMap = new Map(categories.map((c) => [c.id, c]))
  const folderMap = new Map(folders.map((f) => [f.id, f]))

  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full border-collapse text-left'>
        <TableHeader
          isAllSelected={isAllSelected}
          onToggleAll={() => toggleAllSelected(isAllSelected, posts, clearPostSelection, selectAllPosts)}
        />
        <tbody className='divide-y divide-[var(--border-subtle)]'>
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

function toggleAllSelected(
  isAllSelected: boolean,
  posts: BlogPost[],
  clearPostSelection: () => void,
  selectAllPosts: (ids: string[]) => void,
): void {
  if (isAllSelected) {
    clearPostSelection()
  } else {
    selectAllPosts(posts.map((p) => p.id))
  }
}

function TableHeader({ isAllSelected, onToggleAll }: { isAllSelected: boolean; onToggleAll: () => void }) {
  return (
    <thead className='sticky top-0 z-[var(--z-sticky)] bg-[var(--bg-card)] shadow-[var(--shadow-xs)]'>
      <tr className='border-b border-[var(--border-subtle)] text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>
        <th className='w-10 px-3 py-2 text-center'>
          <Checkbox
            checked={isAllSelected}
            onChange={onToggleAll}
            aria-label={t('contextmenu.select_all')}
            className='min-h-0'
          />
        </th>
        <th className='px-3 py-2 min-w-40 whitespace-nowrap'>{t('blog.col_title')}</th>
        <th className='w-24 px-3 py-2 whitespace-nowrap'>{t('blog.folders')}</th>
        <th className='w-24 px-3 py-2 whitespace-nowrap'>{t('blog.category')}</th>
        <th className='w-28 px-3 py-2 whitespace-nowrap'>{t('blog.tags')}</th>
        <th className='w-20 px-3 py-2 text-center whitespace-nowrap'>{t('blog.col_status')}</th>
        <th className='w-20 px-3 py-2 text-right whitespace-nowrap'>{t('blog.col_views')}</th>
        <th className='w-16 px-3 py-2 text-right whitespace-nowrap'>{t('blog.col_comments')}</th>
        <th className='w-24 px-3 py-2 text-right whitespace-nowrap'>{t('blog.col_created_at')}</th>
        <th className='w-52 px-3 py-2 text-right whitespace-nowrap sticky right-0 z-[var(--z-sticky)] bg-[var(--bg-card)] border-l border-[var(--border-subtle)]'>
          {t('blog.col_actions')}
        </th>
      </tr>
    </thead>
  )
}