import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { DEFAULT_BLOG_FRONTEND_URL } from '@shared/constants'
import type { BlogComment, BlogCommentsCounts, BlogCommentStatus, BlogSettings } from '@shared/types'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'

/** Same 250ms as the post list's box: the reader pauses, and the server is asked once. */
const COMMENT_SEARCH_DEBOUNCE_MS = 250

export function useBlogCommentsView() {
  const toast = useUi((s) => s.toast)
  const comments = useBlogStore((s) => s.comments)
  const commentStats = useBlogStore((s) => s.commentStats)
  const settings = useBlogStore((s) => s.settings)
  const loading = useBlogStore((s) => s.loading)
  const loadComments = useBlogStore((s) => s.loadComments)
  const commentStatusFilter = useBlogStore((s) => s.commentStatusFilter)
  const setCommentStatusFilter = useBlogStore((s) => s.setCommentStatusFilter)
  const { search, setSearch } = useCommentSearchBox()
  const selectedCommentIds = useBlogStore((s) => s.selectedCommentIds)
  const toggleSelectComment = useBlogStore((s) => s.toggleSelectComment)
  const selectAllComments = useBlogStore((s) => s.selectAllComments)
  const clearCommentSelection = useBlogStore((s) => s.clearCommentSelection)
  const updateCommentStatus = useBlogStore((s) => s.updateCommentStatus)
  const replyToComment = useBlogStore((s) => s.replyToComment)
  const deleteComment = useBlogStore((s) => s.deleteComment)
  const batchComments = useBlogStore((s) => s.batchComments)
  const batchBusy = useBlogStore((s) => s.batchBusy)
  const loadErrors = useBlogStore((s) => s.loadErrors)

  const { frontendBase, isAllSelected, isTruncated } = commentsViewState(
    settings, comments, commentStats, selectedCommentIds, commentStatusFilter,
  )

  // The row that is mid-change: the status buttons of every other row stay where they are, and the
  // one being written cannot be clicked twice while its answer is in flight.
  const [statusBusyIds, setStatusBusyIds] = useState<Set<string>>(new Set())
  const reply = useCommentReply(replyToComment, toast)

  const handleToggleSelectAll = () => toggleAllComments(isAllSelected, comments, clearCommentSelection, selectAllComments)
  const handleDeleteSingle = (id: string) => deleteSingleComment(id, deleteComment, toast)
  const handleBatch = (action: CommentBatchAction) => batchCommentsAction(action, selectedCommentIds.size, batchComments, toast)
  const handleStatusChange = (id: string, status: BlogCommentStatus) =>
    changeCommentStatus(id, status, updateCommentStatus, toast, setStatusBusyIds)

  return {
    ...reply,
    search, setSearch,
    statusCounts: commentStats, comments, isTruncated, isAllSelected,
    loadFailed: comments.length === 0 && loadErrors.has('comments'),
    commentStatusFilter, setCommentStatusFilter,
    loading, loadComments, batchBusy,
    selectedCommentIds, toggleSelectComment, clearCommentSelection,
    updateCommentStatus, frontendBase,
    statusBusyIds, handleStatusChange,
    handleToggleSelectAll, handleDeleteSingle, handleBatch,
  }
}

/**
 * The reply composer (FEA-06) is one at a time: opening another row's leaves the first one's draft
 * behind, which is what a reader switching their mind expects, not two half-written answers. A
 * failed send keeps the composer open (the store layer reports the failure itself) so the draft
 * stays where the author typed it.
 */
function useCommentReply(replyToComment: BlogStoreReplyToComment, toast: UiState['toast']) {
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyBusy, setReplyBusy] = useState(false)

  const handleOpenReply = (id: string) => {
    setReplyTargetId(id)
    setReplyDraft('')
  }
  const handleCancelReply = () => setReplyTargetId(null)
  const handleReplyDraft = (value: string) => setReplyDraft(value)
  const handleSubmitReply = () =>
    submitCommentReply(replyTargetId, replyDraft, replyToComment, toast, setReplyBusy, setReplyTargetId, setReplyDraft)

  return { replyTargetId, replyDraft, setReplyDraft: handleReplyDraft, replyBusy, handleOpenReply, handleCancelReply, handleSubmitReply }
}

