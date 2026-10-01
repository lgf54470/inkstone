import { useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import type { BlogTrashEntry } from '@shared/types'
import { Button, IconButton } from '../../../components/primitives'
import { confirm } from '../../../components/overlay'
import { t } from '../../../lib/i18n'
import { fullTime } from '../../../lib/time'
import type { UiState } from '../../../store/ui'
import { useUi } from '../../../store/ui'
import { useBlogStore, type BlogStoreState } from '../blog-store'
import { BlogLoadFailure } from '../blog-load-failure'

/**
 * The recycle bin (FEA-04). A deleted post keeps everything it owned — comments, retired addresses,
 * visit history — so this view is where the author decides whether it comes back or is erased for
 * good. The empty state, the failure state and the loaded list are three answers, never one: a failed
 * request must not read as "nothing was deleted".
 */
export function BlogTrashView() {
  const posts = useBlogStore((s) => s.trashPosts)
  const loading = useBlogStore((s) => s.loading)
  const failed = useBlogStore((s) => s.loadErrors.has('trash'))
  const loadTrash = useBlogStore((s) => s.loadTrash)
  const restorePost = useBlogStore((s) => s.restorePost)
  const purgePost = useBlogStore((s) => s.purgePost)
  const emptyTrash = useBlogStore((s) => s.emptyTrash)
  const toast = useUi((s) => s.toast)
  const [busyId, setBusyId] = useState<string | null>(null)

  return (
    <div className='flex flex-1 flex-col overflow-hidden text-[length:var(--text-12)]'>
      <TrashToolbar
        count={posts.length}
        busy={loading}
        onRefresh={() => void loadTrash()}
        onEmpty={() => void emptyBin(posts.length, emptyTrash, toast)}
      />

      <div className='flex-1 overflow-y-auto p-4'>
        {posts.length === 0 ? (
          <TrashPlaceholder loading={loading} failed={failed} onRetry={() => void loadTrash()} />
        ) : (
          <ul className='flex flex-col gap-2'>
            {posts.map((entry) => (
              <TrashRow
                key={entry.id}
                entry={entry}
                busy={busyId === entry.id}
                onRestore={() => void restoreEntry(entry, restorePost, setBusyId, toast)}
                onPurge={() => void purgeEntry(entry, purgePost, setBusyId, toast)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TrashToolbar({
  count,
  busy,
  onRefresh,
  onEmpty,
}: {
  count: number
  busy: boolean
  onRefresh: () => void
  onEmpty: () => void
}) {
  return (
    <div className='flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3'>
      <div className='min-w-0'>
        <p className='text-[length:var(--text-12)] font-semibold text-[var(--text-primary)]'>
          {t('blog.trash')}
          {count > 0 && <span className='ml-1.5 text-[var(--text-quaternary)]'>{count}</span>}
        </p>
        <p className='truncate text-[length:var(--text-11)] text-[var(--text-tertiary)]'>{t('blog.trash_hint')}</p>
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        <Button size='sm' variant='secondary' loading={busy} onClick={onRefresh}>
          {t('common.refresh')}
        </Button>
        <Button size='sm' variant='danger' disabled={count === 0} onClick={onEmpty}>
          {t('blog.trash_empty_action')}
        </Button>
      </div>
    </div>
  )
}

function TrashPlaceholder({ loading, failed, onRetry }: { loading: boolean; failed: boolean; onRetry: () => void }) {
  if (failed) return <BlogLoadFailure onRetry={onRetry} />
  if (loading) {
    return (
      <p role='status' className='flex h-64 items-center justify-center text-[var(--text-quaternary)]'>
        {t('common.loading')}
      </p>
    )
  }
  return (
    <p className='flex h-64 items-center justify-center text-[var(--text-quaternary)]'>{t('blog.trash_empty')}</p>
  )
}

function TrashRow({
  entry,
  busy,
  onRestore,
  onPurge,
}: {
  entry: BlogTrashEntry
  busy: boolean
  onRestore: () => void
  onPurge: () => void
}) {
  return (
    <li className='flex items-center gap-3 rounded-[var(--r-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2.5'>
      <div className='min-w-0 flex-1'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium text-[var(--text-primary)]'>{entry.title}</span>
          <span className='shrink-0 rounded-full bg-[var(--bg-hover)] px-1.5 py-0.5 text-[length:var(--text-10)] text-[var(--text-tertiary)]'>
            {entry.isPublished ? t('blog.published') : t('blog.draft')}
          </span>
        </div>
        <p className='truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {`/posts/${entry.slug} · ${t('blog.trash_deleted_at', { value0: fullTime(entry.deletedAt) })}`}
        </p>
      </div>

      <Button size='sm' variant='secondary' icon={<RotateCcw size={12} />} disabled={busy} onClick={onRestore}>
        {t('blog.trash_restore')}
      </Button>
      <IconButton
        label={`${t('blog.trash_purge')}: ${entry.title}`}
        size='sm'
        disabled={busy}
        onClick={onPurge}
      >
        <Trash2 size={13} />
      </IconButton>
    </li>
  )
}

async function restoreEntry(
  entry: BlogTrashEntry,
  restorePost: BlogStoreState['restorePost'],
  setBusyId: (id: string | null) => void,
  toast: UiState['toast'],
): Promise<void> {
  setBusyId(entry.id)
  try {
    if (await restorePost(entry.id)) toast({ title: t('blog.trash_restored'), tone: 'success' })
  } finally {
    setBusyId(null)
  }
}

async function purgeEntry(
  entry: BlogTrashEntry,
  purgePost: BlogStoreState['purgePost'],
  setBusyId: (id: string | null) => void,
  toast: UiState['toast'],
): Promise<void> {
  const ok = await confirm({
    title: t('blog.trash_purge'),
    description: t('blog.confirm_purge_post', { value0: entry.title }),
    confirmLabel: t('blog.trash_purge'),
    tone: 'danger',
  })
  if (!ok) return
  setBusyId(entry.id)
  try {
    if (await purgePost(entry.id)) toast({ title: t('blog.trash_purged'), tone: 'default' })
  } finally {
    setBusyId(null)
  }
}

async function emptyBin(
  count: number,
  emptyTrash: BlogStoreState['emptyTrash'],
  toast: UiState['toast'],
): Promise<void> {
  if (count === 0) return
  const ok = await confirm({
    title: t('blog.trash_empty_action'),
    description: t('blog.confirm_empty_trash', { value0: count }),
    confirmLabel: t('blog.trash_empty_action'),
    tone: 'danger',
  })
  if (!ok) return
  if (await emptyTrash()) toast({ title: t('blog.trash_emptied'), tone: 'default' })
}
