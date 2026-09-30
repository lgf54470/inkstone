import { useEffect, useState, type ReactNode } from 'react'
import { Search, LayoutGrid, LayoutList, Settings, Plus, RefreshCw, FolderClosed, Hash, X } from 'lucide-react'
import { IconButton, Button } from '../../components/primitives'
import { Input, Segmented, Select } from '../../components/form'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'
import { BlogTrafficFilterPopover } from './blog-traffic-filter-popover'

// `pinned` is set from the sidebar and has no tab here, but it is part of the value's type: with it
// in the union the radiogroup simply has no checked option while that filter is on.
type StatusValue = 'all' | 'published' | 'draft' | 'pinned'

function StatusFilterTabs() {
  const statusFilter = useBlogStore((s) => s.statusFilter)
  const setStatusFilter = useBlogStore((s) => s.setStatusFilter)
  return (
    <Segmented<StatusValue>
      label={t('blog.status_filter_label')}
      value={statusFilter}
      onChange={setStatusFilter}
      options={[
        { value: 'all', label: t('blog.status_all') },
        { value: 'published', label: t('blog.published') },
        { value: 'draft', label: t('blog.draft') },
      ]}
    />
  )
}

function FilterChip({ icon, label, onClear }: { icon: ReactNode; label: string; onClear: () => void }) {
  return (
    <span className='flex items-center gap-1 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] px-2.5 py-1 text-[length:var(--text-11)] font-medium'>
      {icon}
      <span>{label}</span>
      <button
        type='button'
        aria-label={t('common.remove_value0', { value0: label })}
        onClick={onClear}
        className='ml-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]'
      >
        <X size={11} />
      </button>
    </span>
  )
}

function ActiveFilterChips() {
  const folderId = useBlogStore((s) => s.folderId)
  const folders = useBlogStore((s) => s.folders)
  const tag = useBlogStore((s) => s.tag)
  const setFolderId = useBlogStore((s) => s.setFolderId)
  const setTag = useBlogStore((s) => s.setTag)
  const currentFolder = folders.find((f) => f.id === folderId)
  return (
    <>
      {currentFolder && (
        <FilterChip icon={<FolderClosed size={11} />} label={currentFolder.name} onClear={() => setFolderId(null)} />
      )}
      {tag && <FilterChip icon={<Hash size={11} />} label={tag} onClear={() => setTag(null)} />}
    </>
  )
}

/**
 * The search box types instantly and asks once. It used to call the store on every keystroke, so
 * thirteen characters were thirteen full list requests, each one started before the last had
 * answered. The value shown is this component's own, so typing never waits for a round trip.
 */
const SEARCH_DEBOUNCE_MS = 250

function SearchBox() {
  const search = useBlogStore((s) => s.search)
  const setSearch = useBlogStore((s) => s.setSearch)
  const [draft, setDraft] = useState(search)

  useEffect(() => {
    if (draft === search) return
    const timer = setTimeout(() => setSearch(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, search, setSearch])

  return (
    <div className='relative w-45 md:w-55'>
      <Input
        leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t('blog.search_posts_placeholder')}
        className='h-8 text-[length:var(--text-12)]'
      />
    </div>
  )
}

/**
 * The store's `sort` had no control at all: `setSort` was wired and the server honoured three
 * orders, but the only way to ask for one was to reach into the store. The options are exactly the
 * values the list query understands; anything else falls back to the default order server-side.
 */
function PostSortSelect() {
  const sort = useBlogStore((s) => s.sort)
  const setSort = useBlogStore((s) => s.setSort)
  return (
    <Select
      aria-label={t('blog.sort_label')}
      value={sort}
      onChange={(e) => setSort(e.target.value)}
      className='h-8 text-[length:var(--text-12)] text-[var(--text-secondary)]'
    >
      <option value='published_desc'>{t('blog.sort_newest')}</option>
      <option value='published_asc'>{t('blog.sort_oldest')}</option>
      <option value='views_desc'>{t('blog.sort_views')}</option>
    </Select>
  )
}

function ViewModeToggle() {
  const viewMode = useBlogStore((s) => s.viewMode)
  const setViewMode = useBlogStore((s) => s.setViewMode)
  // Icon-only options: `title` is what names each radio, and it also becomes its tooltip.
  return (
    <Segmented
      size='sm'
      label={t('blog.view_mode_label')}
      value={viewMode}
      onChange={setViewMode}
      options={[
        { value: 'table', label: <LayoutList size={13} />, title: t('blog.view_table') },
        { value: 'grid', label: <LayoutGrid size={13} />, title: t('blog.view_grid') },
      ]}
    />
  )
}

export function BlogHubToolbar({
  onOpenSettings,
  onOpenNewPost,
}: {
  onOpenSettings: () => void
  onOpenNewPost: () => void
}) {
  const loadHubData = useBlogStore((s) => s.loadHubData)
  const loading = useBlogStore((s) => s.loading)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-12\\.5)]">
      <div className='flex items-center gap-2 flex-wrap'>
        <StatusFilterTabs />
        <ActiveFilterChips />
        <SearchBox />
        <PostSortSelect />
      </div>

      <div className='flex items-center gap-2'>
        <Button size='sm' variant='primary' onClick={onOpenNewPost}>
          <Plus size={12} className='mr-1' />
          {t('blog.new_post')}
        </Button>

        <div className='h-4 w-px bg-[var(--border-subtle)]' />

        <BlogTrafficFilterPopover />
        <ViewModeToggle />

        <IconButton
          label={t('common.refresh')}
          size='sm'
          disabled={loading}
          onClick={() => void loadHubData({ force: true })}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </IconButton>

        <IconButton label={t('blog.settings')} size='sm' onClick={onOpenSettings}>
          <Settings size={14} />
        </IconButton>
      </div>
    </div>
  )
}