async function submitCommentReply(
  targetId: string | null,
  draft: string,
  replyToComment: BlogStoreReplyToComment,
  toast: UiState['toast'],
  setBusy: Dispatch<SetStateAction<boolean>>,
  setTarget: Dispatch<SetStateAction<string | null>>,
  setDraft: Dispatch<SetStateAction<string>>,
): Promise<void> {
  const content = draft.trim()
  if (!targetId || !content) return
  setBusy(true)
  try {
    const done = await replyToComment(targetId, content)
    if (done) {
      toast({ title: t('blog.comment_reply_sent'), tone: 'success' })
      setTarget(null)
      setDraft('')
    }
  } finally {
    setBusy(false)
  }
}

/** The values the list draws from what it already has, derived in one place so the hook stays a hook. */
function commentsViewState(
  settings: BlogSettings | null,
  comments: BlogComment[],
  commentStats: BlogCommentsCounts | null,
  selectedCommentIds: Set<string>,
  commentStatusFilter: BlogCommentStatus | 'all',
): { frontendBase: string; isAllSelected: boolean; isTruncated: boolean } {
  return {
    frontendBase: (settings?.frontendUrl || DEFAULT_BLOG_FRONTEND_URL).replace(/\/+$/, ''),
    isAllSelected: comments.length > 0 && comments.every((comment) => selectedCommentIds.has(comment.id)),
    // The server caps the list; a tab whose real size is larger than what came back is truncated and
    // the view says so rather than letting the reader believe those are all of them.
    isTruncated: Boolean(commentStats && commentStats[commentStatusFilter] > comments.length),
  }
}

/**
 * The box types instantly and asks once; the value it shows is its own, while the query lives in the
 * store. Filtering in the browser used to narrow only the page that happened to arrive.
 */
function useCommentSearchBox(): { search: string; setSearch: (value: string) => void } {
  const commentSearch = useBlogStore((s) => s.commentSearch)
  const setCommentSearch = useBlogStore((s) => s.setCommentSearch)
  const [draft, setDraft] = useState(commentSearch)

  useEffect(() => {
    if (draft === commentSearch) return
    const timer = setTimeout(() => setCommentSearch(draft), COMMENT_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, commentSearch, setCommentSearch])

  return { search: draft, setSearch: setDraft }
}

function toggleAllComments(
  isAllSelected: boolean,
  comments: { id: string }[],
  clearCommentSelection: () => void,
  selectAllComments: (ids: string[]) => void,
): void {
  if (isAllSelected) {
    clearCommentSelection()
  } else {
    selectAllComments(comments.map((c) => c.id))
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
  const deleted = await deleteComment(id)
  if (deleted) toast({ title: t('blog.comment_deleted'), tone: 'default' })
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
  const done = await batchComments(action)
  if (done) toast({ title: t('blog.batch_action_success'), tone: 'success' })
}

/**
 * One comment's moderation change: the success sentence belongs here, the failure sentence belongs to
 * the store layer (`runBlogMutation` reports the error it saw), and the row's disabled state belongs
 * to neither — it has to outlive both answers.
 */
async function changeCommentStatus(
  id: string,
  status: BlogCommentStatus,
  updateCommentStatus: BlogStoreUpdateCommentStatus,
  toast: UiState['toast'],
  setBusyIds: Dispatch<SetStateAction<Set<string>>>,
): Promise<void> {
  setBusyIds((ids) => new Set(ids).add(id))
  try {
    const done = await updateCommentStatus(id, status)
    if (done) toast({ title: t('blog.comment_status_updated'), tone: 'success' })
  } finally {
    setBusyIds((ids) => {
      const next = new Set(ids)
      next.delete(id)
      return next
    })
  }
}

type BlogStoreUpdateCommentStatus = ReturnType<typeof useBlogStore.getState>['updateCommentStatus']
type BlogStoreReplyToComment = ReturnType<typeof useBlogStore.getState>['replyToComment']
type CommentBatchAction = 'approve' | 'reject' | 'spam' | 'delete'
type BlogStoreDeleteComment = ReturnType<typeof useBlogStore.getState>['deleteComment']
type BlogStoreBatchComments = ReturnType<typeof useBlogStore.getState>['batchComments']
