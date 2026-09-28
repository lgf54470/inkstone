import { useEffect, useState } from 'react'
import { Music, Play, Plus } from 'lucide-react'
import { Button, IconButton } from '../../components/primitives'
import { Checkbox, Switch } from '../../components/form'
import { t, type MessageKey } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import { useMusic } from './music-store'
import { GDS_SOURCES, providerSourceLabel } from './providers'
import { musicProviderCoverUrl, type MusicProviderTrack } from '../../lib/api'

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

// FB-F10: a tick is stored as the hit's own identity (`source:sourceId`), so a selection survives
// a re-render and can be dropped the moment the answer stops listing that hit.
export function providerHitKey(hit: MusicProviderTrack): string {
  return `${hit.source}:${hit.sourceId}`
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
  const addProviderTrack = useMusic((state) => state.addProviderTrack)
  const setProviderEnabled = useMusic((state) => state.setProviderEnabled)
  const selection = useProviderSelection(results)

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
        selected={selection.selected}
        adding={selection.adding}
        onRetry={() => void searchProviders(query)}
        onPreview={(hit) => void playProviderTrack(hit)}
        onAdd={(hit) => void addProviderTrack(hit)}
        onToggle={selection.toggle}
        onAddSelected={selection.addSelected}
        onClearSelection={selection.clear}
      />
    </section>
  )
}

interface ProviderPanelBodyProps {
  state: ProviderPanelState
  results: MusicProviderTrack[] | null
  failedSources: string[]
  selected: readonly string[]
  adding: boolean
  onRetry: () => void
  onPreview: (hit: MusicProviderTrack) => void
  onAdd: (hit: MusicProviderTrack) => void
  onToggle: (hit: MusicProviderTrack, next: boolean) => void
  onAddSelected: () => void
  onClearSelection: () => void
}

// FB-F10: what is ticked, and what a tick can do, are one concern — so the panel asks this hook
// for its selection instead of holding three pieces of state and the rule that keeps them true.
function useProviderSelection(results: MusicProviderTrack[] | null) {
  const addProviderTracks = useMusic((state) => state.addProviderTracks)
  const [selected, setSelected] = useState<readonly string[]>([])
  const [adding, setAdding] = useState(false)

  // A tick belongs to a row that is on screen. Every answer filters the selection down to the hits
  // it still holds, so a new query (or a catalogue dropping out) can never leave a tick standing
  // for a song that is no longer listed.
  useEffect(() => {
    const listed = new Set((results ?? []).map(providerHitKey))
    setSelected((current) => {
      const kept = current.filter((key) => listed.has(key))
      return kept.length === current.length ? current : kept
    })
  }, [results])

  const addSelected = (): void => {
    const batch = (results ?? []).filter((hit) => selected.includes(providerHitKey(hit)))
    if (!batch.length) return
    setAdding(true)
    void addProviderTracks(batch).finally(() => {
      // Only the ticks that were part of this batch go away: a row ticked while the batch ran is
      // still the reader's choice.
      const done = new Set(batch.map(providerHitKey))
      setSelected((current) => current.filter((key) => !done.has(key)))
      setAdding(false)
    })
  }

  return {
    selected,
    adding,
    addSelected,
    clear: () => setSelected([]),
    toggle: (hit: MusicProviderTrack, next: boolean): void => {
      const key = providerHitKey(hit)
      setSelected((current) => (next ? [...current, key] : current.filter((entry) => entry !== key)))
    },
  }
}

function ProviderPanelBody({
  state, results, failedSources, selected, adding,
  onRetry, onPreview, onAdd, onToggle, onAddSelected, onClearSelection,
}: ProviderPanelBodyProps) {
  if (state === 'off') return <Notice text={t('music.provider_off')} align='start' />
  if (state === 'loading') return <Notice text={t('common.loading')} />
  if (state === 'none') return <Notice text={t('music.provider_none')} />
  if (state === 'failed') return <ProviderFailureNotice failedSources={failedSources} onRetry={onRetry} />
  return (
    <>
      {failedSources.length > 0 && <ProviderFailureNotice failedSources={failedSources} onRetry={onRetry} />}
      {selected.length > 0 && (
        <ProviderSelectionBar
          count={selected.length}
          adding={adding}
          onAddSelected={onAddSelected}
          onClear={onClearSelection}
        />
      )}
      <ul className='max-h-56 space-y-0.5 overflow-y-auto'>
        {results?.map((hit) => (
          <ProviderResultRow
            key={providerHitKey(hit)}
            hit={hit}
            checked={selected.includes(providerHitKey(hit))}
            onToggle={(next) => onToggle(hit, next)}
            onPreview={() => onPreview(hit)}
            onAdd={() => onAdd(hit)}
          />
        ))}
      </ul>
    </>
  )
}

