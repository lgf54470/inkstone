import { useMemo, type ReactNode } from 'react'
import { Cloud, Disc3, ListMusic, User } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import { buildSearchSuggestions } from './music-search-suggestions'
import type { MusicSearchSuggestion } from './music-search-suggestions'
import { providerSourceLabel } from './providers'

// FB3-F8 + FB3-C7: the words the box is holding, read against the library and against the catalogue's
// own answer. These rows are drawn inside the panel, above the hits they lead to, instead of in a
// drop-down over it: that popup's box hung over exactly these rows — the ticks and the action buttons
// of the first hits sat under it, so a press aimed at a tick landed on a suggestion instead (the visual
// gate measured the tick at x=297 and the popup's box starting at x=298). One surface means a press
// always reaches the control it was aimed at.
export function ProviderSuggestions() {
  const setScope = useMusic((state) => state.setScope)
  const commitQuery = useMusic((state) => state.commitQuery)
  const suggestions = usePanelSuggestions()
  if (!suggestions.length) return null
  // A jump is not a search: the scope change repaints the library behind the box, and the words that
  // named the group have done their job. A catalogue row is the same gesture carrying its own words, so
  // the panel below then lists that hit — where its audition and add controls are.
  const pick = (suggestion: MusicSearchSuggestion): void => {
    if (suggestion.hit) {
      commitQuery(suggestion.hit.title)
      return
    }
    if (!suggestion.scope) return
    setScope(suggestion.scope)
    commitQuery('')
  }
  return (
    <ul data-provider-suggestions='' aria-label={t('music.search_suggestions')} className='space-y-0.5 pb-1'>
      {suggestions.map((suggestion) => (
        <li key={suggestion.key}>
          <button
            type='button'
            onClick={() => pick(suggestion)}
            className='flex w-full min-w-0 items-center gap-2 rounded-[var(--r-sm)] px-2 py-1 text-left text-[length:var(--text-12)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
          >
            {suggestionIcon(suggestion.kind)}
            <span className='min-w-0 flex-1 truncate'>{suggestion.label}</span>
            {suggestionMeta(suggestion) && (
              <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{suggestionMeta(suggestion)}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

// A catalogue row says which it is — a song the reader can hear now, or the catalogue it would come from.
function suggestionMeta(suggestion: MusicSearchSuggestion): string {
  if (!suggestion.hit) return suggestion.meta
  return suggestion.inLibrary ? t('music.provider_in_library') : providerSourceLabel(suggestion.hit.source)
}

function suggestionIcon(kind: MusicSearchSuggestion['kind']): ReactNode {
  if (kind === 'artist') return <User size={12} className='shrink-0 opacity-70' />
  if (kind === 'album') return <Disc3 size={12} className='shrink-0 opacity-70' />
  if (kind === 'online') return <Cloud size={12} className='shrink-0 opacity-70' />
  return <ListMusic size={12} className='shrink-0 opacity-70' />
}

// The same rule the drop-down's rows were built from, now read where the hits are: what the library can
// jump to, and what the catalogue answered for these very words.
function usePanelSuggestions(): MusicSearchSuggestion[] {
  const tracks = useMusic((state) => state.tracks)
  const playlists = useMusic((state) => state.playlists)
  const query = useMusic((state) => state.query)
  const results = useMusic((state) => state.providerResults)
  const keywords = useMusic((state) => state.providerKeywords)
  return useMemo(
    () => buildSearchSuggestions(tracks, playlists, query, { hits: results ?? [], keywords }),
    [tracks, playlists, query, keywords, results],
  )
}
