import { Globe, X } from 'lucide-react'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useBlogHubModal, type BlogHubModalBundle } from './use-blog-hub-modal'
import { BlogHubSidebar } from './blog-hub-sidebar'
import { BlogHubToolbar } from './blog-hub-toolbar'
import { BlogDashboardView } from './blog-dashboard-view'
import { BlogTableView } from './blog-table-view'
import { BlogGridView } from './blog-grid-view'
import { BlogBatchBar } from './blog-batch-bar'
import { BlogCommentsView } from './blog-comments-view'
import { BlogLinksView } from './blog-links-view'
import { BlogPublishModal } from './blog-publish-modal'
import { BlogCategoriesModal } from './blog-categories-modal'
import { BlogSettingsModal } from './blog-settings-modal'

const MODAL_WIDTH = 1300

export function BlogHubModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const modal = useBlogHubModal({ open, initialNoteId })

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={MODAL_WIDTH}
        className='h-[84vh] min-h-145 max-h-220 p-0 overflow-hidden flex flex-col'
        bodyClassName='p-0 flex-1 min-h-0 flex flex-col overflow-hidden'
      >
        <BlogHubModalHeader onClose={onClose} />

        <div className='flex min-h-0 flex-1'>
          <BlogHubSidebar
            onOpenCategoriesModal={() => modal.setIsCategoriesModalOpen(true)}
            onOpenSettingsModal={() => modal.setIsSettingsModalOpen(true)}
          />

          <BlogHubContent bundle={modal} />
        </div>
      </Modal>

      {modal.isPublishModalOpen && modal.targetNoteId && (
        <BlogPublishModal
          open={modal.isPublishModalOpen}
          onClose={() => modal.setIsPublishModalOpen(false)}
          noteId={modal.targetNoteId}
          post={modal.editingPost}
          onSaved={() => void modal.onSaved()}
        />
      )}

      {modal.isCategoriesModalOpen && (
        <BlogCategoriesModal
          open={modal.isCategoriesModalOpen}
          onClose={() => modal.setIsCategoriesModalOpen(false)}
        />
      )}

      {modal.isSettingsModalOpen && (
        <BlogSettingsModal
          open={modal.isSettingsModalOpen}
          onClose={() => modal.setIsSettingsModalOpen(false)}
        />
      )}
    </>
  )
}

function BlogHubModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className='flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]'>
      <div className='flex items-center gap-2'>
        <Globe size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('blog.hub_title')}
        </h2>
      </div>
      <IconButton label={t('common.close')} size='sm' onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

function BlogHubContent({ bundle }: { bundle: BlogHubModalBundle }) {
  return (
    <div className='relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)] overflow-hidden'>
      {bundle.activeTab === 'dashboard' ? (
        <BlogDashboardView
          onSwitchTab={bundle.onSwitchTab}
          onOpenNewPost={bundle.onOpenNewPost}
        />
      ) : bundle.activeTab === 'comments' ? (
        <BlogCommentsView />
      ) : bundle.activeTab === 'links' ? (
        <BlogLinksView />
      ) : (
        <>
          <BlogHubToolbar
            onOpenSettings={bundle.onOpenSettings}
            onOpenNewPost={bundle.onOpenNewPost}
          />

          <div className='flex-1 overflow-y-auto'>
            {bundle.loading && bundle.posts.length === 0 ? (
              <div className='flex h-64 items-center justify-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
                {t('common.loading')}
              </div>
            ) : bundle.posts.length === 0 ? (
              <div className='flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2'>
                <p>{t('blog.no_posts')}</p>
              </div>
            ) : bundle.viewMode === 'table' ? (
              <BlogTableView posts={bundle.posts} onOpenEdit={bundle.onOpenEditPost} />
            ) : (
              <BlogGridView posts={bundle.posts} onOpenEdit={bundle.onOpenEditPost} />
            )}
          </div>

          <BlogBatchBar
            selectedCount={bundle.selectedCount}
            onClearSelection={bundle.onClearSelection}
          />
        </>
      )}
    </div>
  )
}