import { FolderClosed } from 'lucide-react'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { confirm, type MenuItem } from '../../components/overlay'
import type { BlogStoreState } from './blog-store'

export async function batchPublish(batchPosts: BlogStoreState['batchPosts']): Promise<void> {
  await batchPosts('publish')
}

export async function batchUnpublish(batchPosts: BlogStoreState['batchPosts'], selectedCount: number): Promise<void> {
  const ok = await confirm({
    title: t('blog.unpublish'),
    description: t('blog.confirm_batch_unpublish', { value0: selectedCount }),
    confirmLabel: t('blog.unpublish'),
    tone: 'danger',
  })
  if (!ok) return
  await batchPosts('unpublish')
}

export async function batchDelete(batchPosts: BlogStoreState['batchPosts'], selectedCount: number): Promise<void> {
  const ok = await confirm({
    title: t('common.delete'),
    description: t('blog.confirm_batch_delete', { value0: selectedCount }),
    confirmLabel: t('common.delete'),
    tone: 'danger',
  })
  if (!ok) return
  await batchPosts('delete')
}

export async function batchPin(batchPosts: BlogStoreState['batchPosts'], toast: UiState['toast']): Promise<void> {
  await batchPosts('setPinned', null, true)
  toast({ title: t('blog.batch_pin'), tone: 'success' })
}

export async function batchSetCategory(batchPosts: BlogStoreState['batchPosts'], catId: string): Promise<void> {
  await batchPosts('setCategory', catId || null)
}

export function buildFolderMenuItems(
  folders: BlogStoreState['folders'],
  selectedCount: number,
  batchPosts: BlogStoreState['batchPosts'],
  closeMenu: () => void,
  toast: UiState['toast'],
): MenuItem[] {
  return [
    {
      id: 'none',
      label: t('blog.no_folder'),
      icon: <FolderClosed size={13} className='text-[var(--text-quaternary)]' />,
      onSelect: async () => {
        closeMenu()
        await batchPosts('setFolder', null)
        toast({ title: t('blog.batch_move_folder_success', { count: selectedCount }), tone: 'success' })
      },
    },
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      icon: (
        <span style={{ color: f.color ?? undefined }} className='shrink-0'>
          <FolderClosed size={13} />
        </span>
      ),
      onSelect: async () => {
        closeMenu()
        await batchPosts('setFolder', f.id)
        toast({ title: t('blog.batch_move_folder_success', { count: selectedCount }), tone: 'success' })
      },
    })),
  ]
}