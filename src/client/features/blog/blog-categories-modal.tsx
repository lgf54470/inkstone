import { useState, type FormEvent, type ReactNode } from 'react'
import { Check, Edit2, FolderPlus, Trash2, X } from 'lucide-react'
import type { BlogCategory } from '@shared/types'
import { BLOG_CATEGORY_COLORS } from '@shared/organizer-colors'
import { Button, IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { Modal, confirm } from '../../components/overlay'
import { errorMessage } from '../../lib/errors'
import { t } from '../../lib/i18n'
import type { UiState } from '../../store/ui'
import { useUi } from '../../store/ui'
import { useBlogStore, type BlogStoreState } from './blog-store'

const MODAL_WIDTH = 560

export function BlogCategoriesModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useUi((s) => s.toast)
  const categories = useBlogStore((s) => s.categories)
  const deleteCategory = useBlogStore((s) => s.deleteCategory)
  const createCategory = useBlogStore((s) => s.createCategory)
  const updateCategory = useBlogStore((s) => s.updateCategory)

  const form = useCategoryForm(toast, createCategory, updateCategory)
  const handleDelete = (cat: BlogCategory) => deleteCategoryFlow(cat, deleteCategory, toast)

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={MODAL_WIDTH}
      className='p-0 overflow-hidden'
    >
      <CategoriesModalHeader onClose={onClose} />

      <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5 text-[length:var(--text-12\.5)]">
        <CategoriesForm
          bundle={{
            ...form,
          }}
        />

        <CategoriesList
          bundle={{
            categories,
            onEdit: form.handleStartEdit,
            onDelete: handleDelete,
          }}
        />
      </div>
    </Modal>
  )
}

function useCategoryForm(
  toast: UiState['toast'],
  createCategory: BlogStoreState['createCategory'],
  updateCategory: BlogStoreState['updateCategory'],
): CategoryFormBundle {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [selectedColor, setSelectedColor] = useState<string>(BLOG_CATEGORY_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleStartEdit = (cat: BlogCategory) => {
    setEditingId(cat.id)
    setName(cat.name)
    setSlug(cat.slug)
    setDescription(cat.description || '')
    setSelectedColor(cat.color || BLOG_CATEGORY_COLORS[0])
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setName('')
    setSlug('')
    setDescription('')
  }

  const handleSubmit = (e: FormEvent) => submitCategoryForm(e, {
    name, slug, description, selectedColor, editingId,
    setIsSaving, setEditingId, setName, setSlug, setDescription,
    toast, createCategory, updateCategory,
  })

  return {
    name, setName, slug, setSlug, description, setDescription,
    selectedColor, setSelectedColor, editingId, isSaving,
    handleStartEdit,
    onSubmit: handleSubmit,
    onCancelEdit: handleCancelEdit,
  }
}

function CategoriesModalHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className='flex h-12 items-center justify-between border-b border-[var(--border-subtle)] px-4 bg-[var(--bg-surface)]'>
      <div className='flex items-center gap-2'>
        <FolderPlus size={16} className='text-[var(--accent)]' />
        <h2 className='text-[length:var(--text-14)] font-semibold text-[var(--text-primary)]'>
          {t('blog.categories')}
        </h2>
      </div>
      <IconButton label={t('common.close')} size='sm' onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  )
}

interface CategoryFormBundle {
  name: string
  setName: (v: string) => void
  slug: string
  setSlug: (v: string) => void
  description: string
  setDescription: (v: string) => void
  selectedColor: string
  setSelectedColor: (v: string) => void
  editingId: string | null
  isSaving: boolean
  handleStartEdit: (cat: BlogCategory) => void
  onSubmit: (e: FormEvent) => void
  onCancelEdit: () => void
}

function CategoriesForm({ bundle }: { bundle: CategoryFormBundle }) {
  return (
    <form onSubmit={bundle.onSubmit} className='rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-3'>
      <div className='flex items-center justify-between'>
        <span className='font-semibold text-[var(--text-primary)]'>
          {bundle.editingId ? t('blog.edit_category') : t('blog.add_category')}
        </span>
        {bundle.editingId && (
          <button
            type='button'
            onClick={bundle.onCancelEdit}
            className='text-[length:var(--text-11)] text-[var(--text-quaternary)] hover:text-[var(--text-primary)]'
          >
            {t('common.cancel')}
          </button>
        )}
      </div>

      <div className='grid grid-cols-2 gap-3'>
        <CategoryField label={t('blog.category_name')}>
          <Input
            value={bundle.name}
            onChange={(e) => bundle.setName(e.target.value)}
            placeholder={t('blog.category_name_placeholder')}
            autoFocus
          />
        </CategoryField>
        <CategoryField label={t('blog.category_slug')}>
          <Input
            value={bundle.slug}
            onChange={(e) => bundle.setSlug(slugify(e.target.value))}
            placeholder='tech'
          />
        </CategoryField>
      </div>

      <CategoryColorField selected={bundle.selectedColor} onSelect={bundle.setSelectedColor} />

      <div className='flex justify-end pt-1'>
        <Button variant='primary' size='sm' type='submit' loading={bundle.isSaving}>
          {bundle.editingId ? t('common.save') : t('blog.add_tag')}
        </Button>
      </div>
    </form>
  )
}

