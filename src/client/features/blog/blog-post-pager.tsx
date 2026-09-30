import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'

/**
 * The list holds one page of the account's posts; when there are more, this is how the reader reaches
 * them. It reads and writes the store directly because the page is part of the query, not of a view's
 * local state, and the store clamps it to the pages that exist.
 */
export function BlogPostPager() {
  const page = useBlogStore((s) => s.postsPage)
  const total = useBlogStore((s) => s.postsTotal)
  const totalPages = useBlogStore((s) => s.postsTotalPages)
  const setPostsPage = useBlogStore((s) => s.setPostsPage)

  if (totalPages <= 1) return null

  return (
    <div className='flex shrink-0 items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
      <span>{t('blog.posts_page_info', { page, totalPages, total })}</span>
      <div className='flex items-center gap-1'>
        <Button
          size='sm'
          variant='secondary'
          disabled={page <= 1}
          onClick={() => setPostsPage(page - 1)}
          icon={<ChevronLeft size={13} />}
        >
          {t('blog.posts_prev_page')}
        </Button>
        <Button
          size='sm'
          variant='secondary'
          disabled={page >= totalPages}
          onClick={() => setPostsPage(page + 1)}
          trailing={<ChevronRight size={13} />}
        >
          {t('blog.posts_next_page')}
        </Button>
      </div>
    </div>
  )
}
