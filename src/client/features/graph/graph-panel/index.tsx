import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minus, Plus, Search, Settings2, X } from 'lucide-react'
import { LIMITS } from '@shared/constants'
import type { GraphQuery, GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { errorMessage } from '../../../lib/errors'
import { clearSelectionToastKey, clearTagSelection } from '../../../lib/tag-selection'
import { type GraphPreferences, type GroupBy } from '../../../lib/graph-settings'

export type { GraphPreferences, GroupBy }

import { Button, IconButton } from '../../../components/primitives'
import { Tooltip, useDialogFocus, useEscape, useLockScroll } from '../../../components/overlay'
import { Empty, LoadingBlock } from '../../../components/feedback'
import { useNotes } from '../../../store/notes'
import { useUi } from '../../../store/ui'
import { t } from '../../../lib/i18n'
import { GraphCanvas, type GraphControls } from './canvas'
import { GraphSettingsPanel } from './settings'
import { DEFAULT_PREFERENCES } from './constants'
import { loadPreferences, normalizedResponse } from './helpers'
import { GRAPH_PREFS_KEY } from './constants'
import type { CanvasNode, CanvasState } from './types'

export function GraphPanel({ onClose }: { onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const titleId = useId()
  const [prefs, setPrefs] = useState(loadPreferences)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLimitOpen, setIsLimitOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const openNote = useNotes((state) => state.openNote)
  const createNote = useNotes((state) => state.createNote)
  const folders = useNotes((state) => state.folders ?? [])
  // Notes created from unresolved nodes land in the graph's folder scope so
  // they inherit the folder name for the `{{folder}}` template placeholder.
  const createScopedNote = useCallback((title: string) => {
    void createNote?.({ title, open: true, folderId: prefs.folderId || undefined })
  }, [createNote, prefs.folderId])
  const tags = useNotes((state) => state.tags ?? [])
  const activeNoteId = useUi((state) => state.activeNoteId)
  const hoverRef = useRef<CanvasNode | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const activeNoteIdRef = useRef(activeNoteId)
  const lastPointerEventAtRef = useRef(Number.NEGATIVE_INFINITY)
  const stateRef = useRef<CanvasState>({
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0,
    dragging: null, pointers: new Map(), pinch: null,
    frame: 0, raf: 0, schedule: null,
  })
  const controlsRef = useRef<GraphControls | null>(null)

  useEscape(true, onClose)
  useLockScroll(true)
  useDialogFocus(true, panelRef)

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    try {
      localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify(prefs))
    } catch {
      // Private browsing or a locked-down browser can reject local preferences.
    }
  }, [prefs])

  const selectedTags = useUi((state) => state.selectedTags)

  useEffect(() => {
    if (selectedTags.length < LIMITS.tagSelectionMax)
      setIsLimitOpen(false)
  }, [selectedTags.length])
  const closePanel = useUi((state) => state.closePanel)
  const request: GraphQuery = useMemo(() => {
    // The sidebar's cmd/ctrl+click selections join the graph's own tag filter.
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
      limit: 350,
    }
  }, [activeNoteId, prefs.mode, prefs.depth, prefs.folderId, prefs.tag, prefs.tagsMatch, prefs.includeOrphans, prefs.includeUnresolved, query, selectedTags])

  useEffect(() => {
    if (request.mode === 'local' && !request.center) {
      setData(null)
      setLoadError(t('graph.local_requires_note'))
      return
    }
    const controller = new AbortController()
    let isCancelled = false
    setData(null)
    setLoadError(null)
    void (async () => {
      try {
        const response = await api.graph(request, controller.signal)
        if (!isCancelled) setData(normalizedResponse(response))
      } catch (error) {
        if (!isCancelled && (error as Error)?.name !== 'AbortError') {
          setLoadError(errorMessage(error))
        }
      }
    })()
    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [request, reload])
  const changePref = <K extends keyof GraphPreferences>(key: K, value: GraphPreferences[K]) => {
    setPrefs((current) => ({ ...current, [key]: value }))
  }
  const resetTagFilters = () => {
    const key = clearSelectionToastKey(prefs.clearResetsTag, prefs.clearClosesPanel)
    clearTagSelection({ notify: key ? t(key) : true })
    if (prefs.clearResetsTag)
      changePref('tag', '')
    if (prefs.clearClosesPanel)
      closePanel()
  }
  return createPortal(<div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
    className="app-viewport-fixed fixed z-[var(--z-graph)] flex flex-col bg-[var(--bg-base)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none md:py-0">
    <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2 md:px-4">
      <div className="mr-1 flex min-w-0 items-baseline gap-2.5">
        <h2 id={titleId} className="text-[length:var(--text-14)] font-semibold tracking-[-0.014em]">{t('common.graph')}</h2>
        {data && <span className="whitespace-nowrap text-[length:var(--text-11\.5)] text-[var(--text-quaternary)]">
          {data.nodes.filter((node) => node.kind === 'note').length}{t('graph.notes')}{data.edges.length}{t('graph.links')}
          {data.nodes.some((node) => node.kind === 'unresolved') && ` · ${data.nodes.filter((node) => node.kind === 'unresolved').length}${t('graph.unresolved_short')}`}
        </span>}
      </div>
      <div className="flex h-8 items-center rounded-[var(--r-md)] bg-[var(--bg-inset)] p-0.5" role="group" aria-label={t('graph.scope')}>
        <button type="button" aria-pressed={prefs.mode === 'global'} onClick={() => changePref('mode', 'global')}
          className={`h-7 rounded-[var(--r-sm)] px-2.5 text-[length:var(--text-11\.5)] ${prefs.mode === 'global' ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)]'}`}>
          {t('graph.global')}
        </button>
        <button type="button" aria-pressed={prefs.mode === 'local'} disabled={!activeNoteId} onClick={() => changePref('mode', 'local')}
          className={`h-7 rounded-[var(--r-sm)] px-2.5 text-[length:var(--text-11\.5)] disabled:opacity-40 ${prefs.mode === 'local' ? 'bg-[var(--bg-overlay)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)]'}`}>
          {t('graph.local')}
        </button>
      </div>
      <label className="flex h-8 min-w-[150px] flex-1 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border-default)] bg-[var(--bg-inset)] px-2.5 md:max-w-[320px]">
        <Search size={13} className="shrink-0 text-[var(--text-quaternary)]"/>
        <span className="sr-only">{t('graph.search_notes')}</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('graph.search_notes')}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--text-12)] outline-none placeholder:text-[var(--text-quaternary)]"/>
        {search && <button type="button" aria-label={t('common.clear')} onClick={() => setSearch('')}><X size={12}/></button>}
      </label>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip label={t('common.zoom_out')}><IconButton label={t('common.zoom_out')} size="sm" disabled={!data?.nodes.length} onClick={() => controlsRef.current?.zoomOut()}><Minus size={14}/></IconButton></Tooltip>
        <Tooltip label={t('graph.fit')}><IconButton label={t('graph.reset')} size="sm" disabled={!data?.nodes.length} onClick={() => controlsRef.current?.fit()}><Maximize2 size={13}/></IconButton></Tooltip>
        <Tooltip label={t('common.zoom_in')}><IconButton label={t('common.zoom_in')} size="sm" disabled={!data?.nodes.length} onClick={() => controlsRef.current?.zoomIn()}><Plus size={14}/></IconButton></Tooltip>
        <Tooltip label={t('graph.settings')}><IconButton label={t('graph.settings')} size="sm" aria-pressed={isSettingsOpen} onClick={() => setIsSettingsOpen((value) => !value)}><Settings2 size={14}/></IconButton></Tooltip>
        <Tooltip label={t('common.close')} combo="escape" side="left"><IconButton label={t('common.close')} size="sm" onClick={onClose} className="ml-1"><X size={16}/></IconButton></Tooltip>
      </div>
    </header>

    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      <main className="relative min-w-0 flex-1">
        {loadError ? <Empty art="notes" title={t('graph.could_not_load_graph')} description={loadError}
          action={<Button size="sm" variant="secondary" onClick={() => setReload((value) => value + 1)}>{t('common.retry')}</Button>}/>
        : !data ? <LoadingBlock label={t('graph.building_graph')}/>
        : data.nodes.length === 0 ? <Empty art="notes" title={t('graph.nothing_to_graph_yet')} description={t('graph.connect_notes_with_wiki_links_and_their_graph_will_appear_here')}/>
        : <GraphCanvas data={data} prefs={prefs} activeNoteId={activeNoteId} canvasRef={canvasRef} stateRef={stateRef} hoverRef={hoverRef} selectedIdRef={selectedIdRef} activeNoteIdRef={activeNoteIdRef} lastPointerEventAtRef={lastPointerEventAtRef} onOpenNote={openNote} onCreateNote={createScopedNote} onClose={onClose} onMakeLocal={() => changePref('mode', 'local')} controlsRef={controlsRef}/>}
      </main>
      {isSettingsOpen && <GraphSettingsPanel prefs={prefs} onChange={(key, value) => changePref(key, value)} folders={folders} tags={tags} selectedTags={selectedTags} isLimitOpen={isLimitOpen} onToggleLimit={() => setIsLimitOpen((value) => !value)} onClose={() => setIsSettingsOpen(false)} onResetTagFilters={resetTagFilters} onRestoreDefaults={() => setPrefs((current) => ({ ...DEFAULT_PREFERENCES, mode: current.mode }))}/>}
    </div>
  </div>, document.body)
}
