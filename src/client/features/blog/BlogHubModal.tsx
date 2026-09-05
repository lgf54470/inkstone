import { useEffect, useState } from 'react'
import { Globe, X } from 'lucide-react'
import type { BlogPost } from '@shared/types'
import { Modal } from '../../components/overlay'
import { IconButton } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useNotes } from '../../store/notes'
import { useBlogStore } from './blog-store'
import { BlogHubSidebar } from './BlogHubSidebar'
import { BlogHubToolbar } from './BlogHubToolbar'
import { BlogDashboardView } from './BlogDashboardView'
import { BlogTableView } from './BlogTableView'
import { BlogGridView } from './BlogGridView'
import { BlogBatchBar } from './BlogBatchBar'
import { BlogCommentsView } from './BlogCommentsView'
import { BlogPublishModal } from './BlogPublishModal'
import { BlogCategoriesModal } from './BlogCategoriesModal'
import { BlogSettingsModal } from './BlogSettingsModal'

export function BlogHubModal({
  open,
  onClose,
  initialNoteId,
}: {
  open: boolean
  onClose: () => void
  initialNoteId?: string
}) {
  const activeTab = useBlogStore((s) => s.activeTab)
  const viewMode = useBlogStore((s) => s.viewMode)
  const posts = useBlogStore((s) => s.posts)
  const loading = useBlogStore((s) => s.loading)
  const selectedPostIds = useBlogStore((s) => s.selectedPostIds)
  const clearPostSelection = useBlogStore((s) => s.clearPostSelection)
  const loadAll = useBlogStore((s) => s.loadAll)
  const setActiveTab = useBlogStore((s) => s.setActiveTab)

  const activeNote = useNotes((s) => (initialNoteId ? s.notes[initialNoteId] ?? null : null))

  // Sub-modals state
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null)
  const [targetNoteId, setTargetNoteId] = useState<string>('')
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  useEffect(() => {
    if (open) {
      void loadAll()
      if (initialNoteId && activeNote) {
        setTargetNoteId(initialNoteId)
      }
    } else {
      clearPostSelection()
      setIsPublishModalOpen(false)
      setEditingPost(null)
      setIsCategoriesModalOpen(false)
      setIsSettingsModalOpen(false)
    }
  }, [open, loadAll, clearPostSelection, initialNoteId, activeNote])

  const handleOpenNewPost = () => {
    setEditingPost(null)
    setTargetNoteId(initialNoteId || (activeNote?.id ?? ''))
    setIsPublishModalOpen(true)
  }

  const handleOpenEditPost = (post: BlogPost) => {
    setEditingPost(post)
    setTargetNoteId(post.noteId)
    setIsPublishModalOpen(true)
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={1300}
        className="h-[84vh] min-h-[580px] max-h-[880px] p-0 overflow-hidden flex flex-col"
        bodyClassName="p-0 flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        {/* Top Header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-[var(--accent)]" />
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
              {t('blog.hub_title')}
            </h2>
          </div>
          <IconButton label={t('common.close')} size="sm" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>

        {/* Workspace Body */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <BlogHubSidebar
            onOpenCategoriesModal={() => setIsCategoriesModalOpen(true)}
            onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
          />

          {/* Content Area */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg-base)] overflow-hidden">
            {activeTab === 'dashboard' ? (
              <BlogDashboardView
                onSwitchTab={(tab) => setActiveTab(tab)}
                onOpenNewPost={handleOpenNewPost}
              />
            ) : activeTab === 'comments' ? (
              <BlogCommentsView />
            ) : (
              <>
                <BlogHubToolbar
                  onOpenSettings={() => setIsSettingsModalOpen(true)}
                  onOpenNewPost={handleOpenNewPost}
                />

                <div className="flex-1 overflow-y-auto">
                  {loading && posts.length === 0 ? (
                    <div className="flex h-64 items-center justify-center text-[12px] text-[var(--text-quaternary)]">
                      {t('common.loading')}
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="flex h-64 flex-col items-center justify-center text-[var(--text-quaternary)] space-y-2">
                      <p>{t('blog.no_posts')}</p>
                    </div>
                  ) : viewMode === 'table' ? (
                    <BlogTableView posts={posts} onOpenEdit={handleOpenEditPost} />
                  ) : (
                    <BlogGridView posts={posts} onOpenEdit={handleOpenEditPost} />
                  )}
                </div>

                <BlogBatchBar
                  selectedCount={selectedPostIds.size}
                  onClearSelection={clearPostSelection}
                />
              </>
            )}
          </div>
        </div>
      </Modal>

      {/* Sub-modals */}
      {isPublishModalOpen && targetNoteId && (
        <BlogPublishModal
          open={isPublishModalOpen}
          onClose={() => setIsPublishModalOpen(false)}
          noteId={targetNoteId}
          post={editingPost}
          onSaved={() => void loadAll()}
        />
      )}

      {isCategoriesModalOpen && (
        <BlogCategoriesModal
          open={isCategoriesModalOpen}
          onClose={() => setIsCategoriesModalOpen(false)}
        />
      )}

      {isSettingsModalOpen && (
        <BlogSettingsModal
          open={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </>
  )
}
