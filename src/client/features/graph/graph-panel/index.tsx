import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CornerDownRight, Download, ImageDown, ListChecks, Maximize2, Minus, Plus, Search, Settings2, X } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { GraphQuery, GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { clearSelectionToastKey, clearTagSelection } from '../../../lib/tag-selection'
import { type GraphPreferences, type GroupBy } from '../../../lib/graph-settings'

export type { GraphPreferences, GroupBy }

import { Button, IconButton } from '../../../components/primitives'
import { Input, Segmented } from '../../../components/form'
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../../components/overlay'
import { Empty, LoadingBlock } from '../../../components/feedback'
import { useBreakpoint } from '../../../lib/hooks'
import { useNotes } from '../../../store/notes'
import { useUi } from '../../../store/ui'
import { t } from '../../../lib/i18n'
import { GraphCanvas } from './canvas'
import { useGraphCanvasRefs } from './canvas-hooks'
import { GraphSettingsPanel } from './settings'
import { useGraphExport } from './use-graph-export'
import { graphIdListToggles, useGraphPreferences } from './use-graph-prefs'
import { DEFAULT_PREFERENCES, GRAPH_SEARCH_DEBOUNCE_MS } from './constants'
import { countWikiLinkEdges, graphNodeCounts, graphSearchHits, normalizedResponse } from './helpers'
import type { GraphHeaderActionsProps, GraphHeaderProps, GraphSearchState } from './types'

const TRACKING_TITLE = 'tracking-[var(--tracking-graph-title)]'

/**
 * The drawer the settings live in, which a reader can also arrive at from outside the panel: the note's
 * companion graph holds no settings of its own and asks for this one (G-20). A request is spent the
 * moment it is honoured, so opening the graph again goes back to the panel's own default.
 */
function useGraphSettingsDisclosure() {
  const requested = useUi((state) => state.graphSettingsRequested)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  useEffect(() => {
    if (!requested) return
    useUi.setState({ graphSettingsRequested: false })
    setIsSettingsOpen(true)
  }, [requested])
  return [isSettingsOpen, setIsSettingsOpen] as const
}

function useDebouncedQuery(search: string, delayMs: number): string {
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), delayMs)
    return () => window.clearTimeout(timer)
  }, [search, delayMs])
  return query
}

function useCreateScopedNote(prefs: GraphPreferences) {
  const createNote = useNotes((state) => state.createNote)
  // Notes created from unresolved nodes land in the graph's folder scope so
  // they inherit the folder name for the `{{folder}}` template placeholder.
  return useCallback((title: string) => {
    void createNote?.({ title, open: true, folderId: prefs.folderId || undefined })
  }, [createNote, prefs.folderId])
}

// The sidebar's cmd/ctrl+click selections join the graph's own tag filter.
function graphRequest(prefs: GraphPreferences, activeNoteId: string | null, query: string, selectedTags: string[]): GraphQuery {
  const tagSet = new Set<string>()
  if (prefs.tag) tagSet.add(prefs.tag)
  for (const tag of selectedTags) tagSet.add(tag)
  return {
    mode: prefs.mode,
    center: prefs.mode === 'local' ? activeNoteId ?? undefined : undefined,
    depth: prefs.depth,
    q: query || undefined,
    folderId: prefs.folderId || undefined,
    tags: tagSet.size ? [...tagSet] : undefined,
    tagsMatch: tagSet.size ? prefs.tagsMatch : undefined,
    includeOrphans: prefs.includeOrphans,
    includeUnresolved: prefs.includeUnresolved,
    showTagNodes: prefs.showTagNodes,
    excluded: prefs.excludedNoteIds.length ? prefs.excludedNoteIds : undefined,
    direction: prefs.mode === 'local' ? prefs.direction : undefined,
    limit: prefs.limit,
  }
}

function useGraphData(request: GraphQuery) {
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (request.mode === 'local' && !request.center) {
      setData(null)
      setLoadError(t('graph.local_requires_note'))
      return
    }
    const controller = new AbortController()
    let isCancelled = false
    setLoadError(null)
    setIsLoading(true)
    void (async () => {
      try {
        const response = await api.graph(request, controller.signal)
        if (!isCancelled) setData(normalizedResponse(response))
      } catch (error) {
        if (!isCancelled && (error as Error)?.name !== 'AbortError') {
          setLoadError(errorMessage(error))
        }
      } finally {
        if (!isCancelled) setIsLoading(false)
      }
    })()
    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [request, reload])
  return { data, loadError, isLoading, reload, setReload }
}

