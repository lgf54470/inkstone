import { useEffect, useMemo, useState } from 'react'
import { Check, Music, Play, Plus } from 'lucide-react'
import { Button, IconButton, Spinner } from '../../components/primitives'
import { Checkbox, Select, Switch } from '../../components/form'
import { t, type MessageKey } from '../../lib/i18n'
import { formatTimecode } from '../../lib/time'
import type { MusicTrack } from '@shared/types'
import { useMusic } from './music-store'
import { GDS_SOURCES, PROVIDER_SCOPE_ALL, isProviderScope, providerSourceLabel, scopeSources, type MusicProviderScope } from './providers'
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
// FB3-F1: "every source" is the sources this search asked, so the count is compared against the
// scope's own size — with the scope narrowed to one catalogue, that catalogue failing is all of them.
export function providerFailureKey(failedCount: number, sourceCount: number = GDS_SOURCES.length): MessageKey {
  return failedCount >= sourceCount ? 'music.provider_all_failed' : 'music.provider_partial_failed'
}

// FB-F10: a tick is stored as the hit's own identity (`source:sourceId`), so a selection survives
// a re-render and can be dropped the moment the answer stops listing that hit.
export function providerHitKey(hit: MusicProviderTrack): string {
  return `${hit.source}:${hit.sourceId}`
}

// FB2-U3: a library row remembers the catalogue it came from and the song it answers to there, so
// "this hit is already in the library" is a lookup rather than a request. The key is deliberately the
// same shape `providerHitKey` builds — that is what makes a foreign hit and an owned row comparable.
export function libraryProviderKeys(tracks: readonly MusicTrack[]): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const track of tracks) {
    if (track.providerSource && track.providerSongId) keys.add(`${track.providerSource}:${track.providerSongId}`)
  }
  return keys
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
  const setProviderEnabled = useMusic((state) => state.setProviderEnabled)
  const scope = useMusic((state) => state.providerScope)
  const setProviderScope = useMusic((state) => state.setProviderScope)
  // FB2-U3: whether the library already holds a hit is a fact about the reader's own rows, so it is
  // read from them — and a hit is the same song as a row when the catalogue and the song id agree.
  const libraryTracks = useMusic((state) => state.tracks)
  const held = useMemo(() => libraryProviderKeys(libraryTracks), [libraryTracks])
  const busy = useRowBusy()
  const selection = useProviderSelection(results, busy)

  useProviderSearch(query, enabled, scope, searchProviders)

  if (!query.trim()) return null
  const state = providerPanelState({ enabled, searching, results, failedSources, keywords, query })
  return (
    <section aria-label={t('music.provider_results')} className='border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2'>
      <ProviderPanelHeader
        enabled={enabled}
        scope={scope}
        onToggle={(value) => setProviderEnabled('gds', value)}
        onScope={setProviderScope}
      />
      <ProviderPanelBody
        state={state}
        results={results}
        failedSources={failedSources}
        scopeSize={scopeSources(scope).length}
        selected={selection.selected}
        adding={selection.adding}
        busy={busy}
        held={held}
        onRetry={() => void searchProviders(query, { force: true })}
        onToggle={selection.toggle}
        onAddSelected={selection.addSelected}
        onClearSelection={selection.clear}
      />
    </section>
  )
}

// FB-F2: `enabled` is a dependency of its own — turning the switch on is a reason to ask, not just a
// change of who is allowed to ask, and without it the reader had to retype the query before the
// switch did anything at all. FB3-F1 puts the scope under the same rule: picking a catalogue narrows
// *this* search, so it re-asks rather than waiting for the next keystroke.
const PROVIDER_SEARCH_DEBOUNCE_MS = 500

