import { CheckCircle, XCircle, Trash2 } from 'lucide-react'
import { Button } from '../../components/primitives'
import { t } from '../../lib/i18n'
import { useBlogStore } from './blog-store'
import { confirm } from '../../components/overlay'

export function BlogBatchBar({
  selectedCount,
  onClearSelection,
}: {
  selectedCount: number
  onClearSelection: () => void
}) {
  const batchPosts = useBlogStore((s) => s.batchPosts)
  const batchBusy = useBlogStore((s) => s.batchBusy)
  const categories = useBlogStore((s) => s.categories)

  if (selectedCount === 0) return null

  const handleBatchPublish = async () => {
    await batchPosts('publish')
  }

  const handleBatchUnpublish = async () => {
    const ok = await confirm({
      title: t('blog.unpublish'),
      description: t('blog.confirm_batch_unpublish', { value0: selectedCount }),
      confirmLabel: t('blog.unpublish'),
      tone: 'danger',
    })
    if (!ok) return
    await batchPosts('unpublish')
  }

  const handleBatchDelete = async () => {
    const ok = await confirm({
      title: t('common.delete'),
      description: t('blog.confirm_batch_delete', { value0: selectedCount }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    await batchPosts('delete')
  }

  const handleBatchSetCategory = async (catId: string) => {
    await batchPosts('setCategory', catId || null)
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-[var(--r-xl)] border border-[var(--border-strong)] bg-[var(--bg-overlay)]/95 px-4 py-2 shadow-[var(--shadow-modal)] backdrop-blur text-[12px]">
      <span className="font-semibold text-[var(--text-primary)]">
        {t('blog.selected_posts_count', { value0: selectedCount })}
      </span>

      <div className="h-4 w-px bg-[var(--border-default)]" />

      <Button
        size="sm"
        variant="secondary"
        loading={batchBusy}
        onClick={() => void handleBatchPublish()}
      >
        <CheckCircle size={12} className="mr-1 text-[var(--success)]" />
        {t('blog.batch_publish')}
      </Button>

      <Button
        size="sm"
        variant="secondary"
        loading={batchBusy}
        onClick={() => void handleBatchUnpublish()}
      >
        <XCircle size={12} className="mr-1 text-[var(--text-tertiary)]" />
        {t('blog.batch_unpublish')}
      </Button>

      {/* Set Category Dropdown */}
      <div className="relative flex items-center">
        <select
          onChange={(e) => void handleBatchSetCategory(e.target.value)}
          defaultValue=""
          className="h-7 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-base)] px-2 text-[11.5px] text-[var(--text-secondary)] outline-none"
        >
          <option value="" disabled>
            {t('blog.change_category')}
          </option>
          <option value="">{t('blog.remove_category')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Button
        size="sm"
        variant="danger"
        loading={batchBusy}
        onClick={() => void handleBatchDelete()}
      >
        <Trash2 size={12} className="mr-1" />
        {t('common.delete')}
      </Button>

      <div className="h-4 w-px bg-[var(--border-default)]" />

      <Button size="sm" variant="ghost" onClick={onClearSelection}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}
