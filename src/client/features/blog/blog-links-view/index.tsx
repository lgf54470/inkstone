import { useEffect, useState } from 'react'
import { Inbox } from 'lucide-react'
import type { BlogLink } from '@shared/types'
import { Button } from '../../../components/primitives'
import { Checkbox } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useBlogLinksView } from './use-blog-links-view'
import { LinksFilterBar, LinksHeader } from './links-toolbar'
import { LinkCardRow } from './link-card-row'
import { LinkEditModal } from './link-edit-modal'
import { LinkCategoryModal } from './link-category-modal'
import { LinkImportExportModal } from './link-import-export-modal'
import { LinkCheckerModal } from './link-checker-modal'
import { LinkQrModal } from './link-qr-modal'
import { LinkContextMenu } from './link-context-menu'
import { BlogLoadFailure } from '../blog-load-failure'

/** The server caps the list at 500 rows; the DOM does not need all of them at once. */
const LINKS_RENDER_STEP = 100

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
        {view.isTruncated && <LinksTruncationNotice shown={view.filteredLinks.length} />}
        <LinksListContent view={view} />
      </div>

      <LinksModals view={view} />
    </div>
  )
}

function LinksTruncationNotice({ shown }: { shown: number }) {
  return (
    <p className='px-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
      {t('blog.link_list_truncated', { value0: shown })}
    </p>
  )
}

function LinksListContent({ view }: { view: ReturnType<typeof useBlogLinksView> }) {
  const [renderLimit, setRenderLimit] = useState(LINKS_RENDER_STEP)
  // A different filter or search term is a different list: start it from its own top.
  useEffect(() => {
    setRenderLimit(LINKS_RENDER_STEP)
  }, [view.linkStatusFilter, view.linkCategoryId, view.linkSearch])

  const visibleLinks = view.filteredLinks.slice(0, renderLimit)

  if (view.filteredLinks.length === 0) {
    if (view.loadFailed) return <BlogLoadFailure onRetry={() => void view.loadLinks()} />
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

      <LinkCardRows links={visibleLinks} view={view} />

      {visibleLinks.length < view.filteredLinks.length && (
        <div className='flex justify-center pt-1'>
          <Button variant='secondary' size='sm' onClick={() => setRenderLimit((limit) => limit + LINKS_RENDER_STEP)}>
            {t('blog.list_show_more', { value0: visibleLinks.length, value1: view.filteredLinks.length })}
          </Button>
        </div>
      )}
    </>
  )
}

function LinkCardRows({ links, view }: { links: BlogLink[]; view: ReturnType<typeof useBlogLinksView> }) {
  return links.map((link) => (
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
  ))
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
          if (view.editingLink) return view.updateLink(view.editingLink.id, data)
          return Boolean(await view.createLink(data))
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
    <div className='flex items-center justify-between gap-3 bg-[var(--accent-soft)]/40 border-b border-[var(--border-subtle)] px-4 py-1.5 text-[length:var(--text-12)]'>
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
