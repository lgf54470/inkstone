import { useMemo } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogPostSummary } from '@shared/types'
import { useBlogStore } from '../blog-store'
import { BlogGridCard } from './card'

export { PostCoverImage } from './cover-image'

export function BlogGridView({
  posts,
  onOpenEdit,
}: {
  posts: BlogPostSummary[]
  onOpenEdit: (post: BlogPostSummary) => void
}) {
  const categories = useBlogStore((s) => s.categories)
  const folders = useBlogStore((s) => s.folders)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const toggleSelectPost = useBlogStore((s) => s.toggleSelectPost)
  const settings = useBlogStore((s) => s.settings)

  const frontendBase = (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')
  // Rebuilt only when the lists change, not on every selection toggle and keystroke.
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--sp-4)] p-[var(--sp-4)] text-[length:var(--text-12\.5)]">
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
            onToggleSelect={toggleSelectPost}
            onOpenEdit={onOpenEdit}
          />
        )
      })}
    </div>
  )
}

