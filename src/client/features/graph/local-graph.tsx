import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Maximize2, Settings2, Waypoints, X } from 'lucide-react'
import type { GraphQuery, GraphResponse } from '@shared/types'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { Button, IconButton } from '../../components/primitives'
import { Select } from '../../components/form'
import { Tooltip } from '../../components/overlay'
import { Empty, LoadingBlock } from '../../components/feedback'
import { useNotes } from '../../store/notes'
import { t } from '../../lib/i18n'
import { GRAPH_DEPTHS, type GraphPreferences } from '../../lib/graph-settings'
import { GraphCanvas } from './graph-panel/canvas'
import { normalizedResponse } from './graph-panel/helpers'
import { useGraphCanvasRefs } from './graph-panel/canvas-hooks'
import { useStoredGraphPreferences } from './graph-panel/use-graph-prefs'

export interface LocalGraphPanelProps {
  noteId: string
  onClose?: () => void
  onOpenFullGraph?: () => void
  /** The companion holds no settings of its own, so this leads to the panel that writes them (G-20). */
  onOpenSettings?: () => void
}

function LocalGraphHeader({
  count,
  depth,
  onDepthChange,
  onFit,
  onOpenSettings,
  onOpenFullGraph,
  onClose,
}: {
  count?: number
  depth: number
  onDepthChange: (depth: number) => void
  onFit: () => void
  onOpenSettings?: () => void
  onOpenFullGraph?: () => void
  onClose?: () => void
}) {
  return (
    <div className='sticky top-0 z-[var(--z-sticky)] flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-11)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>
      <div className='flex items-center gap-1.5'>
        <Waypoints size={12} />
        <span>{t('graph.local_graph')}</span>
        {count !== undefined && <span className='tabular text-[length:var(--text-10-5)]'>· {count}</span>}
      </div>
      <div className='flex items-center gap-0.5'>
        <Tooltip label={t('graph.depth')}>
          <Select
            aria-label={t('graph.depth')}
            value={String(depth)}
            onChange={(event) => onDepthChange(Number(event.target.value))}
            className='h-6 max-w-16 md:h-6 text-[length:var(--text-10-5)]'
          >
            {GRAPH_DEPTHS.map((option) => <option key={option} value={String(option)}>{option}</option>)}
          </Select>
        </Tooltip>
        <Tooltip label={t('graph.fit')}>
          <IconButton label={t('graph.fit')} size='sm' onClick={onFit}>
            <Maximize2 size={12} />
          </IconButton>
        </Tooltip>
        {onOpenSettings && (
          <Tooltip label={t('graph.settings')}>
            <IconButton label={t('graph.settings')} size='sm' onClick={onOpenSettings}>
              <Settings2 size={12} />
            </IconButton>
          </Tooltip>
        )}
        {onOpenFullGraph && (
          <Tooltip label={t('graph.open_full_graph')}>
            <IconButton label={t('graph.open_full_graph')} size='sm' onClick={onOpenFullGraph}>
              <ExternalLink size={12} />
            </IconButton>
          </Tooltip>
        )}
        {onClose && (
          <Tooltip label={t('common.close')}>
            <IconButton label={t('common.close')} size='sm' onClick={onClose}>
              <X size={13} />
            </IconButton>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

function useLocalGraphData(noteId: string, reload: number, prefs: GraphPreferences) {
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let isCancelled = false
    setData(null)
    setLoadError(null)
    // The companion asks for the neighbourhood the reader configured, keeping only what is its own: it is
    // always centred on this note, and it fills a panel rather than a screen. The filters a reader sets
    // alongside those preferences stay behind — a tag or folder the companion can neither show nor clear
    // would empty it with no way back (G-20, G-15).
    const request: GraphQuery = {
      mode: 'local',
      center: noteId,
      depth: prefs.depth,
      limit: prefs.limit,
      includeOrphans: prefs.includeOrphans,
      includeUnresolved: prefs.includeUnresolved,
      direction: prefs.direction,
      showTagNodes: prefs.showTagNodes,
    }
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
  }, [noteId, reload, prefs.depth, prefs.limit, prefs.includeOrphans, prefs.includeUnresolved, prefs.showTagNodes])

  return { data, loadError }
}

interface LocalGraphContentProps {
  data: GraphResponse | null
  loadError: string | null
  noteId: string
  prefs: GraphPreferences
  refs: ReturnType<typeof useGraphCanvasRefs>
  onRetry: () => void
  onClose?: () => void
}

function LocalGraphContent({ data, loadError, noteId, prefs, refs, onRetry, onClose }: LocalGraphContentProps) {
  const openNote = useNotes((state) => state.openNote)
  const createNote = useNotes((state) => state.createNote)

  if (loadError) {
    return (
      <div className='flex h-full items-center justify-center p-3'>
        <Empty
          art='notes'
          title={t('graph.could_not_load_graph')}
          description={loadError}
          action={<Button size='sm' variant='secondary' onClick={onRetry}>{t('common.retry')}</Button>}
        />
      </div>
    )
  }
  if (!data) {
    return (
      <div className='flex h-full items-center justify-center'>
        <LoadingBlock label={t('graph.building_graph')} />
      </div>
    )
  }
  return (
    <GraphCanvas
      data={data}
      prefs={prefs}
      activeNoteId={noteId}
      canvasRef={refs.canvasRef}
      stateRef={refs.stateRef}
      hoverRef={refs.hoverRef}
      selectedIdRef={refs.selectedIdRef}
      activeNoteIdRef={refs.activeNoteIdRef}
      lastPointerEventAtRef={refs.lastPointerEventAtRef}
      onOpenNote={openNote}
      onCreateNote={(title) => void createNote?.({ title, open: true })}
      onClose={() => onClose?.()}
      onMakeLocal={() => {}}
      controlsRef={refs.controlsRef}
    />
  )
}

export function LocalGraphPanel({ noteId, onClose, onOpenFullGraph, onOpenSettings }: LocalGraphPanelProps) {
  const [reload, setReload] = useState(0)
  // Read-only on purpose: the full-screen graph is the one surface that writes these back, and two
  // panels persisting the same key would leave whichever let go last holding the graph (G-20).
  const storedPrefs = useStoredGraphPreferences()
  const canvasPrefs = useMemo<GraphPreferences>(() => ({ ...storedPrefs, mode: 'local' }), [storedPrefs])
  // How wide this panel reaches is asked for here and lives nowhere else: it is not a setting the full
  // graph offers, so persisting it would put a second writer on the same key (G-21).
  const [depthOverride, setDepthOverride] = useState<number | null>(null)
  const requestPrefs = useMemo<GraphPreferences>(
    () => ({ ...canvasPrefs, depth: depthOverride ?? canvasPrefs.depth }),
    [canvasPrefs, depthOverride],
  )
  const { data, loadError } = useLocalGraphData(noteId, reload, requestPrefs)
  const refs = useGraphCanvasRefs(noteId)

  return (
    <section className='flex h-64 shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-base)]'>
      <LocalGraphHeader
        count={data?.nodes.length}
        depth={requestPrefs.depth}
        onDepthChange={setDepthOverride}
        onFit={() => refs.controlsRef.current?.fit()}
        onOpenSettings={onOpenSettings}
        onOpenFullGraph={onOpenFullGraph}
        onClose={onClose}
      />
      <div className='relative min-h-0 flex-1 overflow-hidden'>
        <LocalGraphContent
          data={data}
          loadError={loadError}
          noteId={noteId}
          prefs={canvasPrefs}
          refs={refs}
          onRetry={() => setReload((v) => v + 1)}
          onClose={onClose}
        />
      </div>
    </section>
  )
}
