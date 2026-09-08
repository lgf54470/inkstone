import { useState } from 'react'
import { Edit2, Folder, Plus, Trash2 } from 'lucide-react'
import type { BlogLinkCategory } from '@shared/types'
import { Modal, confirm } from '../../../components/overlay'
import { Button, IconButton } from '../../../components/primitives'
import { Input, Select } from '../../../components/form'
import { t } from '../../../lib/i18n'

export interface LinkCategoryModalProps {
  open: boolean
  onClose: () => void
  categories: BlogLinkCategory[]
  onCreateCategory: (data: { name: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<BlogLinkCategory | null>
  onUpdateCategory: (id: string, patch: { name?: string; icon?: string | null; parentId?: string | null; sortOrder?: number }) => Promise<void>
  onDeleteCategory: (id: string) => Promise<void>
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

async function confirmAndDeleteCategory(cat: BlogLinkCategory, onDelete: (id: string) => Promise<void>) {
  const ok = await confirm({ title: t('common.delete'), description: t('blog.confirm_delete_link'), confirmLabel: t('common.delete'), tone: 'danger' })
  if (ok) await onDelete(cat.id)
}

function useCategoryModalState(props: LinkCategoryModalProps) {
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

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim()) return
    await props.onUpdateCategory(id, { name: editName.trim(), icon: editIcon.trim() || null, parentId: editParentId || null })
    setEditingCatId(null)
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      await props.onCreateCategory({ name: newName.trim(), icon: newIcon.trim() || null, parentId: newParentId || null })
      setNewName(''); setNewIcon(''); setNewParentId('')
    } finally {
      setCreating(false)
    }
  }

  return {
    editingCatId, setEditingCatId, editName, setEditName, editIcon, setEditIcon, editParentId, setEditParentId,
    newName, setNewName, newIcon, setNewIcon, newParentId, setNewParentId, creating, rootCategories, parentSelectOptions,
    handleStartEdit, handleSaveEdit, handleCreate, handleDelete: (cat: BlogLinkCategory) => void confirmAndDeleteCategory(cat, props.onDeleteCategory),
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
  return (
    <form onSubmit={onSubmit} className='rounded-[var(--r-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3 space-y-3'>
      <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-secondary)]'>
        {t('blog.link_category_add_root')}
      </span>
      <div className='grid grid-cols-3 gap-2'>
        <Input value={name} onChange={(e) => onChangeName(e.target.value)} placeholder={t('blog.link_category_name')} required />
        <Input value={icon} onChange={(e) => onChangeIcon(e.target.value)} placeholder={t('blog.link_category_icon')} />
        <Select value={parentId} onChange={(e) => onChangeParentId(e.target.value)}>
          {parentOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
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
  rootCategories, categories, editingCatId, editName, editIcon, editParentId,
  parentOptions, onStartEdit, onChangeName, onChangeIcon, onChangeParent,
  onSaveEdit, onCancelEdit, onDelete,
}: {
  rootCategories: BlogLinkCategory[]
  categories: BlogLinkCategory[]
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
  root, categories, editingCatId, editName, editIcon, editParentId,
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
          onSave={() => onSaveEdit(root.id)}
          onCancel={onCancelEdit}
        />
      ) : (
        <CategoryRowItem cat={root} onStartEdit={() => onStartEdit(root)} onDelete={() => onDelete(root)} />
      )}

      {children.length > 0 && (
        <SubCategoryList
          childrenList={children}
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
  childrenList, editingCatId, editName, editIcon, editParentId, parentOptions,
  onChangeName, onChangeIcon, onChangeParent, onSaveEdit, onCancelEdit, onStartEdit, onDelete,
}: {
  childrenList: BlogLinkCategory[]
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
            onSave={() => onSaveEdit(sub.id)}
            onCancel={onCancelEdit}
          />
        ) : (
          <CategoryRowItem key={sub.id} cat={sub} isSub onStartEdit={() => onStartEdit(sub)} onDelete={() => onDelete(sub)} />
        ),
      )}
    </div>
  )
}

function CategoryRowItem({
  cat,
  isSub = false,
  onStartEdit,
  onDelete,
}: {
  cat: BlogLinkCategory
  isSub?: boolean
  onStartEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className='flex items-center justify-between py-1 px-1.5 rounded hover:bg-[var(--bg-hover)]'>
      <div className='flex items-center gap-2'>
        <Folder size={isSub ? 13 : 15} className='text-[var(--accent)]' />
        <span className='text-[length:var(--text-12)] font-medium text-[var(--text-primary)]'>
          {cat.name}
        </span>
        {cat.icon && (
          <span className='text-[length:var(--text-10)] text-[var(--text-tertiary)] bg-[var(--bg-sunken)] px-1 py-0.5 rounded'>
            {cat.icon}
          </span>
        )}
      </div>
      <div className='flex items-center gap-1'>
        <IconButton label={t('common.edit')} size='sm' onClick={onStartEdit}>
          <Edit2 size={13} />
        </IconButton>
        <IconButton label={t('common.delete')} size='sm' onClick={onDelete} className='hover:text-[var(--danger)]'>
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
  onChangeName: (v: string) => void
  onChangeIcon: (v: string) => void
  onChangeParent: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className='flex items-center gap-2 p-1 bg-[var(--bg-sunken)] rounded'>
      <Input value={name} onChange={(e) => onChangeName(e.target.value)} className='h-8 text-[length:var(--text-12)] flex-1' />
      <Input value={icon} onChange={(e) => onChangeIcon(e.target.value)} placeholder={t('blog.link_category_icon')} className='h-8 text-[length:var(--text-12)] w-24' />
      <Select value={parentId} onChange={(e) => onChangeParent(e.target.value)} className='h-8 text-[length:var(--text-12)] w-32'>
        {parentOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Button type='button' variant='primary' size='sm' onClick={onSave} disabled={!name.trim()}>
        {t('common.save')}
      </Button>
      <Button type='button' variant='ghost' size='sm' onClick={onCancel}>
        {t('common.cancel')}
      </Button>
    </div>
  )
}
