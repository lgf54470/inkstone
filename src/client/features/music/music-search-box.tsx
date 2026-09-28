import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Clock3, Disc3, ListMusic, Search, User, X } from 'lucide-react'
import { IconButton } from '../../components/primitives'
import { Input } from '../../components/form'
import { useClickOutside, useEscape } from '../../components/overlay'
import { cn } from '../../lib/cn'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicScope } from './music-store'
import { buildSearchSuggestions } from './music-search-suggestions'
import type { MusicSearchSuggestion } from './music-search-suggestions'

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

// FEA-A1-5: one row shape for both popup modes — search history entries and
// library jump targets (artist / album / playlist) walk the same highlight.
interface PopupOption {
  key: string
  label: string
  meta: string
  icon: ReactNode
  ariaLabel: string
  pick: () => void
}

interface PopupState {
  show: boolean
  historyMode: boolean
  highlight: number
  options: PopupOption[]
  close: () => void
  /** FB3-U1: the history action — what the popup's own row means. */
  clearAll: () => void
  /** FB3-U1: the box's own action — empty the query, leave the history where it is. */
  clearQuery: () => void
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
  suggestions: MusicSearchSuggestion[]
  setScope: (scope: MusicScope) => void
  setText: (value: string) => void
  schedule: (value: string) => void
  commit: (value: string) => void
  flush: (value: string) => void
  clearHistory: () => void
}

// The ARIA projection of the popup state onto the combobox input. Empty text
// offers the search history; typed text offers jump targets into the library.
function useSearchPopup({ history, text, listId, suggestions, setScope, setText, schedule, commit, flush, clearHistory }: PopupArgs): PopupState {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const historyMode = !text.trim()
  const close = useCallback((): void => {
    setOpen(false)
    setHighlight(-1)
  }, [])
  const options = useMemo<PopupOption[]>(() => historyMode
    ? historyOptions(history, commit, flush, close)
    : suggestionOptions(suggestions, setScope, flush, setText, close),
  [historyMode, history, suggestions, commit, flush, setScope, setText, close])
  const show = open && options.length > 0
  // FB2-U8: the popup has to own Escape while it is up. Inside the hub it did not: `useEscape` runs the
  // top of the stack and stops the event there, and this popup had never registered — so Escape was
  // taken by the modal and closed the whole music library, with the popup still drawn over it. It
  // registers after the surface it stands in, which makes it the top: one Escape for the popup, the
  // next for the surface behind it.
  useEscape(show, close)
  return {
    show,
    historyMode,
    highlight,
    options,
    close,
    clearAll: () => {
      clearHistory()
      close()
    },
    // The × and the popup's row were one callback, so the × emptied the history and left the query
    // standing. Emptying the query is what the control is named for, and the popup is then shown in the
    // shape an empty box has — the history the reader can clear on purpose. `open` is set here rather than
    // left to the focus event: a committed search closes the popup, and a press on the × does not always
    // move the caret (`activeElement` is already the box in Chrome when the button takes no focus), so
    // relying on `onFocus` left the popup shut in the one case the reader clears right after searching.
    clearQuery: () => {
      setText('')
      flush('')
      setHighlight(() => -1)
      setOpen(true)
    },
    inputProps: popupInputProps(show, highlight, listId),
    inputHandlers: popupHandlers({ show, highlight, options, text, setOpen, setHighlight, setText, schedule, commit, flush, close }),
  }
}

// The keyboard half of the combobox: focus opens, typing schedules the query,
// Escape closes, Enter takes the highlighted option or else what was typed,
// and the arrows walk a wrapping highlight.
function popupHandlers(context: {
  show: boolean
  highlight: number
  options: PopupOption[]
  text: string
  setOpen: (open: boolean) => void
  setHighlight: (updater: (value: number) => number) => void
  setText: (value: string) => void
  schedule: (value: string) => void
  commit: (value: string) => void
  flush: (value: string) => void
  close: () => void
}): PopupState['inputHandlers'] {
  const { show, highlight, options, text, setOpen, setHighlight, setText, schedule, commit, flush, close } = context
  return {
    onFocus: () => setOpen(true),
    onChange: (event) => {
      setText(event.target.value)
      schedule(event.target.value)
      setHighlight(() => -1)
    },
    onKeyDown: (event) => {
      if (event.key === 'Escape') return close()
      if (event.key === 'Enter') {
        if (show && highlight >= 0) options[highlight].pick()
        else if (text) commit(text)
        else flush('')
        return close()
      }
      if (!show) return
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHighlight((value) => (value + 1) % options.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlight((value) => (value - 1 + options.length) % options.length)
      }
    },
  }
}

const SUGGESTION_KIND_KEYS = {
  artist: 'music.suggest_artist',
  album: 'music.suggest_album',
  playlist: 'music.suggest_playlist',
} as const

function historyOptions(history: string[], commit: (value: string) => void, flush: (value: string) => void, close: () => void): PopupOption[] {
  return history.map((entry) => ({
    key: entry,
    label: entry,
    meta: '',
    icon: <Clock3 size={12} className='shrink-0 opacity-70' />,
    ariaLabel: entry,
    pick: () => {
      if (entry) commit(entry)
      else flush('')
      close()
    },
  }))
}

