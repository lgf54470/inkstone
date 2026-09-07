import type { ReactNode } from 'react'
import { Search, LayoutGrid, LayoutList, Settings, Plus, RefreshCw, FolderClosed, Hash, X } from 'lucide-react'
import { IconButton, Button } from '../../components/primitives'
import { Input } from '../../components/form'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'
import { BlogTrafficFilterPopover } from './blog-traffic-filter-popover'

type StatusValue = 'all' | 'published' | 'draft'
type ViewModeValue = 'table' | 'grid'

function StatusTab({
  value,
  active,
  label,
  onSelect,
}: {
  value: StatusValue
  active: boolean
  label: string
  onSelect: (value: StatusValue) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-[var(--r-sm)] px-2.5 py-1 text-[length:var(--text-11\\.5)] font-medium transition-colors ${
        active
          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  )
}

function StatusFilterTabs() {
  const statusFilter = useBlogStore((s) => s.statusFilter)
  const setStatusFilter = useBlogStore((s) => s.setStatusFilter)
  return (
    <div className="flex items-center rounded-[var(--r-md)] bg-[var(--bg-base)] p-0.5 border border-[var(--border-default)]">
      <StatusTab value="all" active={statusFilter === 'all'} label={t('blog.status_all')} onSelect={setStatusFilter} />
      <StatusTab value="published" active={statusFilter === 'published'} label={t('blog.published')} onSelect={setStatusFilter} />
      <StatusTab value="draft" active={statusFilter === 'draft'} label={t('blog.draft')} onSelect={setStatusFilter} />
    </div>
  )
}

function FilterChip({ icon, label, onClear }: { icon: ReactNode; label: string; onClear: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] px-2.5 py-1 text-[length:var(--text-11)] font-medium">
      {icon}
      <span>{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="ml-0.5 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
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

function SearchBox() {
  const search = useBlogStore((s) => s.search)
  const setSearch = useBlogStore((s) => s.setSearch)
  return (
    <div className="relative w-[180px] md:w-[220px]">
      <Input
        leading={<Search size={13} className="text-[var(--text-quaternary)]" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('blog.search_posts_placeholder')}
        className="h-8 text-[length:var(--text-12)]"
      />
    </div>
  )
}

function ViewModeButton({
  mode,
  active,
  title,
  icon,
  onSelect,
}: {
  mode: ViewModeValue
  active: boolean
  title: string
  icon: ReactNode
  onSelect: (mode: ViewModeValue) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      title={title}
      className={`flex size-6 items-center justify-center rounded-[var(--r-sm)] transition-colors ${
        active
          ? 'bg-[var(--bg-surface)] text-[var(--accent)] shadow-[var(--shadow-sm)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
      }`}
    >
      {icon}
    </button>
  )
}

function ViewModeToggle() {
  const viewMode = useBlogStore((s) => s.viewMode)
  const setViewMode = useBlogStore((s) => s.setViewMode)
  return (
    <div className="flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] p-0.5 bg-[var(--bg-base)]">
      <ViewModeButton mode="table" active={viewMode === 'table'} title={t('blog.view_table')} icon={<LayoutList size={13} />} onSelect={setViewMode} />
      <ViewModeButton mode="grid" active={viewMode === 'grid'} title={t('blog.view_grid')} icon={<LayoutGrid size={13} />} onSelect={setViewMode} />
    </div>
  )
}

export function BlogHubToolbar({
  onOpenSettings,
  onOpenNewPost,
}: {
  onOpenSettings: () => void
  onOpenNewPost: () => void
}) {
  const loadAll = useBlogStore((s) => s.loadAll)
  const loading = useBlogStore((s) => s.loading)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[length:var(--text-12\\.5)]">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusFilterTabs />
        <ActiveFilterChips />
        <SearchBox />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={onOpenNewPost}>
          <Plus size={12} className="mr-1" />
          {t('blog.new_post')}
        </Button>

        <div className="h-4 w-px bg-[var(--border-subtle)]" />

        <BlogTrafficFilterPopover />
        <ViewModeToggle />

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
