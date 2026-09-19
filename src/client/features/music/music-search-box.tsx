import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Clock3, Search, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { useClickOutside } from '../../components/overlay'
import { cn } from '../../lib/cn'
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

interface HistoryPopup {
  open: boolean
  show: boolean
  highlight: number
  close: () => void
  pick: (value: string) => void
  clearAll: () => void
  inputProps: {
    role: 'combobox'
    'aria-expanded': boolean
    'aria-controls': string | undefined
    'aria-autocomplete': 'list'
    'aria-activedescendant': string | undefined
  }
  inputHandlers: {
    onFocus: () => void
    onChange: (event: ChangeEvent<HTMLInputElement>) => void
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  }
}

interface PopupArgs {
  history: string[]
  text: string
  listId: string
  setText: (value: string) => void
  schedule: (value: string) => void
  commit: (value: string) => void
  flush: (value: string) => void
  clearHistory: () => void
}

// The ARIA projection of the popup state onto the combobox input.
function popupInputProps(show: boolean, highlight: number, listId: string): HistoryPopup['inputProps'] {
  return {
    role: 'combobox',
    'aria-expanded': show,
    'aria-controls': show ? listId : undefined,
    'aria-autocomplete': 'list',
    'aria-activedescendant': show && highlight >= 0 ? `${listId}-option-${highlight}` : undefined,
  }
}

// The popup half of the combobox contract: open/highlight state plus the input's
// ARIA wiring and handlers. Arrows walk a wrapping highlight, Enter takes the
// highlighted entry or else what was typed.
function useHistoryPopup({ history, text, listId, setText, schedule, commit, flush, clearHistory }: PopupArgs): HistoryPopup {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const show = open && !text && history.length > 0
  const close = (): void => {
    setOpen(false)
    setHighlight(-1)
  }
  const pick = (value: string): void => {
    if (value) commit(value)
    else flush('')
    close()
  }
  const wrap = (index: number): number => (index + history.length) % history.length
  return {
    open,
    show,
    highlight,
    close,
    pick,
    clearAll: () => {
      clearHistory()
      close()
    },
    inputProps: popupInputProps(show, highlight, listId),
    inputHandlers: {
      onFocus: () => setOpen(true),
      onChange: (event) => {
        setText(event.target.value)
        schedule(event.target.value)
        setHighlight(-1)
      },
      onKeyDown: (event) => {
        if (event.key === 'Escape') close()
        if (event.key === 'Enter') pick(show && highlight >= 0 ? history[highlight]! : text)
        if (!show || event.key === 'Escape' || event.key === 'Enter') return
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setHighlight((value) => wrap(value + 1))
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setHighlight((value) => wrap(value - 1))
        }
      },
    },
  }
}

export function SearchBox() {
  const query = useMusic((state) => state.query)
  const history = useMusic((state) => state.searchHistory)
  const setQuery = useMusic((state) => state.setQuery)
  const commitQuery = useMusic((state) => state.commitQuery)
  const clearSearchHistory = useMusic((state) => state.clearSearchHistory)
  const listId = useId()
  const { text, setText, schedule, flush } = useDebouncedText(query, setQuery)
  const popup = useHistoryPopup({ history, text, listId, setText, schedule, commit: commitQuery, flush, clearHistory: clearSearchHistory })
  const boxRef = useRef<HTMLDivElement>(null)
  useClickOutside([boxRef], popup.open, popup.close)
  return (
    <div ref={boxRef} className='relative w-60 md:w-72'>
      <Input
        leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
        value={text}
        aria-label={t('music.search_placeholder')}
        placeholder={t('music.search_placeholder')}
        className='h-8 text-[length:var(--text-12)]'
        {...popup.inputProps}
        {...popup.inputHandlers}
      />
      {text && <SearchClearButton onClear={() => popup.pick('')} />}
      {popup.show && (
        <SearchHistory
          history={history}
          highlight={popup.highlight}
          listId={listId}
          onPick={popup.pick}
          onClear={popup.clearAll}
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
  highlight,
  listId,
  onPick,
  onClear,
}: {
  history: string[]
  highlight: number
  listId: string
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
      <div role='listbox' id={listId} aria-label={t('music.search_history')}>
        {history.map((entry, index) => (
          <button
            key={entry}
            id={`${listId}-option-${index}`}
            type='button'
            role='option'
            aria-selected={index === highlight}
            onClick={() => onPick(entry)}
            className={cn(
              'flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)]',
              index === highlight
                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            <Clock3 size={12} className='shrink-0 opacity-70' />
            <span className='truncate'>{entry}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