function suggestionOptions(
  suggestions: MusicSearchSuggestion[],
  setScope: (scope: MusicScope) => void,
  flush: (value: string) => void,
  setText: (value: string) => void,
  close: () => void,
): PopupOption[] {
  return suggestions.map((suggestion) => ({
    key: suggestion.key,
    label: suggestion.label,
    meta: suggestion.meta,
    icon: kindIcon(suggestion.kind),
    ariaLabel: `${suggestion.label} ${t(SUGGESTION_KIND_KEYS[suggestion.kind])}`,
    // A jump is not a text search: the box empties while the scope change
    // repaints the library behind it.
    pick: () => {
      setScope(suggestion.scope)
      flush('')
      setText('')
      close()
    },
  }))
}

function kindIcon(kind: MusicSearchSuggestion['kind']): ReactNode {
  if (kind === 'artist') return <User size={12} className='shrink-0 opacity-70' />
  if (kind === 'album') return <Disc3 size={12} className='shrink-0 opacity-70' />
  return <ListMusic size={12} className='shrink-0 opacity-70' />
}

function popupInputProps(show: boolean, highlight: number, listId: string): PopupState['inputProps'] {
  return {
    role: 'combobox',
    'aria-expanded': show,
    'aria-controls': show ? listId : undefined,
    'aria-autocomplete': 'list',
    'aria-activedescendant': show && highlight >= 0 ? `${listId}-option-${highlight}` : undefined,
  }
}

export function SearchBox() {
  const query = useMusic((state) => state.query)
  const history = useMusic((state) => state.searchHistory)
  const tracks = useMusic((state) => state.tracks)
  const playlists = useMusic((state) => state.playlists)
  const setQuery = useMusic((state) => state.setQuery)
  const commitQuery = useMusic((state) => state.commitQuery)
  const clearSearchHistory = useMusic((state) => state.clearSearchHistory)
  const setScope = useMusic((state) => state.setScope)
  const listId = useId()
  const { text, setText, schedule, flush } = useDebouncedText(query, setQuery)
  const suggestions = useMemo(
    () => buildSearchSuggestions(tracks, playlists, text),
    [tracks, playlists, text],
  )
  const popup = useSearchPopup({ history, text, listId, suggestions, setScope, setText, schedule, commit: commitQuery, flush, clearHistory: clearSearchHistory })
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useClickOutside([boxRef], popup.show, popup.close)
  // FB3-U5: a press on the × moves the caret to the button, so the caret is handed back — otherwise the
  // reader who cleared the box has to click it again before the history it did not touch will show.
  const clearQuery = (): void => {
    popup.clearQuery()
    inputRef.current?.focus()
  }
  return (
    // FB-U2 / FB2-U2: the toolbar gives the search a row of its own and the search fills whatever the
    // rest of that row does not take, so the row ends at the toolbar's edge instead of trailing off
    // into empty space after a fixed 240px box.
    <div ref={boxRef} className='relative min-w-0 flex-1'>
      <Input
        ref={inputRef}
        leading={<Search size={13} className='text-[var(--text-quaternary)]' />}
        value={text}
        aria-label={t('music.search_placeholder')}
        placeholder={t('music.search_placeholder')}
        className='h-8 text-[length:var(--text-12)]'
        {...popup.inputProps}
        {...popup.inputHandlers}
      />
      {text && <SearchClearButton onClear={clearQuery} />}
      <SearchPopupFromState popup={popup} listId={listId} />
    </div>
  )
}

// What the popup shows for the state the box is in — the history before a query and the jump targets
// after one, each with its own title and its one action. Kept beside the box rather than inside it so
// the box itself reads as the input it is.
function SearchPopupFromState({ popup, listId }: { popup: PopupState; listId: string }) {
  if (!popup.show) return null
  return (
    <SearchPopup
      options={popup.options}
      highlight={popup.highlight}
      listId={listId}
      title={popup.historyMode ? t('music.search_history') : t('music.search_suggestions')}
      action={popup.historyMode
        ? (
            <button type='button' onClick={popup.clearAll} className='pointer-events-auto min-h-6 rounded px-1.5 hover:text-[var(--text-secondary)]'>
              {t('music.search_clear_history')}
            </button>
          )
        : null}
    />
  )
}

function SearchClearButton({ onClear }: { onClear: () => void }) {
  return (
    <span className='absolute top-1/2 right-1 -translate-y-1/2'>
      <IconButton label={t('music.search_clear')} size='sm' onClick={onClear}><X size={12} /></IconButton>
    </span>
  )
}

function SearchPopup({
  options,
  highlight,
  listId,
  title,
  action,
}: {
  options: PopupOption[]
  highlight: number
  listId: string
  title: string
  action: ReactNode
}) {
  return (
    // FB2-U7: the frame is not something to press. It drops over whatever sits below the box — in the
    // hub that is the online panel with its own switch and selection bar — and a press aimed at those
    // used to land here and vanish, because this frame counts as inside the box and so the box's
    // outside-press rule never fired. Letting the pointer through the frame is what leaves the rows (and
    // the one action on the header) as the only things this popup takes for itself.
    <div className='pointer-events-none absolute top-full left-0 z-[var(--z-popover)] mt-1 w-full rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-overlay)] p-1 shadow-[var(--shadow-pop)]'>
      <div className='flex items-center justify-between px-2 py-1 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>
        <span>{title}</span>
        {action}
      </div>
      <div role='listbox' id={listId} aria-label={title}>
        {options.map((option, index) => (
          <button
            key={option.key}
            id={`${listId}-option-${index}`}
            type='button'
            role='option'
            aria-selected={index === highlight}
            aria-label={option.ariaLabel}
            onClick={option.pick}
            className={cn(
              'pointer-events-auto flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-[length:var(--text-12)]',
              index === highlight
                ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            )}
          >
            {option.icon}
            <span className='min-w-0 flex-1 truncate'>{option.label}</span>
            {option.meta && <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{option.meta}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
