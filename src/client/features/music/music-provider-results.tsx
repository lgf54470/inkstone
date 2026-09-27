import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Switch } from '../../components/form'
import { t, type MessageKey } from '../../lib/i18n'
import { useMusic } from './music-store'
import { GDS_SOURCES, providerSourceLabel } from './providers'
import type { MusicProviderTrack } from '../../lib/api'

// FB-F2: every state the panel can be in has words. The old render chain fell through
// to nothing whenever the settled keywords did not match the query, and that is exactly
// what a reader saw after flipping the switch on with a search already on screen:
// enabled, no request in flight, no result and no message — the panel looked dead.
export type ProviderPanelState = 'off' | 'loading' | 'ready' | 'none' | 'failed'

export function providerPanelState(input: {
  enabled: boolean
  searching: boolean
  results: MusicProviderTrack[] | null
  failedSources: string[]
  keywords: string
  query: string
}): ProviderPanelState {
  if (!input.enabled) return 'off'
  // An answer belongs to the query it was asked for. Anything else means this query
  // has not been answered yet, which from the reader's side of the screen is loading.
  if (input.searching || input.keywords !== input.query) return 'loading'
  if (input.results?.length) return 'ready'
  // FB-F6: "no match in five catalogues" and "no catalogue answered" used to read the
  // same. They are different facts, and only one of them is worth a retry.
  return input.failedSources.length ? 'failed' : 'none'
}

// Every source down is an outage; some of them down is a partial answer. The sentence
// has to say which, because a retry helps in the first case and only partly in the second.
export function providerFailureKey(failedCount: number): MessageKey {
  return failedCount >= GDS_SOURCES.length ? 'music.provider_all_failed' : 'music.provider_partial_failed'
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
  const failedSources = useMusic((state) => state.providerFailedSources)
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
  const state = providerPanelState({ enabled, searching, results, failedSources, keywords, query })
  return (
    <section aria-label={t('music.provider_results')} className='border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <div className='flex items-center justify-between pb-1'>
        <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-tertiary)]'>{t('music.provider_results')}</span>
        <Switch checked={enabled} onChange={(value) => setProviderEnabled('gds', value)} label={t('music.provider_gds')} />
      </div>
      <ProviderPanelBody
        state={state}
        results={results}
        failedSources={failedSources}
        onRetry={() => void searchProviders(query)}
        onPlay={(hit) => void playProviderTrack(hit)}
      />
    </section>
  )
}

function ProviderPanelBody({ state, results, failedSources, onRetry, onPlay }: {
  state: ProviderPanelState
  results: MusicProviderTrack[] | null
  failedSources: string[]
  onRetry: () => void
  onPlay: (hit: MusicProviderTrack) => void
}) {
  if (state === 'off') return <Notice text={t('music.provider_off')} align='start' />
  if (state === 'loading') return <Notice text={t('common.loading')} />
  if (state === 'none') return <Notice text={t('music.provider_none')} />
  if (state === 'failed') return <ProviderFailureNotice failedSources={failedSources} onRetry={onRetry} />
  return (
    <>
      {failedSources.length > 0 && <ProviderFailureNotice failedSources={failedSources} onRetry={onRetry} />}
      <ul className='max-h-56 space-y-0.5 overflow-y-auto'>
        {results?.map((hit) => (
          <ProviderResultRow key={`${hit.source}:${hit.sourceId}`} hit={hit} onPlay={() => onPlay(hit)} />
        ))}
      </ul>
    </>
  )
}

// FB-F6: the sources that did not answer are named in the open, with a way to ask again —
// and only ever beside the hits that did arrive, never instead of them.
function ProviderFailureNotice({ failedSources, onRetry }: { failedSources: string[]; onRetry: () => void }) {
  return (
    <div role='status' className='flex flex-wrap items-center justify-center gap-2 py-2'>
      <span className='text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
        {t(providerFailureKey(failedSources.length), { value0: failedSources.length })}
      </span>
      <Button size='sm' onClick={onRetry}>{t('music.retry')}</Button>
    </div>
  )
}

function Notice({ text, align = 'center' }: { text: string; align?: 'start' | 'center' }) {
  return <p role='status' className={`py-2 text-[length:var(--text-12)] text-[var(--text-quaternary)]${align === 'center' ? ' text-center' : ''}`}>{text}</p>
}

function ProviderResultRow({ hit, onPlay }: { hit: MusicProviderTrack; onPlay: () => void }) {
  return (
    <li className='flex h-9 items-center gap-2 rounded-[var(--r-md)] px-2 hover:bg-[var(--bg-hover)]'>
      <span className='min-w-0 flex-1 truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>
        {hit.title}
        {hit.artist && <span className='text-[var(--text-quaternary)]'> · {hit.artist}</span>}
      </span>
      <span className='shrink-0 text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{providerSourceLabel(hit.source)}</span>
      <Button size='sm' icon={<Plus size={12} />} onClick={onPlay}>
        {t('music.provider_add')}
      </Button>
    </li>
  )
}
