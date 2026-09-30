import { useState } from 'react'
import { Edit2, Folder, Palette, Plus, Trash2 } from 'lucide-react'
import type { BlogLinkCategory } from '@shared/types'
import { Modal, confirm } from '../../../components/overlay'
import { Button, IconButton } from '../../../components/primitives'
import { Input, Select } from '../../../components/form'
import { t } from '../../../lib/i18n'
import { useUi, type UiState } from '../../../store/ui'
import { LinkDynamicIcon } from './link-dynamic-icon'
import { LinkIconSelector } from './link-icon-selector'

export interface LinkCategoryModalProps {
  open: boolean
  onClose: () => void
  categories: BlogLinkCategory[]
  onCreateCategory: (data: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<BlogLinkCategory | null>
  onUpdateCategory: (id: string, patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<boolean>
  onDeleteCategory: (id: string) => Promise<boolean>
}

const MODAL_WIDTH = 600

export function LinkCategoryModal(props: LinkCategoryModalProps) {
  const state = useCategoryModalState(props)

  return (
    <Modal open={props.open} onClose={props.onClose} title={t('blog.link_categories_mgmt')} width={MODAL_WIDTH}>
      <div className='space-y-5 py-1'>
        <CategoryCreateForm
          name={state.newName}
          icon={state.newIcon}
          parentId={state.newParentId}
          parentOptions={state.parentSelectOptions}
          creating={state.creating}
          onChangeName={state.setNewName}
          onChangeIcon={state.setNewIcon}
          onChangeParentId={state.setNewParentId}
          onSubmit={state.handleCreate}
        />
        <CategoryTreeSection
          rootCategories={state.rootCategories}
          categories={props.categories}
          busyId={state.busyId}
          editingCatId={state.editingCatId}
          editName={state.editName}
          editIcon={state.editIcon}
          editParentId={state.editParentId}
          parentOptions={state.parentSelectOptions}
          onStartEdit={state.handleStartEdit}
          onChangeName={state.setEditName}
          onChangeIcon={state.setEditIcon}
          onChangeParent={state.setEditParentId}
          onSaveEdit={(id) => void state.handleSaveEdit(id)}
          onCancelEdit={() => state.setEditingCatId(null)}
          onDelete={(cat) => void state.handleDelete(cat)}
        />
      </div>
    </Modal>
  )
}

/**
 * What a category action asks before it runs. It names the category and says what the server does to
 * the rows around it — this used to reuse the delete-a-link question, which answered neither.
 */
export function linkCategoryDeletePrompt(cat: BlogLinkCategory): { title: string; description: string } {
  return {
    title: t('common.delete'),
    description: t('blog.confirm_delete_link_category', { value0: cat.name }),
  }
}

function useCategoryModalState(props: LinkCategoryModalProps) {
  const toast = useUi((s) => s.toast)
  // The one category being written right now: its row stops accepting a second click while its
  // answer is in flight, and the success sentence is announced once the store says it landed (the
  // failure sentence comes from the store layer, which holds the error it saw).
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editParentId, setEditParentId] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('')
  const [newParentId, setNewParentId] = useState<string>('')
  const [creating, setCreating] = useState(false)

  const rootCategories = props.categories.filter((c) => !c.parentId)
  const parentSelectOptions = [
    { value: '', label: t('blog.link_category_add_root') },
    ...rootCategories.map((c) => ({ value: c.id, label: c.name })),
  ]

  const handleStartEdit = (cat: BlogLinkCategory) => {
    setEditingCatId(cat.id); setEditName(cat.name); setEditIcon(cat.icon || ''); setEditParentId(cat.parentId || '')
  }

  const ctx: CategoryActionCtx = {
    ...props, toast, setBusyId, setEditingCatId, setCreating,
    resetCreateForm: () => { setNewName(''); setNewIcon(''); setNewParentId('') },
    editName, editIcon, editParentId, newName, newIcon, newParentId,
  }

  return {
    editingCatId, setEditingCatId, editName, setEditName, editIcon, setEditIcon, editParentId, setEditParentId,
    newName, setNewName, newIcon, setNewIcon, newParentId, setNewParentId, creating, rootCategories, parentSelectOptions,
    busyId, handleStartEdit,
    handleSaveEdit: (id: string) => void saveCategoryEdit(id, ctx),
    handleCreate: (e: React.FormEvent) => void createCategoryFromForm(e, ctx),
    handleDelete: (cat: BlogLinkCategory) => void deleteCategoryFlow(cat, ctx),
  }
}

/** The modal's state and callbacks, handed to the three actions below so each stays a small unit. */
interface CategoryActionCtx extends LinkCategoryModalProps {
  toast: UiState['toast']
  setBusyId: (id: string | null) => void
  setEditingCatId: (id: string | null) => void
  setCreating: (value: boolean) => void
  resetCreateForm: () => void
  editName: string
  editIcon: string
  editParentId: string
  newName: string
  newIcon: string
  newParentId: string
}

async function saveCategoryEdit(id: string, ctx: CategoryActionCtx): Promise<void> {
  if (!ctx.editName.trim()) return
  ctx.setBusyId(id)
  try {
    const saved = await ctx.onUpdateCategory(id, {
      name: ctx.editName.trim(), icon: ctx.editIcon.trim() || null, parentId: ctx.editParentId || null,
    })
    // A failure keeps the row in edit mode: it still holds the reader's unsaved words.
    if (!saved) return
    ctx.setEditingCatId(null)
    ctx.toast({ title: t('common.saved'), tone: 'success' })
  } finally {
    ctx.setBusyId(null)
  }
}

async function createCategoryFromForm(e: React.FormEvent, ctx: CategoryActionCtx): Promise<void> {
  e.preventDefault()
  if (!ctx.newName.trim()) return
  ctx.setCreating(true)
  try {
    const created = await ctx.onCreateCategory({
      name: ctx.newName.trim(), icon: ctx.newIcon.trim() || null, parentId: ctx.newParentId || null,
    })
    if (!created) return
    ctx.resetCreateForm()
    ctx.toast({ title: t('common.created'), tone: 'success' })
  } finally {
    ctx.setCreating(false)
  }
}

async function deleteCategoryFlow(cat: BlogLinkCategory, ctx: CategoryActionCtx): Promise<void> {
  const ok = await confirm({ ...linkCategoryDeletePrompt(cat), confirmLabel: t('common.delete'), tone: 'danger' })
  if (!ok) return
  ctx.setBusyId(cat.id)
  try {
    const deleted = await ctx.onDeleteCategory(cat.id)
    if (deleted) ctx.toast({ title: t('common.delete'), tone: 'success' })
  } finally {
    ctx.setBusyId(null)
  }
}

function CategoryCreateForm({
  name, icon, parentId, parentOptions, creating,
  onChangeName, onChangeIcon, onChangeParentId, onSubmit,
}: {
  name: string
  icon: string
  parentId: string
  parentOptions: Array<{ value: string; label: string }>
  creating: boolean
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParentId: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  return (
    <form onSubmit={onSubmit} className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3 space-y-3'>
      <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        {t('blog.link_category_add_root')}
      </span>
      <div className='grid grid-cols-1 sm:grid-cols-3 gap-2'>
        <Input value={name} onChange={(e) => onChangeName(e.target.value)} placeholder={t('blog.link_category_name')} required />
        <div className='flex gap-1 items-center'>
          <div className='size-8 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0'>
            <LinkDynamicIcon icon={icon} size={16} fallback={<Folder size={16} className='text-[var(--text-tertiary)]' />} />
          </div>
          <Input value={icon} onChange={(e) => onChangeIcon(e.target.value)} placeholder={t('blog.link_category_icon')} className='flex-1 min-w-0' />
          <Button type='button' variant='secondary' size='sm' onClick={() => setShowPicker(!showPicker)}>
            <Palette size={13} />
          </Button>
        </div>
        <Select value={parentId} onChange={(e) => onChangeParentId(e.target.value)}>
          {parentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      {showPicker && (
        <LinkIconSelector
          value={icon}
          onChange={(val) => {
            onChangeIcon(val)
            setShowPicker(false)
          }}
        />
      )}
      <div className='flex justify-end'>
        <Button type='submit' variant='primary' size='sm' loading={creating} disabled={!name.trim()}>
          <Plus size={14} />
          {t('blog.link_add_category')}
        </Button>
      </div>
    </form>
  )
}

function CategoryTreeSection({
  rootCategories, categories, busyId, editingCatId, editName, editIcon, editParentId,
  parentOptions, onStartEdit, onChangeName, onChangeIcon, onChangeParent,
  onSaveEdit, onCancelEdit, onDelete,
}: {
  rootCategories: BlogLinkCategory[]
  categories: BlogLinkCategory[]
  busyId: string | null
  editingCatId: string | null
  editName: string
  editIcon: string
  editParentId: string
  parentOptions: Array<{ value: string; label: string }>
  onStartEdit: (cat: BlogLinkCategory) => void
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParent: (v: string) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (cat: BlogLinkCategory) => void
}) {
  return (
    <div className='max-h-80 overflow-y-auto space-y-2'>
      {rootCategories.map((root) => (
        <RootCategoryBlock
          key={root.id}
          root={root}
          categories={categories}
          busyId={busyId}
          editingCatId={editingCatId}
          editName={editName}
          editIcon={editIcon}
          editParentId={editParentId}
          parentOptions={parentOptions}
          onStartEdit={onStartEdit}
          onChangeName={onChangeName}
          onChangeIcon={onChangeIcon}
          onChangeParent={onChangeParent}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

interface RootCategoryBlockProps {
  root: BlogLinkCategory
  categories: BlogLinkCategory[]
  busyId: string | null
  editingCatId: string | null
  editName: string
  editIcon: string
  editParentId: string
  parentOptions: Array<{ value: string; label: string }>
  onStartEdit: (cat: BlogLinkCategory) => void
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParent: (v: string) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDelete: (cat: BlogLinkCategory) => void
}

function RootCategoryBlock({
  root, categories, busyId, editingCatId, editName, editIcon, editParentId,
  parentOptions, onStartEdit, onChangeName, onChangeIcon, onChangeParent,
  onSaveEdit, onCancelEdit, onDelete,
}: RootCategoryBlockProps) {
  const children = categories.filter((c) => c.parentId === root.id)
  return (
    <div className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-2 space-y-1.5'>
      {editingCatId === root.id ? (
        <InlineCategoryEdit
          name={editName}
          icon={editIcon}
          parentId={editParentId}
          parentOptions={parentOptions.filter((o) => o.value !== root.id)}
          onChangeName={onChangeName}
          onChangeIcon={onChangeIcon}
          onChangeParent={onChangeParent}
          saving={busyId === root.id}
          onSave={() => onSaveEdit(root.id)}
          onCancel={onCancelEdit}
        />
      ) : (
        <CategoryRowItem cat={root} busy={busyId === root.id} onStartEdit={() => onStartEdit(root)} onDelete={() => onDelete(root)} />
      )}

      {children.length > 0 && (
        <SubCategoryList
          childrenList={children}
          busyId={busyId}
          editingCatId={editingCatId}
          editName={editName}
          editIcon={editIcon}
          editParentId={editParentId}
          parentOptions={parentOptions}
          onChangeName={onChangeName}
          onChangeIcon={onChangeIcon}
          onChangeParent={onChangeParent}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onStartEdit={onStartEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  )
}

function SubCategoryList({
  childrenList, busyId, editingCatId, editName, editIcon, editParentId, parentOptions,
  onChangeName, onChangeIcon, onChangeParent, onSaveEdit, onCancelEdit, onStartEdit, onDelete,
}: {
  childrenList: BlogLinkCategory[]
  busyId: string | null
  editingCatId: string | null
  editName: string
  editIcon: string
  editParentId: string
  parentOptions: Array<{ value: string; label: string }>
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParent: (v: string) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onStartEdit: (cat: BlogLinkCategory) => void
  onDelete: (cat: BlogLinkCategory) => void
}) {
  return (
    <div className='pl-6 space-y-1 border-l border-[var(--border-subtle)] ml-3'>
      {childrenList.map((sub) =>
        editingCatId === sub.id ? (
          <InlineCategoryEdit
            key={sub.id}
            name={editName}
            icon={editIcon}
            parentId={editParentId}
            parentOptions={parentOptions.filter((o) => o.value !== sub.id)}
            onChangeName={onChangeName}
            onChangeIcon={onChangeIcon}
            onChangeParent={onChangeParent}
            saving={busyId === sub.id}
            onSave={() => onSaveEdit(sub.id)}
            onCancel={onCancelEdit}
          />
        ) : (
          <CategoryRowItem key={sub.id} cat={sub} isSub busy={busyId === sub.id} onStartEdit={() => onStartEdit(sub)} onDelete={() => onDelete(sub)} />
        ),
      )}
    </div>
  )
}

function CategoryRowItem({
  cat,
  isSub = false,
  busy = false,
  onStartEdit,
  onDelete,
}: {
  cat: BlogLinkCategory
  isSub?: boolean
  busy?: boolean
  onStartEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className='flex items-center justify-between py-1 px-1.5 rounded hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center gap-2 min-w-0'>
        <div className='size-5 flex items-center justify-center shrink-0'>
          <LinkDynamicIcon
            icon={cat.icon || undefined}
            size={isSub ? 13 : 15}
            fallback={<Folder size={isSub ? 13 : 15} className='text-[var(--accent)]' />}
          />
        </div>
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)] truncate'>
          {cat.name}
        </span>
        {cat.icon && (
          <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)] bg-[var(--bg-sunken)] px-1 py-0.5 rounded truncate max-w-24'>
            {cat.icon}
          </span>
        )}
      </div>
      <div className='flex items-center gap-1 shrink-0'>
        <IconButton label={t('common.edit')} size='sm' disabled={busy} onClick={onStartEdit}>
          <Edit2 size={13} />
        </IconButton>
        <IconButton label={t('common.delete')} size='sm' disabled={busy} onClick={onDelete} className='hover:text-[var(--danger)]'>
          <Trash2 size={13} />
        </IconButton>
      </div>
    </div>
  )
}

function InlineCategoryEdit({
  name,
  icon,
  parentId,
  parentOptions,
  saving,
  onChangeName,
  onChangeIcon,
  onChangeParent,
  onSave,
  onCancel,
}: {
  name: string
  icon: string
  parentId: string
  parentOptions: Array<{ value: string; label: string }>
  saving: boolean
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParent: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const [showPicker, setShowPicker] = useState(false)
  return (
    <div className='space-y-2 p-1.5 bg-[var(--bg-sunken)] rounded'>
      <div className='flex items-center gap-2 flex-wrap sm:flex-nowrap'>
        <Input value={name} onChange={(e) => onChangeName(e.target.value)} className='h-8 text-[length:var(--text-12)] flex-1 min-w-30' />
        <div className='flex gap-1 items-center w-36 shrink-0'>
          <div className='size-8 flex items-center justify-center rounded-[var(--r-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] shrink-0'>
            <LinkDynamicIcon icon={icon} size={14} fallback={<Folder size={14} className='text-[var(--text-tertiary)]' />} />
          </div>
          <Input value={icon} onChange={(e) => onChangeIcon(e.target.value)} placeholder={t('blog.link_category_icon')} className='h-8 text-[length:var(--text-12)] flex-1 min-w-0' />
          <Button type='button' variant='secondary' size='sm' onClick={() => setShowPicker(!showPicker)}>
            <Palette size={13} />
          </Button>
        </div>
        <Select value={parentId} onChange={(e) => onChangeParent(e.target.value)} className='h-8 text-[length:var(--text-12)] w-28 shrink-0'>
          {parentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Button type='button' variant='primary' size='sm' loading={saving} onClick={onSave} disabled={!name.trim() || saving}>
          {t('common.save')}
        </Button>
        <Button type='button' variant='ghost' size='sm' disabled={saving} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      {showPicker && (
        <LinkIconSelector
          value={icon}
          onChange={(val) => {
            onChangeIcon(val)
            setShowPicker(false)
          }}
        />
      )}
    </div>
  )
}