function GraphStats({ data }: { data: GraphResponse }) {
  const counts = graphNodeCounts(data.nodes)
  const linkCount = countWikiLinkEdges(data)
  return (
    <span className="whitespace-nowrap text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">
      {t('graph.stats_summary', { notes: counts.notes, links: linkCount })}
      {counts.tags > 0 && ` · ${t('graph.stats_tags', { count: counts.tags })}`}
      {counts.unresolved > 0 && ` · ${t('graph.stats_unresolved', { count: counts.unresolved })}`}
    </span>
  )
}

function GraphScopeToggle({ mode, onModeChange, hasActiveNote }: {
  mode: GraphPreferences['mode']
  onModeChange: (mode: GraphPreferences['mode']) => void
  hasActiveNote: boolean
}) {
  const options = useMemo(() => [
    { value: 'global' as const, label: t('graph.global') },
    { value: 'local' as const, label: t('graph.local'), disabled: !hasActiveNote },
  ], [hasActiveNote])

  return (
    <Segmented
      size='sm'
      label={t('graph.scope')}
      options={options}
      value={mode}
      onChange={onModeChange}
    />
  )
}

function GraphSearchBox({ search, onSearchChange }: {
  search: string
  onSearchChange: (value: string) => void
}) {
  return (
    <div className='min-w-37.5 flex-1 md:max-w-80'>
      <Input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={t('graph.search_notes')}
        aria-label={t('graph.search_notes')}
        title={t('graph.filter_syntax_hint')}
        leading={<Search size={13} className='text-[var(--text-quaternary)]'/>}
        trailing={
          search ? (
            <IconButton
              size='sm'
              label={t('common.clear')}
              onClick={() => onSearchChange('')}
              className='size-5 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]'
            >
              <X size={12}/>
            </IconButton>
          ) : undefined
        }
        className='h-8 text-[length:var(--text-12)]'
      />
    </div>
  )
}

/**
 * What the search box says about the graph it is standing in front of: how many notes it located, whether
 * it is only showing them, and a way onto the first one. The count is read off the canvas rather than from
 * a second request, so it is the answer to "where is it" rather than "what else is there" (G-14).
 */
function GraphSearchFeedback({ state, onToggleOnlyMatching, onJumpToFirstMatch }: {
  state: GraphSearchState
  onToggleOnlyMatching: () => void
  onJumpToFirstMatch: (id: string) => void
}) {
  const firstHitId = state.firstHitId
  return (
    <div className='flex items-center gap-1'>
      <span role='status' data-graph-search-status='' className='whitespace-nowrap text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]'>
        {state.hits > 0 ? t('graph.matching_notes', { count: state.hits }) : t('graph.no_matching_notes')}
      </span>
      <Tooltip label={t('graph.only_matching_notes')}>
        <IconButton
          size='sm'
          label={t('graph.only_matching_notes')}
          active={state.isOnlyMatching}
          onClick={onToggleOnlyMatching}
        >
          <ListChecks size={13}/>
        </IconButton>
      </Tooltip>
      {firstHitId && (
        <Tooltip label={t('graph.jump_to_first_match')}>
          <IconButton size='sm' label={t('graph.jump_to_first_match')} onClick={() => onJumpToFirstMatch(firstHitId)}>
            <CornerDownRight size={13}/>
          </IconButton>
        </Tooltip>
      )}
    </div>
  )
}

function GraphHeaderActions({ actions }: { actions: GraphHeaderActionsProps }) {
  const { hasGraph, isSettingsOpen, isExporting, settingsId, settingsButtonRef, onZoomOut, onFit, onZoomIn, onExportPng, onExportSvg, onToggleSettings, onClose } = actions
  const drawerIsDialog = useBreakpoint() === 'mobile'
  return (
    <div className='ml-auto flex items-center gap-1'>
      <Tooltip label={t('common.zoom_out')}><IconButton label={t('common.zoom_out')} size='sm' disabled={!hasGraph} onClick={onZoomOut}><Minus size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.fit')}><IconButton label={t('graph.fit')} size='sm' disabled={!hasGraph} onClick={onFit}><Maximize2 size={13}/></IconButton></Tooltip>
      <Tooltip label={t('common.zoom_in')}><IconButton label={t('common.zoom_in')} size='sm' disabled={!hasGraph} onClick={onZoomIn}><Plus size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.export_png')}><IconButton label={t('graph.export_png')} size='sm' disabled={!hasGraph || isExporting} onClick={onExportPng}><ImageDown size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.export_svg')}><IconButton label={t('graph.export_svg')} size='sm' disabled={!hasGraph || isExporting} onClick={onExportSvg}><Download size={14}/></IconButton></Tooltip>
      {/* Beside the canvas the drawer is a column of this panel, so claiming a popup dialog there was a
          claim about something this control does not open (G-25). */}
      <Tooltip label={t('graph.settings')}><IconButton label={t('graph.settings')} size='sm' ref={settingsButtonRef} aria-controls={settingsId} aria-haspopup={drawerIsDialog ? 'dialog' : undefined} aria-expanded={isSettingsOpen} onClick={onToggleSettings}><Settings2 size={14}/></IconButton></Tooltip>
      <Tooltip label={t('common.close')} combo='escape' side='left'><IconButton label={t('common.close')} size='sm' onClick={onClose} className='ml-1'><X size={16}/></IconButton></Tooltip>
    </div>
  )
}

