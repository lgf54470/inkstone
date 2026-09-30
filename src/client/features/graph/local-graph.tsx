import { useEffect, useState } from 'react'
import { ExternalLink, Maximize2, Waypoints, X } from 'lucide-react'
import type { GraphQuery, GraphResponse } from '@shared/types'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { Button, IconButton } from '../../components/primitives'
import { Tooltip } from '../../components/overlay'
import { Empty, LoadingBlock } from '../../components/feedback'
import { useNotes } from '../../store/notes'
import { t } from '../../lib/i18n'
import { GraphCanvas } from './graph-panel/canvas'
import { DEFAULT_PREFERENCES } from './graph-panel/constants'
import { normalizedResponse } from './graph-panel/helpers'
import { useGraphCanvasRefs } from './graph-panel/canvas-hooks'

export interface LocalGraphPanelProps {
  noteId: string
  onClose?: () => void
  onOpenFullGraph?: () => void
}

function LocalGraphHeader({
  count,
  onFit,
  onOpenFullGraph,
  onClose,
}: {
  count?: number
  onFit: () => void
  onOpenFullGraph?: () => void
  onClose?: () => void
}) {
  return (
    <div className='sticky top-0 z-[var(--z-sticky)] flex h-8 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[length:var(--text-11)] font-semibold tracking-[var(--tracking-label)] text-[var(--text-quaternary)]'>
      <div className='flex items-center gap-1.5'>
        <Waypoints size={12} />
        <span>{t('graph.local_graph')}</span>
        {count !== undefined && <span className='tabular text-[length:var(--text-10\.5)]'>· {count}</span>}
      </div>
      <div className='flex items-center gap-0.5'>
        <Tooltip label={t('graph.fit')}>
          <IconButton label={t('graph.fit')} size='sm' onClick={onFit}>
            <Maximize2 size={12} />
          </IconButton>
        </Tooltip>
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

function useLocalGraphData(noteId: string, reload: number) {
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let isCancelled = false
    setData(null)
    setLoadError(null)
    const request: GraphQuery = {
      mode: 'local',
      center: noteId,
      depth: 1,
      limit: 100,
      includeOrphans: true,
      includeUnresolved: true,
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
  }, [noteId, reload])

  return { data, loadError }
}

interface LocalGraphContentProps {
  data: GraphResponse | null
  loadError: string | null
  noteId: string
  refs: ReturnType<typeof useGraphCanvasRefs>
  onRetry: () => void
  onClose?: () => void
}

function LocalGraphContent({ data, loadError, noteId, refs, onRetry, onClose }: LocalGraphContentProps) {
  const openNote = useNotes((state) => state.openNote)
  const createNote = useNotes((state) => state.createNote)
  const prefs = { ...DEFAULT_PREFERENCES, mode: 'local' as const }

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

export function LocalGraphPanel({ noteId, onClose, onOpenFullGraph }: LocalGraphPanelProps) {
  const [reload, setReload] = useState(0)
  const { data, loadError } = useLocalGraphData(noteId, reload)
  const refs = useGraphCanvasRefs(noteId)

  return (
    <section className='flex h-64 shrink-0 flex-col border-t border-[var(--border-subtle)] bg-[var(--bg-base)]'>
      <LocalGraphHeader
        count={data?.nodes.length}
        onFit={() => refs.controlsRef.current?.fit()}
        onOpenFullGraph={onOpenFullGraph}
        onClose={onClose}
      />
      <div className='relative min-h-0 flex-1 overflow-hidden'>
        <LocalGraphContent
          data={data}
          loadError={loadError}
          noteId={noteId}
          refs={refs}
          onRetry={() => setReload((v) => v + 1)}
          onClose={onClose}
        />
      </div>
    </section>
  )
}
