import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '../../components/primitives'
import { Switch } from '../../components/form'
import { t } from '../../lib/i18n'
import { useMusic } from './music-store'
import type { MusicProviderTrack } from '../../lib/api'

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

  useEffect(() => {
    if (!query.trim()) return
    const timer = window.setTimeout(() => void searchProviders(query), 500)
    return () => window.clearTimeout(timer)
  }, [query, searchProviders])

  if (!query.trim()) return null
  return (
    <section aria-label={t('music.provider_results')} className='border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <div className='flex items-center justify-between pb-1'>
        <span className='text-[length:var(--text-11)] font-semibold text-[var(--text-tertiary)]'>{t('music.provider_results')}</span>
        <Switch
          checked={enabled}
          onChange={(value) => setProviderEnabled('gds', value)}
          label={t('music.provider_gds')}
        />
      </div>
      {!enabled
        ? <p className='py-1 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{t('music.provider_off')}</p>
        : searching && keywords === query
          ? <p role='status' className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('common.loading')}</p>
          : !results?.length
            ? results !== null && keywords === query
              ? <p className='py-2 text-center text-[length:var(--text-12)] text-[var(--text-quaternary)]'>{t('music.provider_none')}</p>
              : null
            : (
                <ul className='max-h-56 space-y-0.5 overflow-y-auto'>
                  {results.map((hit) => (
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
      <span className='shrink-0 text-[length:var(--text-10)] text-[var(--text-quaternary)]'>{hit.source}</span>
      <Button size='sm' icon={<Plus size={12} />} onClick={onPlay}>
        {t('music.provider_add')}
      </Button>
    </li>
  )
}
