import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock3, Search, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { useClickOutside } from '../../components/overlay'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'

// Every store query write re-filters the library; typing must not pay for that per keystroke.
export const SEARCH_DEBOUNCE_MS = 200

// Store writes this box did not send (cleared elsewhere, another surface) must still adopt.
function useDebouncedText(value: string, send: (value: string) => void) {
  const [text, setText] = useState(value)
  const timerRef = useRef<number | null>(null)
  const lastSentRef = useRef(value)

  useEffect(() => {
    if (value !== lastSentRef.current) {
      lastSentRef.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
  }, [])

  const schedule = useCallback((next: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      lastSentRef.current = next
      send(next)
    }, SEARCH_DEBOUNCE_MS)
  }, [send])

  const flush = useCallback((next: string) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    lastSentRef.current = next
    send(next)
  }, [send])

  return { text, setText, schedule, flush }
}

export function SearchBox() {
  const query = useMusic((state) => state.query)
  const history = useMusic((state) => state.searchHistory)
  const setQuery = useMusic((state) => state.setQuery)
  const commitQuery = useMusic((state) => state.commitQuery)
  const clearSearchHistory = useMusic((state) => state.clearSearchHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const { text, setText, schedule, flush } = useDebouncedText(query, setQuery)
  const boxRef = useRef<HTMLDivElement>(null)
  useClickOutside([boxRef], historyOpen, () => setHistoryOpen(false))

  const runSearch = (value: string): void => {
    if (value) commitQuery(value)
    else flush('')
    setHistoryOpen(false)
  }

  return (
    <div ref={boxRef} className='relative w-60 md:w-72'>
      <Input
        leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
        value={text}
        aria-label={t('music.search_placeholder')}
        placeholder={t('music.search_placeholder')}
        className='h-8 text-[length:var(--text-12)]'
        onFocus={() => setHistoryOpen(true)}
        onChange={(event) => {
          setText(event.target.value)
          schedule(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') runSearch(text)
          if (event.key === 'Escape') setHistoryOpen(false)
        }}
      />
      {text && <SearchClearButton onClear={() => runSearch('')} />}
      {historyOpen && !text && history.length > 0 && (
        <SearchHistory
          history={history}
          onPick={runSearch}
          onClear={() => {
            clearSearchHistory()
            setHistoryOpen(false)
          }}
        />
      )}
    </div>
  )
}

function SearchClearButton({ onClear }: { onClear: () => void }) {
  return (
    <span className='absolute top-1/2 right-1 -translate-y-1/2'>
      <IconButton label={t('music.search_clear')} size='sm' onClick={onClear}><X size={12} /></IconButton>
    </span>
  )
}

function SearchHistory({
  history,
  onPick,
  onClear,
}: {
  history: string[]
  onPick: (value: string) => void
  onClear: () => void
}) {
  return (
    <div className='absolute top-full left-0 z-[var(--z-popover)] mt-1 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'>
      <div className='flex items-center justify-between px-2 py-1 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        <span>{t('music.search_history')}</span>
        <button type='button' onClick={onClear} className='rounded px-1 hover:text-[var(--text-secondary)]'>
          {t('music.search_clear_history')}
        </button>
      </div>
      {history.map((entry) => (
        <button
          key={entry}
          type='button'
          onClick={() => onPick(entry)}
          className='flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        >
          <Clock3 size={12} className='shrink-0 opacity-70' />
          <span className='truncate'>{entry}</span>
        </button>
      ))}
    </div>
  )
}
