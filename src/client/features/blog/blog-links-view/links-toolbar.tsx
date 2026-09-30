import type { ReactNode } from 'react'
import { ArrowUpDown, CheckCircle2, Folder, Plus, RefreshCw, Search, UploadCloud } from 'lucide-react'
import { Button, IconButton } from '../../../components/primitives'
import { Input, Segmented, Select } from '../../../components/form'
import { t } from '../../../lib/i18n'
import type { BlogLinkFilterType } from '../blog-store'

export function LinksHeader({
  onOpenAdd,
  onOpenCategories,
  onOpenImportExport,
  onOpenChecker,
  isSortingMode,
  onToggleSortingMode,
  onRefresh,
  loading,
}: {
  onOpenAdd: () => void
  onOpenCategories: () => void
  onOpenImportExport: () => void
  onOpenChecker: () => void
  isSortingMode: boolean
  onToggleSortingMode: () => void
  onRefresh: () => void
  loading: boolean
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2.5'>
      <div>
        <h3 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('blog.links_title')}
        </h3>
        <p className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {t('blog.links_subtitle')}
        </p>
      </div>

      <div className='flex items-center gap-2 flex-wrap'>
        <Button variant='primary' size='sm' onClick={onOpenAdd}>
          <Plus size={14} />
          {t('blog.add_link')}
        </Button>
        <Button variant={isSortingMode ? 'primary' : 'secondary'} size='sm' onClick={onToggleSortingMode}>
          <ArrowUpDown size={14} />
          {isSortingMode ? t('blog.link_reorder_finish') : t('blog.link_reorder_mode')}
        </Button>
        <Button variant='secondary' size='sm' onClick={onOpenChecker}>
          <CheckCircle2 size={14} />
          {t('blog.link_batch_check')}
        </Button>
        <Button variant='secondary' size='sm' onClick={onOpenCategories}>
          <Folder size={14} />
          {t('blog.link_categories_mgmt')}
        </Button>
        <Button variant='secondary' size='sm' onClick={onOpenImportExport}>
          <UploadCloud size={14} />
          {t('blog.link_import_export')}
        </Button>
        <IconButton label={t('common.refresh')} size='sm' onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </IconButton>
      </div>
    </div>
  )
}

export function LinksFilterBar({
  statusFilter,
  onSelectStatus,
  statusCounts,
  categoryId,
  onSelectCategory,
  categories,
  search,
  onSearchChange,
}: {
  statusFilter: BlogLinkFilterType
  onSelectStatus: (s: BlogLinkFilterType) => void
  statusCounts: { all: number; pending: number; approved: number; rejected: number; pinned: number; favorite: number }
  categoryId: string | null
  onSelectCategory: (id: string | null) => void
  categories: Array<{ id: string; name: string; parentId?: string | null }>
  search: string
  onSearchChange: (q: string) => void
}) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-4 py-2'>
      <StatusFilterTabs
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        onSelectStatus={onSelectStatus}
      />
      <CategorySearchControls
        categoryId={categoryId}
        categories={categories}
        search={search}
        onSelectCategory={onSelectCategory}
        onSearchChange={onSearchChange}
      />
    </div>
  )
}

function StatusFilterTabs({
  statusFilter,
  statusCounts,
  onSelectStatus,
}: {
  statusFilter: BlogLinkFilterType
  statusCounts: { all: number; pending: number; approved: number; rejected: number; pinned: number; favorite: number }
  onSelectStatus: (s: BlogLinkFilterType) => void
}) {
  return (
    <Segmented
      size='sm'
      label={t('blog.link_status_filter_label')}
      value={statusFilter}
      onChange={onSelectStatus}
      options={[
        { value: 'all', label: statusTabLabel(t('blog.link_status_all'), statusCounts.all) },
        { value: 'pending', label: statusTabLabel(t('blog.link_status_pending'), statusCounts.pending, statusCounts.pending > 0) },
        { value: 'approved', label: statusTabLabel(t('blog.link_status_approved'), statusCounts.approved) },
        { value: 'rejected', label: statusTabLabel(t('blog.link_status_rejected'), statusCounts.rejected) },
        { value: 'pinned', label: statusTabLabel(t('blog.link_filter_pinned'), statusCounts.pinned) },
        { value: 'favorite', label: statusTabLabel(t('blog.link_filter_favorite'), statusCounts.favorite) },
      ]}
    />
  )
}

function CategorySearchControls({
  categoryId,
  categories,
  search,
  onSelectCategory,
  onSearchChange,
}: {
  categoryId: string | null
  categories: Array<{ id: string; name: string; parentId?: string | null }>
  search: string
  onSelectCategory: (id: string | null) => void
  onSearchChange: (q: string) => void
}) {
  const catOptions = [
    { value: '', label: t('blog.link_status_all') },
    ...categories.map((c) => ({
      value: c.id,
      label: c.parentId ? `${t('blog.tree_branch_prefix')}${c.name}` : c.name,
    })),
  ]

  return (
    <div className='flex items-center gap-2'>
      <Select
        aria-label={t('blog.link_category')}
        value={categoryId || ''}
        onChange={(e) => onSelectCategory(e.target.value || null)}
        className='h-8 text-[length:var(--text-12)] w-36'
      >
        {catOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <div className='relative w-44'>
        <Input
          leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('blog.search_links_placeholder')}
          className='h-8 text-[length:var(--text-12)]'
        />
      </div>
    </div>
  )
}

/** A filter tab's face: its label, plus the count when there is one to report. */
function statusTabLabel(label: string, count: number, alert = false): ReactNode {
  return (
    <span className='inline-flex items-center gap-1.5'>
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.2 text-[length:var(--text-10)] font-bold tabular ${
            alert ? 'bg-[var(--danger)] text-[var(--danger-on)]' : 'bg-[var(--bg-raised)] text-[var(--text-tertiary)]'
          }`}
        >
          {count}
        </span>
      )}
    </span>
  )
}
