import { act, createElement, type RefObject } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { renderElement, type RenderedElement } from '../../../lib/test-render'
import { useUi } from '../../../store/ui'
import { DEFAULT_PREFERENCES } from './constants'
import { useGraphExport, type GraphExportActions } from './use-graph-export'
import type { GraphPreferences } from '../../../lib/graph-settings'
import type { CanvasNode, CanvasState } from './types'

/**
 * Exporting is the one graph action that leaves the app: the reader presses a button and a file
 * appears somewhere else. So the button has to stay shut while the picture is being painted, the
 * failure has to reach the reader rather than vanish, and the graph that gets drawn is the one on
 * screen. The file itself is the subject of `graph-export.test.ts`; here the promise is held open on
 * purpose to watch what the panel does around it.
 */
const exportStub = vi.hoisted(() => ({
  run: vi.fn<(state: CanvasState, prefs: GraphPreferences, kind: string) => Promise<void>>(() => Promise.resolve()),
}))

vi.mock('./graph-export', () => ({
  runGraphExport: (...args: Parameters<typeof exportStub.run>) => exportStub.run(...args),
}))

beforeAll(async () => {
  await initI18n()
})

const first: CanvasNode = {
  id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 1, outDegree: 0,
  folderId: null, folderPath: null, folderColor: null, tags: [],
  x: 0, y: 0, vx: 0, vy: 0, r: 10, tagColor: null, colorGroup: null,
}

function createState(): CanvasState {
  return {
    nodes: [first], edges: [], scale: 1.5, offsetX: 40, offsetY: 60, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 360, raf: 0, schedule: null,
  }
}

function gate(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {}
  const promise = new Promise<void>((resolve) => { release = resolve })
  return { promise, release }
}

const state = createState()
const stateRef: RefObject<CanvasState> = { current: state }

function Driver({ prefs, sink }: { prefs: GraphPreferences, sink: ExportSink }): null {
  sink.current = useGraphExport(stateRef, prefs)
  return null
}

interface ExportSink {
  current: GraphExportActions | null
}

const mounted: RenderedElement[] = []

function mount(prefs: GraphPreferences = DEFAULT_PREFERENCES): ExportSink {
  const sink: ExportSink = { current: null }
  mounted.push(renderElement(createElement(Driver, { prefs, sink })))
  return sink
}

function press(kind: 'png' | 'svg', sink: ExportSink): void {
  act(() => {
    if (kind === 'png') sink.current!.exportPng()
    else sink.current!.exportSvg()
  })
}

async function settle(sink: ExportSink): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(sink.current).not.toBeNull()
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  useUi.setState({ toasts: [] })
  exportStub.run.mockReset()
  exportStub.run.mockImplementation(() => Promise.resolve())
})

describe('graph export buttons (FEAT-05)', () => {
  it('holds the export shut until the picture has been handed over, then lets it go', async () => {
    const pending = gate()
    exportStub.run.mockReturnValueOnce(pending.promise)
    const sink = mount()
    press('png', sink)

    expect(sink.current!.isExporting).toBe(true)
    expect(exportStub.run).toHaveBeenCalledWith(state, DEFAULT_PREFERENCES, 'png')

    await act(async () => { pending.release() })
    await settle(sink)
    expect(sink.current!.isExporting).toBe(false)
  })

  it('exports the graph on screen when the reader asks for the vector file', async () => {
    const sink = mount({ ...DEFAULT_PREFERENCES, mode: 'local' })
    await act(async () => { sink.current!.exportSvg() })
    await settle(sink)
    expect(exportStub.run).toHaveBeenCalledWith(state, expect.objectContaining({ mode: 'local' }), 'svg')
  })

  it('tells the reader the graph has been exported', async () => {
    const sink = mount()
    await act(async () => { sink.current!.exportPng() })
    await settle(sink)
    expect(useUi.getState().toasts).toEqual([
      expect.objectContaining({ title: t('graph.export_done'), tone: 'success' }),
    ])
  })

  it('says why the export failed and keeps the button usable', async () => {
    exportStub.run.mockRejectedValueOnce(new Error('the picture could not be encoded as a PNG'))
    const sink = mount()
    await act(async () => { sink.current!.exportPng() })
    await settle(sink)

    expect(useUi.getState().toasts).toEqual([
      expect.objectContaining({
        title: t('graph.export_failed'),
        description: 'the picture could not be encoded as a PNG',
        tone: 'danger',
      }),
    ])
    expect(sink.current!.isExporting).toBe(false)
  })
})