function useGraphHeaderActions(options: {
  data: GraphResponse | null
  isSettingsOpen: boolean
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  settingsId: string
  settingsButtonRef: RefObject<HTMLButtonElement | null>
  refs: ReturnType<typeof useGraphCanvasRefs>
  exportActions: ReturnType<typeof useGraphExport>
  onClose: () => void
}): GraphHeaderActionsProps {
  const { data, isSettingsOpen, setIsSettingsOpen, settingsId, settingsButtonRef, refs, exportActions, onClose } = options
  return useMemo(() => ({
    hasGraph: Boolean(data?.nodes.length),
    isSettingsOpen,
    isExporting: exportActions.isExporting,
    settingsId,
    settingsButtonRef,
    onZoomOut: () => refs.controlsRef.current?.zoomOut(),
    onFit: () => refs.controlsRef.current?.fit(),
    onZoomIn: () => refs.controlsRef.current?.zoomIn(),
    onExportPng: exportActions.exportPng,
    onExportSvg: exportActions.exportSvg,
    onToggleSettings: () => setIsSettingsOpen((value) => !value),
    onClose,
  }), [data?.nodes.length, isSettingsOpen, onClose, refs.controlsRef, setIsSettingsOpen, settingsId, settingsButtonRef, exportActions])
}

/** A folder filter whose folder is gone would keep narrowing the graph to nothing, so it is dropped. */
function useFolderFilterRepair(
  prefs: GraphPreferences,
  folders: readonly { id: string }[],
  changePref: <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => void,
): void {
  useEffect(() => {
    if (prefs.folderId && folders.length > 0 && !folders.some((folder) => folder.id === prefs.folderId)) {
      changePref('folderId', '')
    }
  }, [folders, prefs.folderId])
}

/** Focus goes into the drawer when it opens and comes back to the control that opened it when it closes. */
function useSettingsDisclosureFocus(isOpen: boolean): RefObject<HTMLButtonElement | null> {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wasOpenRef = useRef(false)
  useEffect(() => {
    if (isOpen) { wasOpenRef.current = true; return }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    triggerRef.current?.focus({ preventScroll: true })
  }, [isOpen])
  return triggerRef
}

function GraphHeader({ titleId, data, prefs, hasActiveNote, onModeChange, search, onSearchChange, searchState, onToggleOnlyMatching, onJumpToFirstMatch, actions }: GraphHeaderProps) {
  return (
    <header className='flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 md:px-4'>
      <div className='mr-1 flex min-w-0 items-baseline gap-2.5'>
        <h2 id={titleId} className={`text-[length:var(--text-14)] font-semibold ${TRACKING_TITLE}`}>{t('common.graph')}</h2>
        {data && <GraphStats data={data}/>}
      </div>
      <GraphScopeToggle mode={prefs.mode} onModeChange={onModeChange} hasActiveNote={hasActiveNote} />
      <GraphSearchBox search={search} onSearchChange={onSearchChange}/>
      {searchState && <GraphSearchFeedback state={searchState} onToggleOnlyMatching={onToggleOnlyMatching} onJumpToFirstMatch={onJumpToFirstMatch}/>}
      <GraphHeaderActions actions={actions}/>
    </header>
  )
}

