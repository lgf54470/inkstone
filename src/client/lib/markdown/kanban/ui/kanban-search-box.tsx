import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { t } from '../../../i18n'

// Each keystroke used to commit the whole dataset, so filtering re-ran and the
// undo history grew per character; the draft holds the box, the parent the query.
const SEARCH_DEBOUNCE_MS = 200

function useDebouncedSearch(value: string, commit: (next: string) => void) {
  const [draft, setDraft] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const committedRef = useRef(value)

  // A query set elsewhere (switching views, clearing filters) wins over the draft.
  useEffect(() => {
    if (value !== committedRef.current) setDraft(value)
  }, [value])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const handleChange = (next: string) => {
    setDraft(next)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      committedRef.current = next
      commit(next)
    }, SEARCH_DEBOUNCE_MS)
  }

  return { draft, handleChange }
}

export function KanbanSearchBox({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string
  onSearchChange: (q: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const { draft, handleChange } = useDebouncedSearch(searchQuery, onSearchChange)

  if (!isOpen) {
    return (
      <button
        type='button'
        onClick={() => setIsOpen(true)}
        className='inline-flex size-7 items-center justify-center rounded-[var(--r-md)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
        aria-label={t('preview.kanban_search')}
      >
        <Search size={14} />
      </button>
    )
  }

  return (
    <div className='flex items-center rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2 py-0.5'>
      <Search size={13} className='text-[var(--text-tertiary)]' />
      <input
        type='text'
        autoFocus
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={t('preview.kanban_search_placeholder')}
        className='w-28 border-0 bg-transparent px-1.5 text-[length:var(--text-12)] text-[var(--text-primary)] outline-none'
      />
    </div>
  )
}
