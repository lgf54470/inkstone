import { useMemo, useState } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogComment, BlogCommentStatus } from '@shared/types'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'

export function useBlogCommentsView() {
  const toast = useUi((s) => s.toast)
  const comments = useBlogStore((s) => s.comments)
  const settings = useBlogStore((s) => s.settings)
  const loading = useBlogStore((s) => s.loading)
  const loadComments = useBlogStore((s) => s.loadComments)
  const commentStatusFilter = useBlogStore((s) => s.commentStatusFilter)
  const setCommentStatusFilter = useBlogStore((s) => s.setCommentStatusFilter)
  const selectedCommentIds = useBlogStore((s) => s.selectedCommentIds)
  const toggleSelectComment = useBlogStore((s) => s.toggleSelectComment)
  const selectAllComments = useBlogStore((s) => s.selectAllComments)
  const clearCommentSelection = useBlogStore((s) => s.clearCommentSelection)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)
  const deleteComment = useBlogStore((s) => s.deleteComment)
  const batchComments = useBlogStore((s) => s.batchComments)
  const batchBusy = useBlogStore((s) => s.batchBusy)

  const [search, setSearch] = useState('')

  const frontendBase = (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, '')
  const statusCounts = useMemo(() => computeStatusCounts(comments), [comments])
  const filteredComments = useMemo(
    () => filterComments(comments, commentStatusFilter, search),
    [comments, commentStatusFilter, search],
  )
  const isAllSelected = filteredComments.length > 0 && filteredComments.every((c) => selectedCommentIds.has(c.id))

  const handleToggleSelectAll = () => toggleAllComments(isAllSelected, filteredComments, clearCommentSelection, selectAllComments)
  const handleDeleteSingle = (id: string) => deleteSingleComment(id, deleteComment, toast)
  const handleBatch = (action: CommentBatchAction) => batchCommentsAction(action, selectedCommentIds.size, batchComments, toast)

  return {
    search, setSearch,
    statusCounts, filteredComments, isAllSelected,
    commentStatusFilter, setCommentStatusFilter,
    loading, loadComments, batchBusy,
    selectedCommentIds, toggleSelectComment, clearCommentSelection,
    updateCommentStatus, frontendBase,
    handleToggleSelectAll, handleDeleteSingle, handleBatch,
  }
}


function computeStatusCounts(comments: BlogComment[]): Record<BlogCommentStatus | 'all', number> {
  const counts: Record<BlogCommentStatus | 'all', number> = { all: comments.length, pending: 0, approved: 0, rejected: 0, spam: 0 }
  for (const c of comments) {
    if (c.status in counts) counts[c.status as BlogCommentStatus]++
  }
  return counts
}


function filterComments(comments: BlogComment[], statusFilter: BlogCommentStatus | 'all', search: string): BlogComment[] {
  let list = comments
  if (statusFilter !== 'all') {
    list = list.filter((c) => c.status === statusFilter)
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase()
    list = list.filter(
      (c) =>
        c.authorName.toLowerCase().includes(q) ||
        c.authorEmail.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.postTitle && c.postTitle.toLowerCase().includes(q)),
    )
  }
  return list
}

function toggleAllComments(
  isAllSelected: boolean,
  filteredComments: BlogComment[],
  clearCommentSelection: () => void,
  selectAllComments: (ids: string[]) => void,
): void {
  if (isAllSelected) {
    clearCommentSelection()
  } else {
    selectAllComments(filteredComments.map((c) => c.id))
  }
}

async function deleteSingleComment(
  id: string,
  deleteComment: BlogStoreDeleteComment,
  toast: UiState['toast'],
): Promise<void> {
  const ok = await confirm({
    title: t('blog.delete_comment'),
    description: t('blog.confirm_delete_comment'),
    confirmLabel: t('common.delete'),
    tone: 'danger',
  })
  if (!ok) return
  await deleteComment(id)
  toast({ title: t('blog.comment_deleted'), tone: 'default' })
}

async function batchCommentsAction(
  action: CommentBatchAction,
  selectedCount: number,
  batchComments: BlogStoreBatchComments,
  toast: UiState['toast'],
): Promise<void> {
  if (selectedCount === 0) return
  if (action === 'delete') {
    const ok = await confirm({
      title: t('blog.batch_delete'),
      description: t('blog.confirm_batch_delete_comments', { value0: selectedCount }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
  }
  await batchComments(action)
  toast({ title: t('blog.batch_action_success'), tone: 'success' })
}

type CommentBatchAction = 'approve' | 'reject' | 'spam' | 'delete'
type BlogStoreDeleteComment = ReturnType<typeof useBlogStore.getState>['deleteComment']
type BlogStoreBatchComments = ReturnType<typeof useBlogStore.getState>['batchComments']