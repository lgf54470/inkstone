import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ImageDown, Maximize2, Minus, Plus, Search, Settings2, X } from 'lucide-react'
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
import { useNotes } from '../../../store/notes'
import { useSession } from '../../../store/session'
import { useUi } from '../../../store/ui'
import { t } from '../../../lib/i18n'
import { GraphCanvas } from './canvas'
import { useGraphCanvasRefs } from './canvas-hooks'
import { GraphSettingsPanel } from './settings'
import { useGraphExport } from './use-graph-export'
import { DEFAULT_PREFERENCES } from './constants'
import { countWikiLinkEdges, graphNodeCounts, graphPrefsStorageKey, loadPreferences, normalizedResponse } from './helpers'
import type { GraphHeaderActionsProps, GraphHeaderProps } from './types'

const TRACKING_TITLE = 'tracking-[var(--tracking-graph-title)]'

function useGraphPrefs() {
  const userId = useSession((state) => state.user?.id)
  const [prefs, setPrefs] = useState(() => loadPreferences(userId))
  useEffect(() => {
    try {
      localStorage.setItem(graphPrefsStorageKey(userId), JSON.stringify(prefs))
    } catch {
      // Private browsing or a locked-down browser can reject local preferences.
    }
  }, [prefs, userId])
  return [prefs, setPrefs] as const
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
    limit: 350,
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

function GraphHeaderActions({ actions }: { actions: GraphHeaderActionsProps }) {
  const { hasGraph, isSettingsOpen, isExporting, onZoomOut, onFit, onZoomIn, onExportPng, onExportSvg, onToggleSettings, onClose } = actions
  return (
    <div className='ml-auto flex items-center gap-1'>
      <Tooltip label={t('common.zoom_out')}><IconButton label={t('common.zoom_out')} size='sm' disabled={!hasGraph} onClick={onZoomOut}><Minus size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.fit')}><IconButton label={t('graph.reset')} size='sm' disabled={!hasGraph} onClick={onFit}><Maximize2 size={13}/></IconButton></Tooltip>
      <Tooltip label={t('common.zoom_in')}><IconButton label={t('common.zoom_in')} size='sm' disabled={!hasGraph} onClick={onZoomIn}><Plus size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.export_png')}><IconButton label={t('graph.export_png')} size='sm' disabled={!hasGraph || isExporting} onClick={onExportPng}><ImageDown size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.export_svg')}><IconButton label={t('graph.export_svg')} size='sm' disabled={!hasGraph || isExporting} onClick={onExportSvg}><Download size={14}/></IconButton></Tooltip>
      <Tooltip label={t('graph.settings')}><IconButton label={t('graph.settings')} size='sm' aria-haspopup='dialog' aria-expanded={isSettingsOpen} onClick={onToggleSettings}><Settings2 size={14}/></IconButton></Tooltip>
      <Tooltip label={t('common.close')} combo='escape' side='left'><IconButton label={t('common.close')} size='sm' onClick={onClose} className='ml-1'><X size={16}/></IconButton></Tooltip>
    </div>
  )
}

function useGraphHeaderActions(options: {
  data: GraphResponse | null
  isSettingsOpen: boolean
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>
  refs: ReturnType<typeof useGraphCanvasRefs>
  exportActions: ReturnType<typeof useGraphExport>
  onClose: () => void
}): GraphHeaderActionsProps {
  const { data, isSettingsOpen, setIsSettingsOpen, refs, exportActions, onClose } = options
  return useMemo(() => ({
    hasGraph: Boolean(data?.nodes.length),
    isSettingsOpen,
    isExporting: exportActions.isExporting,
    onZoomOut: () => refs.controlsRef.current?.zoomOut(),
    onFit: () => refs.controlsRef.current?.fit(),
    onZoomIn: () => refs.controlsRef.current?.zoomIn(),
    onExportPng: exportActions.exportPng,
    onExportSvg: exportActions.exportSvg,
    onToggleSettings: () => setIsSettingsOpen((value) => !value),
    onClose,
  }), [data?.nodes.length, isSettingsOpen, onClose, refs.controlsRef, setIsSettingsOpen, exportActions])
}

