import type { BlogPost } from '@shared/types'
import { useBlogStore } from '../blog-store'
import { BlogGridCard } from './card'

export { PostCoverImage } from './cover-image'

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 text-[length:var(--text-12\.5)]">
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

