import { ArrowUpDown, CheckCircle2, Folder, Inbox, Plus, RefreshCw, Search, UploadCloud } from 'lucide-react'
import { Button, IconButton } from '../../../components/primitives'
import { Checkbox, Input, Select } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useBlogLinksView } from './use-blog-links-view'
import type { BlogLinkFilterType } from '../blog-store'
import { LinkCardRow } from './link-card-row'
import { LinkEditModal } from './link-edit-modal'
import { LinkCategoryModal } from './link-category-modal'
import { LinkImportExportModal } from './link-import-export-modal'
import { LinkCheckerModal } from './link-checker-modal'
import { LinkQrModal } from './link-qr-modal'
import { LinkContextMenu } from './link-context-menu'

export function BlogLinksView() {
  const view = useBlogLinksView()

  return (
    <div className='flex flex-1 flex-col overflow-hidden text-[length:var(--text-12\.5)]'>
      <LinksHeader
        onOpenAdd={view.handleOpenAdd}
        onOpenCategories={() => view.setIsCategoryModalOpen(true)}
        onOpenImportExport={() => view.setIsImportExportModalOpen(true)}
        onOpenChecker={() => view.setIsCheckerModalOpen(true)}
        isSortingMode={view.isSortingMode}
        onToggleSortingMode={() => view.setIsSortingMode(!view.isSortingMode)}
        onRefresh={() => void view.loadLinks()}
        loading={view.loading}
      />

      <LinksFilterBar
        statusFilter={view.linkStatusFilter}
        onSelectStatus={view.setLinkStatusFilter}
        statusCounts={view.statusCounts}
        categoryId={view.linkCategoryId}
        onSelectCategory={view.setLinkCategoryId}
        categories={view.linkCategories}
        search={view.linkSearch}
        onSearchChange={view.setLinkSearch}
      />

      {view.selectedLinkIds.size > 0 && (
        <LinksBatchBar
          selectedCount={view.selectedLinkIds.size}
          busy={view.batchBusy}
          onBatch={view.handleBatch}
          onClear={view.clearLinkSelection}
        />
      )}

      <div className='flex-1 overflow-y-auto p-4 space-y-2.5'>
        <LinksListContent view={view} />
      </div>

      <LinksModals view={view} />
    </div>
  )
}

function LinksListContent({ view }: { view: ReturnType<typeof useBlogLinksView> }) {
  if (view.filteredLinks.length === 0) {
    return (
      <div className='flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2'>
        <Inbox size={32} className='opacity-40' />
        <p>{t('blog.link_no_links')}</p>
      </div>
    )
  }

  return (
    <>
      <div className='flex items-center gap-2 px-1 pb-1'>
        <Checkbox
          checked={view.isAllSelected}
          onChange={view.handleToggleSelectAll}
          aria-label={t('blog.select_all_list')}
          className='min-h-0'
        />
        <span className='text-[length:var(--text-11)] text-[var(--text-tertiary)] select-none'>
          {t('blog.select_all_list')} ({view.filteredLinks.length})
        </span>
      </div>

      {view.filteredLinks.map((link) => (
        <LinkCardRow
          key={link.id}
          link={link}
          categories={view.linkCategories}
          isSelected={view.selectedLinkIds.has(link.id)}
          onToggleSelect={() => view.toggleSelectLink(link.id)}
          onApprove={() => void view.updateLinkStatus(link.id, 'approved')}
          onReject={() => void view.updateLinkStatus(link.id, 'rejected')}
          onEdit={() => view.handleOpenEdit(link)}
          onDelete={() => void view.handleDelete(link)}
          onTogglePin={() => void view.togglePinLink(link.id, !link.isPinned)}
          onToggleFavorite={() => void view.toggleFavoriteLink(link.id, !link.isFavorite)}
          onContextMenu={(e) => view.handleContextMenu(e, link)}
          draggable={view.isSortingMode}
          onDragStart={(e) => view.handleDragStart(e, link.id)}
          onDragOver={view.handleDragOver}
          onDrop={(e) => void view.handleDrop(e, link.id)}
          onDragEnd={view.handleDragEnd}
        />
      ))}
    </>
  )
}

function LinksModals({ view }: { view: ReturnType<typeof useBlogLinksView> }) {
  return (
    <>
      <LinksCoreModals view={view} />
      <LinksToolModals view={view} />
    </>
  )
}

function LinksCoreModals({ view }: { view: ReturnType<typeof useBlogLinksView> }) {
  return (
    <>
      <LinkEditModal
        open={view.isEditModalOpen}
        onClose={() => view.setIsEditModalOpen(false)}
        link={view.editingLink}
        categories={view.linkCategories}
        onSave={async (data) => {
          if (view.editingLink) {
            await view.updateLink(view.editingLink.id, data)
          } else {
            await view.createLink(data)
          }
        }}
      />

      <LinkCategoryModal
        open={view.isCategoryModalOpen}
        onClose={() => view.setIsCategoryModalOpen(false)}
        categories={view.linkCategories}
        onCreateCategory={view.createLinkCategory}
        onUpdateCategory={view.updateLinkCategory}
        onDeleteCategory={view.deleteLinkCategory}
      />

      <LinkImportExportModal
        open={view.isImportExportModalOpen}
        onClose={() => view.setIsImportExportModalOpen(false)}
        links={view.links}
        categories={view.linkCategories}
        onImport={view.importLinksData}
      />
    </>
  )
}

