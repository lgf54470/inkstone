import { Search, LayoutGrid, LayoutList, Settings, Plus, RefreshCw, FolderClosed, Hash, X } from 'lucide-react'
import { IconButton, Button } from '../../components/primitives'
import { Input } from '../../components/form'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'
import { BlogTrafficFilterPopover } from './BlogTrafficFilterPopover'

export function BlogHubToolbar({
  onOpenSettings,
  onOpenNewPost,
}: {
  onOpenSettings: () => void
  onOpenNewPost: () => void
}) {
  const search = useBlogStore((s) => s.search)
  const setSearch = useBlogStore((s) => s.setSearch)
  const statusFilter = useBlogStore((s) => s.statusFilter)
  const setStatusFilter = useBlogStore((s) => s.setStatusFilter)
  const folderId = useBlogStore((s) => s.folderId)
  const setFolderId = useBlogStore((s) => s.setFolderId)
  const tag = useBlogStore((s) => s.tag)
  const setTag = useBlogStore((s) => s.setTag)
  const folders = useBlogStore((s) => s.folders)
  const viewMode = useBlogStore((s) => s.viewMode)
  const setViewMode = useBlogStore((s) => s.setViewMode)
  const loadAll = useBlogStore((s) => s.loadAll)
  const loading = useBlogStore((s) => s.loading)

  const currentFolder = folders.find((f) => f.id === folderId)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[12.5px]">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center rounded-[var(--r-md)] bg-[var(--bg-base)] p-0.5 border border-[var(--border-default)]">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`rounded-[var(--r-sm)] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('blog.status_all')}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('published')}
            className={`rounded-[var(--r-sm)] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              statusFilter === 'published'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('blog.published')}
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`rounded-[var(--r-sm)] px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
              statusFilter === 'draft'
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t('blog.draft')}
          </button>
        </div>

        {currentFolder && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] px-2.5 py-1 text-[11px] font-medium">
            <FolderClosed size={11} />
            <span>{currentFolder.name}</span>
            <button
              type="button"
              onClick={() => setFolderId(null)}
              className="ml-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
            >
              <X size={11} />
            </button>
          </span>
        )}

        {tag && (
          <span className="flex items-center gap-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] px-2.5 py-1 text-[11px] font-medium">
            <Hash size={11} />
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => setTag(null)}
              className="ml-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
            >
              <X size={11} />
            </button>
          </span>
        )}

        <div className="relative w-[180px] md:w-[220px]">
          <Input
            leading={<Search size={13} className="text-[var(--text-quaternary)]" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('blog.search_posts_placeholder')}
            className="h-8 text-[12px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onOpenNewPost}>
          <Plus size={12} className="mr-1" />
          {t('blog.new_post')}
        </Button>

        <div className="h-4 w-px bg-[var(--border-subtle)]" />

        <BlogTrafficFilterPopover />

        <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] p-0.5 bg-[var(--bg-base)]">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            title={t('blog.view_table')}
            className={`flex size-6 items-center justify-center rounded-[var(--r-sm)] transition-colors ${
              viewMode === 'table'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutList size={13} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            title={t('blog.view_grid')}
            className={`flex size-6 items-center justify-center rounded-[var(--r-sm)] transition-colors ${
              viewMode === 'grid'
                ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <LayoutGrid size={13} />
          </button>
        </div>

        <IconButton
          label={t('common.refresh')}
          size="sm"
          disabled={loading}
          onClick={() => void loadAll()}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </IconButton>

        <IconButton label={t('blog.settings')} size="sm" onClick={onOpenSettings}>
          <Settings size={14} />
        </IconButton>
      </div>
    </div>
  )
}
