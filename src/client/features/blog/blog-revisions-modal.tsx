import { useEffect } from 'react'
import { History, RotateCcw } from 'lucide-react'
import type { BlogPostSummary, BlogRevisionSummary } from '@shared/types'
import { Button, IconButton } from '../../components/primitives'
import { Modal, confirm } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { fullTime } from '../../lib/time'
import { useUi } from '../../store/ui'
import { useBlogStore } from './blog-store'

const MODAL_WIDTH = 520

export interface BlogRevisionsModalProps {
  post: BlogPostSummary
  onClose: () => void
}

/**
 * The version history of one post. The list is body-free; restoring is the only action here, and it
 * asks first because the current content also becomes a version (a restore is undone the same way).
 */
export function BlogRevisionsModal({ post, onClose }: BlogRevisionsModalProps) {
  const revisions = useBlogStore((s) => s.revisions)
  const revisionsPostId = useBlogStore((s) => s.revisionsPostId)
  const revisionsFailed = useBlogStore((s) => s.revisionsFailed)
  const loadRevisions = useBlogStore((s) => s.loadRevisions)
  const restoreRevision = useBlogStore((s) => s.restoreRevision)

  // The panel is opened per post; a list that belongs to another post (or to none) is not an answer
  // for this one, so it draws as loading and triggers the question once.
  const belongsHere = revisionsPostId === post.id
  useEffect(() => {
    if (revisionsPostId !== post.id) void loadRevisions(post.id)
  }, [revisionsPostId, post.id, loadRevisions])

  return (
    <Modal
      open
      onClose={onClose}
      width={MODAL_WIDTH}
      ariaLabel={t('blog.revisions_title')}
      title={
        <div className='flex items-center gap-2'>
          <History size={16} className='text-[var(--accent)]' />
          <span>{t('blog.revisions_title')}</span>
        </div>
      }
    >
      <div className='flex flex-col gap-3 py-1'>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('blog.revisions_hint')}</p>
        <RevisionsBody
          post={post}
          revisions={belongsHere ? revisions : null}
          failed={belongsHere && revisionsFailed}
          onRetry={() => void loadRevisions(post.id)}
          onRestore={restoreRevision}
        />
      </div>
    </Modal>
  )
}

/** Loading / failed-with-retry / empty / list: a failed question must not read as "no history". */
function RevisionsBody({
  post,
  revisions,
  failed,
  onRetry,
  onRestore,
}: {
  post: BlogPostSummary
  revisions: BlogRevisionSummary[] | null
  failed: boolean
  onRetry: () => void
  onRestore: (postId: string, revisionId: string) => Promise<boolean>
}) {
  if (failed) {
    return (
      <div className='flex flex-col items-center gap-3 py-6' role='status'>
        <p className='text-[length:var(--text-12)] text-[var(--text-tertiary)]'>{t('blog.load_failed')}</p>
        <Button variant='secondary' size='sm' onClick={onRetry}>{t('common.retry')}</Button>
      </div>
    )
  }
  if (revisions === null) {
    return (
      <p role='status' className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
        {t('common.loading')}
      </p>
    )
  }
  if (revisions.length === 0) {
    return (
      <p className='py-6 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
        {t('blog.revisions_empty')}
      </p>
    )
  }
  return (
    <div className='flex max-h-80 flex-col overflow-y-auto'>
      {revisions.map((revision) => (
        <RevisionRow key={revision.id} post={post} revision={revision} onRestore={onRestore} />
      ))}
    </div>
  )
}

function RevisionRow({
  post,
  revision,
  onRestore,
}: {
  post: BlogPostSummary
  revision: BlogRevisionSummary
  onRestore: (postId: string, revisionId: string) => Promise<boolean>
}) {
  const toast = useUi((s) => s.toast)

  const handleRestore = async () => {
    const when = fullTime(revision.createdAt)
    const ok = await confirm({
      title: t('blog.revisions_restore'),
      description: t('blog.revisions_confirm', { value0: when }),
      confirmLabel: t('blog.revisions_restore'),
    })
    if (!ok) return
    if (await onRestore(post.id, revision.id)) {
      toast({ title: t('blog.revisions_restored'), tone: 'success' })
    }
  }

  return (
    <div className='flex items-center gap-2 border-b border-[var(--border-subtle)] py-2 last:border-b-0'>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-[length:var(--text-13)] text-[var(--text-primary)]'>{revision.title}</p>
        <p className='text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{fullTime(revision.createdAt)}</p>
      </div>
      <IconButton label={t('blog.revisions_restore')} size='sm' onClick={() => void handleRestore()}>
        <RotateCcw size={13} />
      </IconButton>
    </div>
  )
}