function LinksToolModals({ view }: { view: ReturnType<typeof useBlogLinksView> }) {
  return (
    <>
      <LinkCheckerModal
        open={view.isCheckerModalOpen}
        onClose={() => view.setIsCheckerModalOpen(false)}
        links={view.links}
        categories={view.linkCategories}
        onDeleteLink={view.handleDelete}
        onBatchDeleteLinks={view.handleBatchDeleteLinks}
        onEditLink={view.handleOpenEdit}
      />

      <LinkQrModal
        open={Boolean(view.qrModalLink)}
        onClose={() => view.setQrModalLink(null)}
        link={view.qrModalLink}
      />

      <LinkContextMenu
        state={view.contextMenu}
        categories={view.linkCategories}
        onClose={view.handleCloseContextMenu}
        onCopy={(link) => {
          void navigator.clipboard.writeText(link.url)
        }}
        onQRCode={(link) => view.setQrModalLink(link)}
        onTogglePin={(link) => void view.togglePinLink(link.id, !link.isPinned)}
        onToggleFavorite={(link) => void view.toggleFavoriteLink(link.id, !link.isFavorite)}
        onMoveCategory={(link, categoryId) => void view.updateLink(link.id, { categoryId })}
        onCheckLink={(_link) => {
          view.setIsCheckerModalOpen(true)
        }}
        onEdit={(link) => view.handleOpenEdit(link)}
        onDelete={(link) => void view.handleDelete(link)}
      />
    </>
  )
}

function LinksHeader({
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

function LinksFilterBar({
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
    <div className='flex items-center gap-1.5 flex-wrap'>
      <StatusTabButton
        active={statusFilter === 'all'}
        label={t('blog.link_status_all')}
        count={statusCounts.all}
        onClick={() => onSelectStatus('all')}
      />
      <StatusTabButton
        active={statusFilter === 'pending'}
        label={t('blog.link_status_pending')}
        count={statusCounts.pending}
        badgeTone={statusCounts.pending > 0 ? 'danger' : 'default'}
        onClick={() => onSelectStatus('pending')}
      />
      <StatusTabButton
        active={statusFilter === 'approved'}
        label={t('blog.link_status_approved')}
        count={statusCounts.approved}
        onClick={() => onSelectStatus('approved')}
      />
      <StatusTabButton
        active={statusFilter === 'rejected'}
        label={t('blog.link_status_rejected')}
        count={statusCounts.rejected}
        onClick={() => onSelectStatus('rejected')}
      />
      <StatusTabButton
        active={statusFilter === 'pinned'}
        label={t('blog.link_filter_pinned')}
        count={statusCounts.pinned}
        onClick={() => onSelectStatus('pinned')}
      />
      <StatusTabButton
        active={statusFilter === 'favorite'}
        label={t('blog.link_filter_favorite')}
        count={statusCounts.favorite}
        onClick={() => onSelectStatus('favorite')}
      />
    </div>
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
      label: c.parentId ? `  └ ${c.name}` : c.name,
    })),
  ]

  return (
    <div className='flex items-center gap-2'>
      <Select
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

function StatusTabButton({
  active,
  label,
  count,
  badgeTone = 'default',
  onClick,
}: {
  active: boolean
  label: string
  count: number
  badgeTone?: 'default' | 'danger'
  onClick: () => void
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--r-sm)] text-[length:var(--text-12)] font-medium transition-colors ${
        active
          ? 'bg-[var(--accent)] text-white shadow-sm'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          className={`text-[length:var(--text-10)] px-1.5 py-0.2 rounded-full font-bold tabular ${
            badgeTone === 'danger' && !active
              ? 'bg-[var(--danger)] text-white animate-pulse'
              : active
                ? 'bg-white/25 text-white'
                : 'bg-[var(--bg-raised)] text-[var(--text-tertiary)]'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

function LinksBatchBar({
  selectedCount,
  busy,
  onBatch,
  onClear,
}: {
  selectedCount: number
  busy: boolean
  onBatch: (action: 'approve' | 'reject' | 'delete' | 'pin' | 'unpin' | 'favorite' | 'unfavorite' | 'setCategory', catId?: string | null) => void
  onClear: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-3 bg-[var(--accent-subtle)]/40 border-b border-[var(--border-subtle)] px-4 py-1.5 text-[length:var(--text-12)]'>
      <span className='font-semibold text-[var(--accent)]'>
        {t('blog.selected_links_count', { value0: selectedCount })}
      </span>

      <div className='flex items-center gap-2 flex-wrap'>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('approve')}>
          {t('blog.link_batch_approve')}
        </Button>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('reject')}>
          {t('blog.link_batch_reject')}
        </Button>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('pin')}>
          {t('blog.link_pin')}
        </Button>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('unpin')}>
          {t('blog.link_unpin')}
        </Button>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('favorite')}>
          {t('blog.link_favorite')}
        </Button>
        <Button variant='secondary' size='sm' loading={busy} onClick={() => onBatch('unfavorite')}>
          {t('blog.link_unfavorite')}
        </Button>
        <Button variant='danger' size='sm' loading={busy} onClick={() => onBatch('delete')}>
          {t('blog.link_batch_delete')}
        </Button>
        <Button variant='ghost' size='sm' onClick={onClear}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}
