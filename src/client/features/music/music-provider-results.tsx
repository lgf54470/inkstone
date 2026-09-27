import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Switch } from '../../components/form'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicProviderTrack } from '../../lib/api'

// FB-F2: every state the panel can be in has words. The old render chain fell through
// to nothing whenever the settled keywords did not match the query, and that is exactly
// what a reader saw after flipping the switch on with a search already on screen:
// enabled, no request in flight, no result and no message — the panel looked dead.
export type ProviderPanelState = 'off' | 'loading' | 'ready' | 'none'

export function providerPanelState(input: {
  enabled: boolean
  searching: boolean
  results: MusicProviderTrack[] | null
  keywords: string
  query: string
}): ProviderPanelState {
  if (!input.enabled) return 'off'
  // An answer belongs to the query it was asked for. Anything else means this query
  // has not been answered yet, which from the reader's side of the screen is loading.
  if (input.searching || input.keywords !== input.query) return 'loading'
  return input.results?.length ? 'ready' : 'none'
}

// FEA-A1-3: the online half of a library search. It trails the local results
// while a query is showing, behind the per-provider opt-in from A1-1 — the
// section exists visually only once the query is non-empty.
export function MusicProviderResults() {
  const query = useMusic((state) => state.query)
  const enabled = useMusic((state) => state.providerEnabled.gds === true)
  const results = useMusic((state) => state.providerResults)
  const searching = useMusic((state) => state.providerSearching)
  const keywords = useMusic((state) => state.providerKeywords)
  const searchProviders = useMusic((state) => state.searchProviders)
  const playProviderTrack = useMusic((state) => state.playProviderTrack)
  const setProviderEnabled = useMusic((state) => state.setProviderEnabled)

  // FB-F2: `enabled` is a dependency of its own. Turning the switch on is a reason to
  // ask, not just a change of who is allowed to ask — without it the reader had to
  // retype the query before the switch did anything at all.
  useEffect(() => {
    if (!query.trim()) return
    const timer = window.setTimeout(() => void searchProviders(query), 500)
    return () => window.clearTimeout(timer)
  }, [query, enabled, searchProviders])

  if (!query.trim()) return null
  const state = providerPanelState({ enabled, searching, results, keywords, query })
  return (
    <section aria-label={t('music.provider_results')} className='border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <div className='flex items-center justify-between pb-1'>
        <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-tertiary)]'>{t('music.provider_results')}</span>
        <Switch
          checked={enabled}
          onChange={(value) => setProviderEnabled('gds', value)}
          label={t('music.provider_gds')}
        />
      </div>
      {state === 'off' && <p className='py-1 text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.provider_off')}</p>}
      {state === 'loading' && <p role='status' className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>}
      {state === 'none' && <p role='status' className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.provider_none')}</p>}
      {state === 'ready' && (
        <ul className='max-h-56 space-y-0.5 overflow-y-auto'>
          {results?.map((hit) => (
            <ProviderResultRow
              key={`${hit.source}:${hit.sourceId}`}
              hit={hit}
              onPlay={() => void playProviderTrack(hit)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ProviderResultRow({ hit, onPlay }: { hit: MusicProviderTrack; onPlay: () => void }) {
  return (
    <li className='flex h-9 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>
        {hit.title}
        {hit.artist && <span className='text-[var(--text-quaternary)]'> · {hit.artist}</span>}
      </span>
      <span className='shrink-0 text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{hit.source}</span>
      <Button size='sm' icon={<Plus size={12} />} onClick={onPlay}>
        {t('music.provider_add')}
      </Button>
    </li>
  )
}