function GraphBody({ data, loadError, isNarrowed, onRetry, onClearFilters, children }: {
  data: GraphResponse | null
  loadError: string | null
  isNarrowed: boolean
  onRetry: () => void
  onClearFilters: () => void
  children: (data: GraphResponse) => React.ReactNode
}) {
  if (loadError)
    return <Empty art='notes' title={t('graph.could_not_load_graph')} description={loadError}
      action={<Button size='sm' variant='secondary' onClick={onRetry}>{t('common.retry')}</Button>}/>
  if (!data)
    return <LoadingBlock label={t('graph.building_graph')}/>
  if (data.nodes.length === 0)
    // A graph the reader narrowed to nothing is not a library with nothing in it: the second copy describes
    // notes that were never linked, and leaves them no way back out of the first.
    return isNarrowed
      ? <Empty art='notes' title={t('graph.nothing_matches_the_filters')}
        action={<Button size='sm' variant='secondary' onClick={onClearFilters}>{t('graph.clear_all_filters')}</Button>}/>
      : <Empty art='notes' title={t('graph.nothing_to_graph_yet')} description={t('graph.connect_notes_with_wiki_links_and_their_graph_will_appear_here')}/>
  return children(data)
}

function GraphRefreshBadge({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div role='status' data-graph-refreshing='' className='pointer-events-none absolute top-3 right-4 rounded-full border border-[var(--border-default)] bg-[var(--bg-overlay)] px-3 py-1 text-[length:var(--text-11)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)]'>
      {t('graph.building_graph')}
    </div>
  )
}

function useGraphQueryRequest(prefs: GraphPreferences, activeNoteId: string | null, query: string, selectedTags: string[]): GraphQuery {
  return useMemo(() => graphRequest(prefs, activeNoteId, query, selectedTags), [
    activeNoteId,
    prefs.mode,
    prefs.depth,
    prefs.limit,
    prefs.folderId,
    prefs.tag,
    prefs.tagsMatch,
    prefs.includeOrphans,
    prefs.includeUnresolved,
    prefs.showTagNodes,
    prefs.excludedNoteIds,
    prefs.direction,
    query,
    selectedTags,
  ])
}

/**
 * The search box runs in two modes, and the difference is who answers it. By default the line is matched
 * against the notes already on screen, so the graph a reader is looking at is the graph they search and
 * its links stay drawn (G-14). Turning on "only the matching notes" hands the same line to the server,
 * which is the choice a reader makes when they want fewer notes rather than a marked-up field.
 */
function useGraphSearch(data: GraphResponse | null, query: string, isOnlyMatching: boolean): GraphSearchState | null {
  return useMemo(() => {
    if (!data || !query) return null
    const matched = isOnlyMatching
      ? new Set(data.nodes.map((node) => node.id))
      : graphSearchHits(data.nodes, query) ?? new Set<string>()
    return {
      hits: matched.size,
      firstHitId: data.nodes.find((node) => matched.has(node.id))?.id ?? null,
      // A response the server already narrowed has nothing left to fade.
      dimSet: isOnlyMatching ? null : matched,
      isOnlyMatching,
    }
  }, [data, isOnlyMatching, query])
}

/** The search line's two modes are kept together because they end together: an empty box answers nobody. */
function useGraphSearchMode() {
  const [search, setSearch] = useState('')
  const query = useDebouncedQuery(search, GRAPH_SEARCH_DEBOUNCE_MS)
  const [isOnlyMatching, setIsOnlyMatching] = useState(false)
  const changeSearch = (value: string) => {
    setSearch(value)
    // Erasing the line ends that search, so the next word is faded in place rather than arriving already filtered.
    if (!value.trim()) setIsOnlyMatching(false)
  }
  // A legend row is a filter line the reader did not have to type: press it to fade to that colour, press it
  // again to ask the server for only that colour, a third time to put the graph back.
  const cycleLegend = (query: string) => {
    if (search !== query) {
      changeSearch(query)
      return
    }
    if (!isOnlyMatching) {
      setIsOnlyMatching(true)
      return
    }
    changeSearch('')
  }
  return {
    search,
    query,
    isOnlyMatching,
    changeSearch,
    cycleLegend,
    toggleOnlyMatching: () => { setIsOnlyMatching((value) => !value) },
  }
}

function useTagReset(prefs: GraphPreferences, changePref: <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => void) {
  const closePanel = useUi((state) => state.closePanel)
  return () => {
    const key = clearSelectionToastKey(prefs.clearResetsTag, prefs.clearClosesPanel)
    clearTagSelection({ notify: key ? t(key) : true })
    if (prefs.clearResetsTag) changePref('tag', '')
    if (prefs.clearClosesPanel) closePanel()
  }
}

/** One press gives the whole graph back: the line, the single tag, the folder, and the tag selection. */
function clearAllGraphFilters(
  changeSearch: (value: string) => void,
  changePref: <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => void,
): void {
  changeSearch('')
  changePref('tag', '')
  changePref('folderId', '')
  clearTagSelection()
}