function CategoryField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[length:var(--text-11\.5)] font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  )
}

function CategoryColorField({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-[length:var(--text-11\.5)] font-medium text-[var(--text-secondary)]">
        {t('blog.category_color')}
      </label>
      <CategoryColorPicker selected={selected} onSelect={onSelect} />
    </div>
  )
}

function CategoryColorPicker({ selected, onSelect }: { selected: string; onSelect: (c: string) => void }) {
  return (
    <div className='flex items-center gap-2'>
      {BLOG_CATEGORY_COLORS.map((c) => (
        <button
          key={c}
          type='button'
          onClick={() => onSelect(c)}
          className={`size-6 rounded-full flex items-center justify-center transition-transform ${
            selected === c ? 'scale-110 ring-2 ring-[var(--accent)] ring-offset-2' : ''
          }`}
          style={{ backgroundColor: c }}
        >
          {selected === c && <Check size={12} className='text-white' />}
        </button>
      ))}
    </div>
  )
}

interface CategoryListBundle {
  categories: BlogCategory[]
  onEdit: (cat: BlogCategory) => void
  onDelete: (cat: BlogCategory) => void
}

function CategoriesList({ bundle }: { bundle: CategoryListBundle }) {
  return (
    <div className='space-y-2'>
      <h3 className='font-semibold text-[length:var(--text-13)] text-[var(--text-secondary)]'>
        {t('blog.existing_categories')} ({bundle.categories.length})
      </h3>

      <div className='divide-y divide-[var(--border-subtle)] rounded-[var(--r-lg)] border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden'>
        {bundle.categories.length === 0 ? (
          <div className='p-6 text-center text-[var(--text-quaternary)]'>
            {t('blog.no_categories_hint')}
          </div>
        ) : (
          bundle.categories.map((cat) => (
            <CategoryListItem
              key={cat.id}
              cat={cat}
              onEdit={bundle.onEdit}
              onDelete={bundle.onDelete}
            />
          ))
        )}
      </div>
    </div>
  )
}

function CategoryListItem({
  cat,
  onEdit,
  onDelete,
}: {
  cat: BlogCategory
  onEdit: (cat: BlogCategory) => void
  onDelete: (cat: BlogCategory) => void
}) {
  return (
    <div className='flex items-center justify-between p-3 transition-colors hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center gap-2.5'>
        <span
          className='size-3 rounded-full'
          style={{ backgroundColor: cat.color || 'var(--accent)' }}
        />
        <div>
          <span className='font-medium text-[var(--text-primary)]'>{cat.name}</span>
          <span className='ml-2 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
            /{cat.slug}
          </span>
        </div>
      </div>

      <div className='flex items-center gap-3'>
        <span className='rounded-full bg-[var(--bg-sunken)] px-2 py-0.5 text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
          {cat.postsCount ?? 0} {t('blog.posts_count_unit')}
        </span>
        <IconButton label={t('common.edit')} size='sm' onClick={() => onEdit(cat)}>
          <Edit2 size={13} />
        </IconButton>
        <IconButton
          label={t('common.delete')}
          size='sm'
          onClick={() => onDelete(cat)}
          className='text-[var(--danger)]'
        >
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  )
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

interface CategoryFormCtx {
  name: string
  slug: string
  description: string
  selectedColor: string
  editingId: string | null
  setIsSaving: (v: boolean) => void
  setEditingId: (v: string | null) => void
  setName: (v: string) => void
  setSlug: (v: string) => void
  setDescription: (v: string) => void
  toast: UiState['toast']
  createCategory: BlogStoreState['createCategory']
  updateCategory: BlogStoreState['updateCategory']
}

async function submitCategoryForm(e: FormEvent, ctx: CategoryFormCtx): Promise<void> {
  e.preventDefault()
  if (!ctx.name.trim()) return

  ctx.setIsSaving(true)
  try {
    if (ctx.editingId) {
      await ctx.updateCategory(ctx.editingId, {
        name: ctx.name.trim(),
        slug: ctx.slug.trim(),
        description: ctx.description.trim(),
        color: ctx.selectedColor,
      })
      ctx.toast({ title: t('common.saved'), tone: 'success' })
    } else {
      await ctx.createCategory({
        name: ctx.name.trim(),
        slug: ctx.slug.trim() || undefined,
        description: ctx.description.trim(),
        color: ctx.selectedColor,
      })
      ctx.toast({ title: t('common.created'), tone: 'success' })
    }
    ctx.setEditingId(null)
    ctx.setName('')
    ctx.setSlug('')
    ctx.setDescription('')
  } catch (error: unknown) {
    ctx.toast({ title: errorMessage(error) || t('common.action_failed'), tone: 'danger' })
  } finally {
    ctx.setIsSaving(false)
  }
}

async function deleteCategoryFlow(
  cat: BlogCategory,
  deleteCategory: BlogStoreState['deleteCategory'],
  toast: UiState['toast'],
): Promise<void> {
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