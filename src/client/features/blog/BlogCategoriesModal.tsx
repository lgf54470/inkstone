import { useState } from 'react'
import { FolderPlus, Trash2, Edit2, Check, X } from 'lucide-react'
import type { BlogCategory } from '@shared/types'
import { Modal } from '../../components/overlay'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { errorMessage } from '../../lib/errors'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { confirm } from '../../components/overlay'
import { useBlogStore } from './blog-store'

const CATEGORY_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
]

export function BlogCategoriesModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useUi((s) => s.toast)
  const categories = useBlogStore((s) => s.categories)
  const createCategory = useBlogStore((s) => s.createCategory)
  const updateCategory = useBlogStore((s) => s.updateCategory)
  const deleteCategory = useBlogStore((s) => s.deleteCategory)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [selectedColor, setSelectedColor] = useState(CATEGORY_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleStartEdit = (cat: BlogCategory) => {
    setEditingId(cat.id)
    setName(cat.name)
    setSlug(cat.slug)
    setDescription(cat.description || '')
    setSelectedColor(cat.color || CATEGORY_COLORS[0])
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setName('')
    setSlug('')
    setDescription('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setSaving(true)
    try {
      if (editingId) {
        await updateCategory(editingId, {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          color: selectedColor,
        })
        toast({ title: t('common.saved'), tone: 'success' })
      } else {
        await createCategory({
          name: name.trim(),
          slug: slug.trim() || undefined,
          description: description.trim(),
          color: selectedColor,
        })
        toast({ title: t('common.created'), tone: 'success' })
      }
      handleCancelEdit()
    } catch (error: unknown) {
      toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (cat: BlogCategory) => {
    const ok = await confirm({
      title: t('blog.delete_category'),
      description: t('blog.confirm_delete_category_desc', { value0: cat.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    })
    if (!ok) return
    try {
      await deleteCategory(cat.id)
      toast({ title: t('common.delete'), tone: 'default' })
    } catch {
      toast({ title: t('common.action_failed'), tone: 'danger' })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={560}
      className="p-0 overflow-hidden"
    >
      <div className="flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]">
        <div className="flex items-center gap-2">
          <FolderPlus size={16} className="text-[var(--accent)]" />
          <h2 className="text-[14px] font-semibold text-[var(--text-primary)]">
            {t('blog.categories')}
          </h2>
        </div>
        <IconButton label={t('common.close')} size="sm" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5 text-[12.5px]">
        {/* Form: Add or Edit Category */}
        <form onSubmit={handleSubmit} className="rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[var(--text-primary)]">
              {editingId ? t('blog.edit_category') : t('blog.add_category')}
            </span>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-[11px] text-[var(--text-quaternary)] hover:text-[var(--text-primary)]"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                {t('blog.category_name')}
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('blog.category_name_placeholder')}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
                {t('blog.category_slug')}
              </label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="tech"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-[var(--text-secondary)]">
              {t('blog.category_color')}
            </label>
            <div className="flex items-center gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedColor(c)}
                  className={`size-6 rounded-full flex items-center justify-center transition-transform ${
                    selectedColor === c ? 'scale-110 ring-2 ring-[var(--accent)] ring-offset-2' : ''
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {selectedColor === c && <Check size={12} className="text-white" />}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <Button variant="primary" size="sm" type="submit" loading={saving}>
              {editingId ? t('common.save') : t('blog.add_tag')}
            </Button>
          </div>
        </form>

        {/* Existing Categories List */}
        <div className="space-y-2">
          <h3 className="font-semibold text-[13px] text-[var(--text-secondary)]">
            {t('blog.existing_categories')} ({categories.length})
          </h3>

          <div className="divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden">
            {categories.length === 0 ? (
              <div className="p-6 text-center text-[var(--text-quaternary)]">
                {t('blog.no_categories_hint')}
              </div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="size-3 rounded-full"
                      style={{ backgroundColor: cat.color || 'var(--accent)' }}
                    />
                    <div>
                      <span className="font-medium text-[var(--text-primary)]">{cat.name}</span>
                      <span className="ml-2 text-[11px] text-[var(--text-quaternary)]">
                        /{cat.slug}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]">
                      {cat.postsCount ?? 0} {t('blog.posts_count_unit')}
                    </span>
                    <IconButton
                      label={t('common.edit')}
                      size="sm"
                      onClick={() => handleStartEdit(cat)}
                    >
                      <Edit2 size={13} />
                    </IconButton>
                    <IconButton
                      label={t('common.delete')}
                      size="sm"
                      onClick={() => void handleDelete(cat)}
                      className="text-[var(--danger)]"
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
