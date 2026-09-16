import { useRef, useState } from 'react'
import { CheckSquare, MoreHorizontal, Plus, Square } from 'lucide-react'
import { t } from '../../../i18n'
import type { KanbanSubtask } from '../types'
import { KanbanSubtaskMenu } from './kanban-subtask-menu'

interface KanbanSubtaskListProps {
  subtasks: KanbanSubtask[]
  onUpdateSubtasks: (nextSubtasks: KanbanSubtask[]) => void
  onConvertToItem?: (subtask: KanbanSubtask) => void
}

function SubtaskRow({
  subtask,
  onToggle,
  onUpdateTitle,
  onDuplicate,
  onConvertToItem,
  onDelete,
}: {
  subtask: KanbanSubtask
  onToggle: () => void
  onUpdateTitle: (title: string) => void
  onDuplicate: () => void
  onConvertToItem: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuBtnRef = useRef<HTMLButtonElement>(null)

  return (
    <div className='group/sub flex items-center gap-1.5 rounded-[var(--r-xs)] px-1.5 py-1 text-[length:var(--text-12)] hover:bg-[var(--bg-hover)]'>
      <button
        type='button'
        onClick={onToggle}
        className='shrink-0 text-[var(--text-tertiary)] hover:text-[var(--accent)]'
        aria-label={subtask.completed ? 'Mark incomplete' : 'Mark complete'}
      >
        {subtask.completed ? <CheckSquare size={13} className='text-[var(--accent)]' /> : <Square size={13} />}
      </button>

      <input
        type='text'
        defaultValue={subtask.title}
        onBlur={(e) => {
          if (e.target.value !== subtask.title) {
            onUpdateTitle(e.target.value)
          }
        }}
        className={`flex-1 border-none bg-transparent p-0 text-[length:var(--text-12)] outline-none ${
          subtask.completed ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--text-secondary)]'
        }`}
      />

      <div className='relative'>
        <button
          ref={menuBtnRef}
          type='button'
          onClick={() => setMenuOpen((o) => !o)}
          className='opacity-0 transition-opacity p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] group-hover/sub:opacity-100'
        >
          <MoreHorizontal size={13} />
        </button>
        <KanbanSubtaskMenu
          open={menuOpen}
          subtask={subtask}
          anchorRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          onDuplicate={onDuplicate}
          onConvertToItem={onConvertToItem}
          onDelete={onDelete}
        />
      </div>
    </div>
  )
}

function AddSubtaskForm({ onAdd }: { onAdd: (title: string) => void }) {
  const [newTitle, setNewTitle] = useState('')

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed) return
    onAdd(trimmed)
    setNewTitle('')
  }

  return (
    <form onSubmit={handleAdd} className='mt-0.5 flex items-center gap-1.5 px-1.5 py-0.5'>
      <Plus size={12} className='shrink-0 text-[var(--text-tertiary)]' />
      <input
        type='text'
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        placeholder={t('preview.kanban_add_subtask')}
        className='w-full border-none bg-transparent p-0 text-[length:var(--text-11)] text-[var(--text-tertiary)] placeholder:text-[var(--text-quaternary)] outline-none focus:text-[var(--text-primary)]'
      />
    </form>
  )
}

export function KanbanSubtaskList({
  subtasks,
  onUpdateSubtasks,
  onConvertToItem,
}: KanbanSubtaskListProps) {
  const handleToggle = (id: string) => {
    onUpdateSubtasks(subtasks.map((s) => (s.id === id ? { ...s, completed: !s.completed } : s)))
  }

  const handleUpdateTitle = (id: string, title: string) => {
    onUpdateSubtasks(subtasks.map((s) => (s.id === id ? { ...s, title } : s)))
  }

  const handleDuplicate = (st: KanbanSubtask) => {
    onUpdateSubtasks([...subtasks, { ...st, id: `sub_${Date.now()}` }])
  }

  const handleDelete = (id: string) => {
    onUpdateSubtasks(subtasks.filter((s) => s.id !== id))
  }

  return (
    <div className='flex flex-col gap-0.5 pt-1'>
      {subtasks.map((st) => (
        <SubtaskRow
          key={st.id}
          subtask={st}
          onToggle={() => handleToggle(st.id)}
          onUpdateTitle={(title) => handleUpdateTitle(st.id, title)}
          onDuplicate={() => handleDuplicate(st)}
          onConvertToItem={() => onConvertToItem?.(st)}
          onDelete={() => handleDelete(st.id)}
        />
      ))}

      <AddSubtaskForm
        onAdd={(title) =>
          onUpdateSubtasks([...subtasks, { id: `sub_${Date.now()}`, title, completed: false }])
        }
      />
    </div>
  )
}