export function GraphPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [prefs, setPrefs] = useGraphPreferences()
  const [isSettingsOpen, setIsSettingsOpen] = useGraphSettingsDisclosure()
  const [isLimitOpen, setIsLimitOpen] = useState(false)
  const { search, query, isOnlyMatching, changeSearch, cycleLegend, toggleOnlyMatching } = useGraphSearchMode()
  const openNote = useNotes((state) => state.openNote)
  const folders = useNotes((state) => state.folders ?? [])
  const tags = useNotes((state) => state.tags ?? [])
  const createScopedNote = useCreateScopedNote(prefs)
  const activeNoteId = useUi((state) => state.activeNoteId)
  const refs = useGraphCanvasRefs(activeNoteId)
  useEscape(true, onClose)
  useLockScroll(true)
  useDialogFocus(true, panelRef)
  const selectedTags = useUi((state) => state.selectedTags)
  useEffect(() => {
    if (selectedTags.length < LIMITS.tagSelectionMax)
      setIsLimitOpen(false)
  }, [selectedTags.length])
  const request = useGraphQueryRequest(prefs, activeNoteId, isOnlyMatching ? query : '', selectedTags)
  const { data, loadError, isLoading, setReload } = useGraphData(request)
  const searchState = useGraphSearch(data, query, isOnlyMatching)
  const settingsId = useId()
  const settingsButtonRef = useSettingsDisclosureFocus(isSettingsOpen)
  const changePref = <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }))
  }
  const { togglePin, toggleExclude } = graphIdListToggles(setPrefs)
  useFolderFilterRepair(prefs, folders, changePref)
  const resetTagFilters = useTagReset(prefs, changePref)
  const isNarrowed = Boolean(query || prefs.tag || prefs.folderId || selectedTags.length)
  const exportActions = useGraphExport(refs.stateRef, prefs)
  const headerActions = useGraphHeaderActions({ data, isSettingsOpen, setIsSettingsOpen, settingsId, settingsButtonRef, refs, exportActions, onClose })
  return createPortal(<div ref={panelRef} role='dialog' aria-modal='true' aria-labelledby={titleId} tabIndex={-1} data-surface='graph'
    className='app-viewport-fixed fixed z-[var(--z-graph)] flex flex-col bg-[var(--bg-base)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none md:py-0'>
    <GraphHeader titleId={titleId} data={data} prefs={prefs} hasActiveNote={Boolean(activeNoteId)} onModeChange={(mode) => changePref('mode', mode)} search={search} onSearchChange={changeSearch} searchState={searchState} onToggleOnlyMatching={toggleOnlyMatching} onJumpToFirstMatch={(id) => refs.controlsRef.current?.selectNode(id)} actions={headerActions}/>
    <div className='relative flex min-h-0 flex-1 overflow-hidden'>
      <main className='relative min-w-0 flex-1'>
        <GraphBody data={data} loadError={loadError} isNarrowed={isNarrowed} onRetry={() => setReload((value) => value + 1)} onClearFilters={() => { clearAllGraphFilters(changeSearch, changePref) }}>
          {(loaded) => <GraphCanvas data={loaded} prefs={prefs} searchHits={searchState?.dimSet ?? null} legendQuery={search || undefined} onLegendSelect={cycleLegend} activeNoteId={activeNoteId} canvasRef={refs.canvasRef} stateRef={refs.stateRef} hoverRef={refs.hoverRef} selectedIdRef={refs.selectedIdRef} activeNoteIdRef={refs.activeNoteIdRef} lastPointerEventAtRef={refs.lastPointerEventAtRef} onOpenNote={openNote} onCreateNote={createScopedNote} onClose={onClose} onMakeLocal={() => changePref('mode', 'local')} onPinChange={togglePin} onExcludeChange={toggleExclude} onFilterByTag={(tag) => changePref('tag', tag)} controlsRef={refs.controlsRef}/>}
        </GraphBody>
        <GraphRefreshBadge visible={isLoading && Boolean(data)}/>
      </main>
      {isSettingsOpen && <GraphSettingsPanel prefs={prefs} onChange={(key, value) => changePref(key, value)} folders={folders} tags={tags} selectedTags={selectedTags} isLimitOpen={isLimitOpen} onToggleLimit={() => setIsLimitOpen((value) => !value)} drawerId={settingsId} onClose={() => setIsSettingsOpen(false)} onResetTagFilters={resetTagFilters} onRestoreDefaults={() => setPrefs((current) => ({ ...DEFAULT_PREFERENCES, mode: current.mode }))} onRestoreAllExcluded={() => changePref('excludedNoteIds', [])}/>}
    </div>
  </div>, document.body)
}