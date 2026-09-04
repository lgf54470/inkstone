import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  ExternalLink,
  Plus,
} from 'lucide-react'
import { t } from '../../lib/i18n'
import { useBlogStore, type BlogTab } from './blog-store'

export function BlogHubSidebar({
  onOpenCategoriesModal,
  onOpenSettingsModal,
}: {
  onOpenCategoriesModal: () => void
  onOpenSettingsModal: () => void
}) {
  const activeTab = useBlogStore((s) => s.activeTab)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)
  const categoryId = useBlogStore((s) => s.categoryId)
  const setCategoryId = useBlogStore((s) => s.setCategoryId)
  const categories = useBlogStore((s) => s.categories)
  const comments = useBlogStore((s) => s.comments)
  const posts = useBlogStore((s) => s.posts)
  const settings = useBlogStore((s) => s.settings)

  const pendingCommentsCount = comments.filter((c) => c.status === 'pending').length
  const frontendBase = (settings?.frontendUrl || 'http://localhost:4321').replace(/\/+$/, '')

  const handleTabClick = (tab: BlogTab) => {
    setActiveTab(tab)
    if (tab === 'posts') {
      setCategoryId(null)
    }
  }

  const handleCategoryClick = (catId: string | null) => {
    setActiveTab('posts')
    setCategoryId(catId)
  }

  return (
    <div className="flex w-[220px] shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3 text-[12.5px] select-none">
      {/* Navigation section */}
      <div className="space-y-1">
        {/* 1. Dashboard */}
        <button
          type="button"
          onClick={() => handleTabClick('dashboard')}
          className={`flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-1.5 font-medium text-left transition-colors ${
            activeTab === 'dashboard'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <LayoutDashboard size={15} />
          <span>{t('blog.dashboard')}</span>
        </button>

        {/* 2. Posts */}
        <button
          type="button"
          onClick={() => handleTabClick('posts')}
          className={`flex w-full items-center justify-between rounded-[var(--r-md)] px-2.5 py-1.5 font-medium text-left transition-colors ${
            activeTab === 'posts' && categoryId === null
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <FileText size={15} />
            <span>{t('blog.posts')}</span>
          </div>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10.5px] ${
              activeTab === 'posts' && categoryId === null
                ? 'bg-black/20 text-[var(--accent-contrast)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
            }`}
          >
            {posts.length}
          </span>
        </button>

        {/* 3. Comments Moderation with Badge */}
        <button
          type="button"
          onClick={() => handleTabClick('comments')}
          className={`flex w-full items-center justify-between rounded-[var(--r-md)] px-2.5 py-1.5 font-medium text-left transition-colors ${
            activeTab === 'comments'
              ? 'bg-[var(--accent)] text-[var(--accent-contrast)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare size={15} />
            <span>{t('blog.comments')}</span>
          </div>

          {pendingCommentsCount > 0 ? (
            <span className="rounded-full bg-[var(--danger)] px-1.5 py-0.2 text-[10.5px] font-bold text-white shadow-sm animate-pulse">
              {pendingCommentsCount}
            </span>
          ) : (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10.5px] ${
                activeTab === 'comments'
                  ? 'bg-black/20 text-[var(--accent-contrast)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-tertiary)]'
              }`}
            >
              {comments.length}
            </span>
          )}
        </button>
      </div>

      <div className="my-3 h-px bg-[var(--border-subtle)]" />

      {/* Categories section */}
      <div className="flex-1 overflow-y-auto space-y-1">
        <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-wider text-[var(--text-quaternary)] uppercase">
          <span>{t('blog.categories')}</span>
          <button
            type="button"
            onClick={onOpenCategoriesModal}
            className="text-[var(--text-tertiary)] hover:text-[var(--accent)]"
            title={t('blog.add_category')}
          >
            <Plus size={13} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleCategoryClick(null)}
          className={`flex w-full items-center justify-between rounded-[var(--r-md)] px-2.5 py-1 text-left transition-colors ${
            activeTab === 'posts' && categoryId === null
              ? 'text-[var(--accent)] font-semibold'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <span>{t('blog.all_categories')}</span>
          <span className="text-[10.5px] text-[var(--text-quaternary)]">{posts.length}</span>
        </button>

        {categories.map((cat) => {
          const isSelected = activeTab === 'posts' && categoryId === cat.id
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id)}
              className={`flex w-full items-center justify-between rounded-[var(--r-md)] px-2.5 py-1 text-left transition-colors ${
                isSelected
                  ? 'text-[var(--accent)] font-semibold bg-[var(--accent-soft)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color || 'var(--accent)' }}
                />
                <span className="truncate">{cat.name}</span>
              </div>
              <span className="text-[10.5px] text-[var(--text-quaternary)]">
                {cat.postsCount ?? 0}
              </span>
            </button>
          )
        })}
      </div>

      <div className="my-3 h-px bg-[var(--border-subtle)]" />

      {/* Bottom controls */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={onOpenSettingsModal}
          className="flex w-full items-center gap-2.5 rounded-[var(--r-md)] px-2.5 py-1.5 text-left text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Settings size={15} className="text-[var(--text-tertiary)]" />
          <span>{t('blog.settings')}</span>
        </button>

        <a
          href={frontendBase}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-between rounded-[var(--r-md)] px-2.5 py-1.5 text-left text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <ExternalLink size={14} />
            <span>{t('blog.frontend_site')}</span>
          </span>
          <span className="text-[10px] opacity-70">{t('blog.frontend_engine')}</span>
        </a>
      </div>
    </div>
  )
}