function GraphHeader({ titleId, data, prefs, hasActiveNote, onModeChange, search, onSearchChange, actions }: GraphHeaderProps) {
  return (
    <header className='flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 md:px-4'>
      <div className='mr-1 flex min-w-0 items-baseline gap-2.5'>
        <h2 id={titleId} className={`text-[length:var(--text-14)] font-semibold ${TRACKING_TITLE}`}>{t('common.graph')}</h2>
        {data && <GraphStats data={data}/>}
      </div>
      <GraphScopeToggle mode={prefs.mode} onModeChange={onModeChange} hasActiveNote={hasActiveNote} />
      <GraphSearchBox search={search} onSearchChange={onSearchChange}/>
      <GraphHeaderActions actions={actions}/>
    </header>
  )
}

function GraphBody({ data, loadError, onRetry, children }: {
  data: GraphResponse | null
  loadError: string | null
  onRetry: () => void
  children: (data: GraphResponse) => React.ReactNode
}) {
  if (loadError)
    return <Empty art='notes' title={t('graph.could_not_load_graph')} description={loadError}
      action={<Button size='sm' variant='secondary' onClick={onRetry}>{t('common.retry')}</Button>}/>
  if (!data)
    return <LoadingBlock label={t('graph.building_graph')}/>
  if (data.nodes.length === 0)
    return <Empty art='notes' title={t('graph.nothing_to_graph_yet')} description={t('graph.connect_notes_with_wiki_links_and_their_graph_will_appear_here')}/>
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
    prefs.folderId,
    prefs.tag,
    prefs.tagsMatch,
    prefs.includeOrphans,
    prefs.includeUnresolved,
    prefs.showTagNodes,
    query,
    selectedTags,
  ])
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

export function GraphPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [prefs, setPrefs] = useGraphPrefs()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLimitOpen, setIsLimitOpen] = useState(false)
  const [search, setSearch] = useState('')
  const query = useDebouncedQuery(search, 220)
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
  const request = useGraphQueryRequest(prefs, activeNoteId, query, selectedTags)
  const { data, loadError, isLoading, setReload } = useGraphData(request)
  const changePref = <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }))
  }
  useEffect(() => {
    if (prefs.folderId && folders.length > 0 && !folders.some((f) => f.id === prefs.folderId)) {
      changePref('folderId', '')
    }
  }, [folders, prefs.folderId])
  const resetTagFilters = useTagReset(prefs, changePref)
  const exportActions = useGraphExport(refs.stateRef, prefs)
  const headerActions = useGraphHeaderActions({ data, isSettingsOpen, setIsSettingsOpen, refs, exportActions, onClose })
  return createPortal(<div ref={panelRef} role='dialog' aria-modal='true' aria-labelledby={titleId} tabIndex={-1} data-surface='graph'
    className='app-viewport-fixed fixed z-[var(--z-graph)] flex flex-col bg-[var(--bg-base)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none md:py-0'>
    <GraphHeader titleId={titleId} data={data} prefs={prefs} hasActiveNote={Boolean(activeNoteId)} onModeChange={(mode) => changePref('mode', mode)} search={search} onSearchChange={setSearch} actions={headerActions}/>
    <div className='relative flex min-h-0 flex-1 overflow-hidden'>
      <main className='relative min-w-0 flex-1'>
        <GraphBody data={data} loadError={loadError} onRetry={() => setReload((value) => value + 1)}>
          {(loaded) => <GraphCanvas data={loaded} prefs={prefs} activeNoteId={activeNoteId} canvasRef={refs.canvasRef} stateRef={refs.stateRef} hoverRef={refs.hoverRef} selectedIdRef={refs.selectedIdRef} activeNoteIdRef={refs.activeNoteIdRef} lastPointerEventAtRef={refs.lastPointerEventAtRef} onOpenNote={openNote} onCreateNote={createScopedNote} onClose={onClose} onMakeLocal={() => changePref('mode', 'local')} onFilterByTag={(tag) => changePref('tag', tag)} controlsRef={refs.controlsRef}/>}
        </GraphBody>
        <GraphRefreshBadge visible={isLoading && Boolean(data)}/>
      </main>
      {isSettingsOpen && <GraphSettingsPanel prefs={prefs} onChange={(key, value) => changePref(key, value)} folders={folders} tags={tags} selectedTags={selectedTags} isLimitOpen={isLimitOpen} onToggleLimit={() => setIsLimitOpen((value) => !value)} onClose={() => setIsSettingsOpen(false)} onResetTagFilters={resetTagFilters} onRestoreDefaults={() => setPrefs((current) => ({ ...DEFAULT_PREFERENCES, mode: current.mode }))}/>}
    </div>
  </div>, document.body)
}