// FB-F10: what a ticked selection can do, said once above the list rather than per row.
function ProviderSelectionBar({ count, adding, onAddSelected, onClear }: {
  count: number
  adding: boolean
  onAddSelected: () => void
  onClear: () => void
}) {
  return (
    <div className='flex items-center justify-between gap-2 pb-1'>
      <span role='status' className='text-[length:var(--text-11)] text-[var(--text-tertiary)]'>
        {t('music.provider_selected', { value0: count })}
      </span>
      <span className='flex shrink-0 items-center gap-1'>
        <Button size='sm' loading={adding} onClick={onAddSelected}>{t('music.provider_add_selected')}</Button>
        <Button size='sm' variant='ghost' onClick={onClear}>{t('music.provider_clear_selection')}</Button>
      </span>
    </div>
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

interface ProviderResultRowProps {
  hit: MusicProviderTrack
  checked: boolean
  onToggle: (next: boolean) => void
  onPreview: () => void
  onAdd: () => void
}

// FB-F10: a hit reads like a library row — artwork, title, artist and album on two lines — and it
// carries the two intents a search result has. Auditioning is the icon (taking over the player is
// the louder act, so it is the one that stays small); taking the song into the library is named.
function ProviderResultRow({ hit, checked, onToggle, onPreview, onAdd }: ProviderResultRowProps) {
  const subtitle = [hit.artist, hit.album].filter(Boolean).join(' · ')
  return (
    <li className='flex min-h-11 items-center gap-2 rounded-[var(--r-md)] px-1 hover:bg-[var(--bg-hover)]'>
      <Checkbox
        checked={checked}
        onChange={onToggle}
        aria-label={t('music.provider_select', { value0: hit.title })}
      />
      <ProviderRowArtwork hit={hit} />
      <span className='min-w-0 flex-1'>
        <span className='block truncate text-[length:var(--text-12)] text-[var(--text-primary)]'>{hit.title}</span>
        {subtitle && <span className='block truncate text-[length:var(--text-11)] text-[var(--text-quaternary)]'>{subtitle}</span>}
      </span>
      <span className='hidden shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)] sm:inline'>{providerSourceLabel(hit.source)}</span>
      {/* FB-F5 rejected "00:00" here, because a catalogue that reported no length never made that
          claim. FB2-F3 takes the same rule one step further: on a hit list the cell is drawn only
          when there is a length to draw. Naming the absence on every row of a foreign list says
          nothing about any of them, and the reader is comparing rows, not auditing metadata. The
          library keeps naming it — there it is a fact about a row the reader owns. */}
      {hit.durationMs ? (
        <span className='tabular shrink-0 text-[length:var(--text-11)] text-[var(--text-quaternary)]'>
          {formatTimecode(hit.durationMs)}
        </span>
      ) : null}
      <IconButton
        label={t('music.provider_preview')}
        size='sm'
        data-provider-preview=''
        onClick={onPreview}
      >
        <Play size={12} />
      </IconButton>
      <Button size='sm' icon={<Plus size={12} />} onClick={onAdd}>
        {t('music.provider_add')}
      </Button>
    </li>
  )
}

// The catalogue's own picture, fetched through the worker's proxy because the page may not talk to
// that host. A hit without a picture id gets a mark rather than an empty frame, which would read as
// a picture that failed to load.
function ProviderRowArtwork({ hit }: { hit: MusicProviderTrack }) {
  if (!hit.coverId) {
    return (
      <span aria-hidden='true' className='grid size-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--bg-inset)] text-[var(--text-quaternary)]'>
        <Music size={14} />
      </span>
    )
  }
  return (
    <img
      data-provider-cover=''
      src={musicProviderCoverUrl(hit.source, hit.coverId)}
      alt=''
      loading='lazy'
      decoding='async'
      className='size-8 shrink-0 rounded-[var(--r-sm)] object-cover'
    />
  )
}
