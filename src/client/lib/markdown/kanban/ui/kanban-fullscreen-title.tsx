import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { t } from '../../../i18n'

/**
 * The board's title, and the one place it is written from the full screen view. It lives beside the
 * header rather than inside it because the two halves of the edit — a heading that turns into an
 * input and back — are a control of their own: the header only decides where it stands.
 */
function KanbanFullscreenTitleEditor({
  value,
  onChange,
  onFinish,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onFinish: () => void
  onCancel: () => void
}) {
  return (
    <input
      type='text'
      data-owns-escape='true'
      value={value}
      autoFocus
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onFinish}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onFinish()
        else if (e.key === 'Escape') onCancel()
      }}
      className='min-w-28 max-w-56 rounded-[var(--r-md)] border border-[var(--accent)] bg-[var(--bg-inset)] px-2 py-0.5 text-[length:var(--text-14)] font-bold text-[var(--text-primary)] outline-none'
    />
  )
}

function KanbanFullscreenTitleView({
  title,
  canEdit,
  onStartEdit,
}: {
  title?: string
  canEdit: boolean
  onStartEdit: (e?: React.MouseEvent) => void
}) {
  return (
    <div className='group flex items-center gap-1 min-w-0'>
      <h2
        onDoubleClick={onStartEdit}
        className={`text-[length:var(--text-14)] font-bold tracking-[var(--tracking-title)] text-[var(--text-primary)] max-w-44 truncate select-none ${
          canEdit ? 'cursor-pointer hover:opacity-80' : ''
        }`}
        title={title || t('preview.kanban_untitled')}
      >
        {title || t('preview.kanban_untitled')}
      </h2>
      {canEdit && (
        <button
          type='button'
          onClick={onStartEdit}
          className='opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity p-0.5 rounded-[var(--r-xs)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
          title={t('common.edit')}
          aria-label={t('common.edit')}
        >
          <Pencil size={11} aria-hidden />
        </button>
      )}
    </div>
  )
}

export function KanbanFullscreenTitle({
  title,
  onUpdateTitle,
}: {
  title?: string
  onUpdateTitle?: (title: string) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [val, setVal] = useState(title || '')

  useEffect(() => {
    if (!isEditing) setVal(title || '')
  }, [title, isEditing])

  const handleFinish = () => {
    setIsEditing(false)
    const trimmed = val.trim()
    if (trimmed && trimmed !== title) onUpdateTitle?.(trimmed)
    else setVal(title || '')
  }

  const startEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!onUpdateTitle) return
    setVal(title || '')
    setIsEditing(true)
  }

  if (isEditing && onUpdateTitle) {
    return (
      <KanbanFullscreenTitleEditor
        value={val}
        onChange={setVal}
        onFinish={handleFinish}
        onCancel={() => {
          setVal(title || '')
          setIsEditing(false)
        }}
      />
    )
  }

  return (
    <KanbanFullscreenTitleView
      title={title}
      canEdit={Boolean(onUpdateTitle)}
      onStartEdit={startEditing}
    />
  )
}