function useProviderSearch(
  query: string,
  enabled: boolean,
  scope: MusicProviderScope,
  search: (keywords: string) => Promise<void>,
): void {
  useEffect(() => {
    if (!query.trim()) return
    const timer = window.setTimeout(() => void search(query), PROVIDER_SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, enabled, scope, search])
}

// FB3-F1 + FB3-U6: which catalogue to ask is the reader's first question about an online list, and
// the switch that governs the list is their second. Both live in this one row rather than in two
// places, because they answer the same question — how much is this query allowed to cost.
function ProviderPanelHeader({ enabled, scope, onToggle, onScope }: {
  enabled: boolean
  scope: MusicProviderScope
  onToggle: (value: boolean) => void
  onScope: (scope: MusicProviderScope) => void
}) {
  return (
    <div data-provider-header='' className='flex items-center justify-between gap-2 pb-1'>
      <span className='text-[length:var(--text-12)] font-semibold text-[var(--text-tertiary)]'>{t('music.provider_results')}</span>
      <span className='flex shrink-0 items-center gap-2'>
        <Select
          data-provider-scope=''
          aria-label={t('music.provider_scope')}
          className='h-8 w-auto min-w-32'
          value={scope}
          onChange={(event) => onScope(readScope(event.target.value))}
        >
          <option value={PROVIDER_SCOPE_ALL}>{t('music.provider_scope_all')}</option>
          {GDS_SOURCES.map((source) => (
            <option key={source} value={source}>{providerSourceLabel(source)}</option>
          ))}
        </Select>
        <Switch checked={enabled} onChange={onToggle} label={t('music.provider_gds')} />
      </span>
    </div>
  )
}

interface ProviderPanelBodyProps {
  state: ProviderPanelState
  results: MusicProviderTrack[] | null
  failedSources: string[]
  /** FB3-F1: how many catalogues this search asked, so the failure copy counts against the right total. */
  scopeSize: number
  selected: readonly string[]
  adding: boolean
  busy: RowBusy
  held: ReadonlySet<string>
  onRetry: () => void
  onToggle: (hit: MusicProviderTrack, next: boolean) => void
  onAddSelected: () => void
  onClearSelection: () => void
}

// FB2-U3: what the rows report while they wait. `mark`/`release` take keys so the batch can borrow the
// same state the single presses use — a row being written by the batch is the same wait, seen from the
// row, and the reader who ticked it should not have to look at the bar to find that out.
interface RowBusy {
  adding: readonly string[]
  previewing: string | null
  preview: (hit: MusicProviderTrack) => void
  add: (hit: MusicProviderTrack) => void
  mark: (keys: readonly string[]) => void
  release: (keys: readonly string[]) => void
}

// Both presses are imports, and an import takes a round trip; the row states it for as long as it
// lasts. Keys are dropped by identity, so a second press never clears the first row's state, and the
// audition keeps its own slot because taking the player over is a different wait from copying a row.
function useRowBusy(): RowBusy {
  const playProviderTrack = useMusic((state) => state.playProviderTrack)
  const addProviderTrack = useMusic((state) => state.addProviderTrack)
  const [adding, setAdding] = useState<readonly string[]>([])
  const [previewing, setPreviewing] = useState<string | null>(null)

  const mark = (keys: readonly string[]): void => {
    setAdding((current) => [...current, ...keys.filter((key) => !current.includes(key))])
  }
  const release = (keys: readonly string[]): void => {
    setAdding((current) => current.filter((entry) => !keys.includes(entry)))
  }

  return {
    adding,
    previewing,
    mark,
    release,
    preview: (hit) => {
      const key = providerHitKey(hit)
      setPreviewing(key)
      void playProviderTrack(hit).finally(() => setPreviewing((current) => (current === key ? null : current)))
    },
    add: (hit) => {
      const key = providerHitKey(hit)
      mark([key])
      void addProviderTrack(hit).finally(() => release([key]))
    },
  }
}

// FB-F10: what is ticked, and what a tick can do, are one concern — so the panel asks this hook
// for its selection instead of holding three pieces of state and the rule that keeps them true.
function useProviderSelection(results: MusicProviderTrack[] | null, busy: RowBusy) {
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
    const keys = batch.map(providerHitKey)
    setAdding(true)
    // FB2-U3: the batch borrows the row state, so the rows it is writing say so while it runs.
    busy.mark(keys)
    void addProviderTracks(batch).finally(() => {
      // Only the ticks that were part of this batch go away: a row ticked while the batch ran is
      // still the reader's choice.
      const done = new Set(keys)
      setSelected((current) => current.filter((key) => !done.has(key)))
      busy.release(keys)
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

// The select's value is a string from the DOM; the store's is a scope. A value that is not on the
// shared list is impossible through this control (it only offers entries), but reading it through the
// same guard the store's loader uses keeps one rule in one place instead of trusting the markup.
function readScope(value: string): MusicProviderScope {
  return isProviderScope(value) ? value : PROVIDER_SCOPE_ALL
}

function ProviderPanelBody({
  state, results, failedSources, selected, adding, busy, held, scopeSize,
  onRetry, onToggle, onAddSelected, onClearSelection,
}: ProviderPanelBodyProps) {
  if (state === 'off') return <Notice text={t('music.provider_off')} align='start' />
  if (state === 'loading') return <Notice text={t('common.loading')} />
  if (state === 'none') return <Notice text={t('music.provider_none')} />
  if (state === 'failed') return <ProviderFailureNotice failedSources={failedSources} scopeSize={scopeSize} onRetry={onRetry} />
  return (
    <>
      {failedSources.length > 0 && <ProviderFailureNotice failedSources={failedSources} scopeSize={scopeSize} onRetry={onRetry} />}
      {selected.length > 0 && (
        <ProviderSelectionBar
          count={selected.length}
          adding={adding}
          onAddSelected={onAddSelected}
          onClear={onClearSelection}
        />
      )}
      {/* FB2-U4: the cap is a full page of hits (eight rows of `min-h-11` plus their gaps ≈ 366px),
          so an ordinary answer is read in one piece instead of four rows at a time behind a scrollbar
          inside a panel that already sits in a scrolling column. A longer answer still scrolls here —
          the library's own rows below must not be pushed off the screen by a catalogue's. */}
      <ul data-provider-results='' className='max-h-96 space-y-0.5 overflow-y-auto'>
        {results?.map((hit) => {
          const key = providerHitKey(hit)
          return (
            <ProviderResultRow
              key={key}
              hit={hit}
              checked={selected.includes(key)}
              inLibrary={held.has(key)}
              adding={busy.adding.includes(key)}
              previewing={busy.previewing === key}
              onToggle={(next) => onToggle(hit, next)}
              onPreview={() => busy.preview(hit)}
              onAdd={() => busy.add(hit)}
            />
          )
        })}
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
function ProviderFailureNotice({ failedSources, scopeSize, onRetry }: { failedSources: string[]; scopeSize: number; onRetry: () => void }) {
  return (
    <div role='status' className='flex flex-wrap items-center justify-center gap-2 py-2'>
      <span className='text-[length:var(--text-12)] text-[var(--text-quaternary)]'>
        {t(providerFailureKey(failedSources.length, scopeSize), { value0: failedSources.length })}
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
  /** FB2-U3: the library already holds this catalogue row. */
  inLibrary: boolean
  /** FB2-U3: this row's own import is in flight, whether the reader pressed it or the batch did. */
  adding: boolean
  /** FB2-U3: this row's audition is in flight. */
  previewing: boolean
  onToggle: (next: boolean) => void
  onPreview: () => void
  onAdd: () => void
}

// FB-F10: a hit reads like a library row — artwork, title, artist and album on two lines — and it
// carries the two intents a search result has. Auditioning is the icon (taking over the player is
// the louder act, so it is the one that stays small); taking the song into the library is named.
function ProviderResultRow({ hit, checked, inLibrary, adding, previewing, onToggle, onPreview, onAdd }: ProviderResultRowProps) {
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
      <ProviderRowActions
        previewing={previewing}
        adding={adding}
        inLibrary={inLibrary}
        onPreview={onPreview}
        onAdd={onAdd}
      />
    </li>
  )
}

// FB2-U3: the two things a row can be asked to do, and what each says while it waits. Kept apart from
// the row's facts so the busy rule and the already-held rule sit in one place rather than in the
// middle of a layout.
function ProviderRowActions({ previewing, adding, inLibrary, onPreview, onAdd }: {
  previewing: boolean
  adding: boolean
  inLibrary: boolean
  onPreview: () => void
  onAdd: () => void
}) {
  return (
    <>
      {/* The audition is the louder act — it takes the player over — so it stays the small icon, but
          while its import runs it is the icon that says so, and it takes no second press. */}
      <IconButton
        label={t('music.provider_preview')}
        size='sm'
        data-provider-preview=''
        aria-busy={previewing ? true : undefined}
        disabled={previewing}
        onClick={onPreview}
      >
        {previewing ? <Spinner size={12} /> : <Play size={12} />}
      </IconButton>
      {inLibrary ? (
        // A copy already exists, so the honest control is the fact: the import would be a no-op, and
        // its only visible effect would be a toast about a row the reader already has.
        <Button size='sm' variant='ghost' icon={<Check size={12} />} disabled>
          {t('music.provider_in_library')}
        </Button>
      ) : (
        <Button size='sm' icon={<Plus size={12} />} loading={adding} onClick={onAdd}>
          {t('music.provider_add')}
        </Button>
      )}
    </>
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
