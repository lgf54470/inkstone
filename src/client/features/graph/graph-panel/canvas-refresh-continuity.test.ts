import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphNode, GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'
import { buildInitialLayout, createGraphTicker, readThemeColors } from './canvas-draw'
import { DEFAULT_PREFERENCES, PHYSICS_FRAME_LIMIT } from './constants'
import type { CanvasState } from './types'
import {
  click,
  mountGraphPanel,
  panelButton,
  panelCanvas,
  panelGraph,
  panelSwitch,
  releaseGraphPanels,
  settleGraphPanel,
} from './graph-panel-mount.test-helpers'

vi.mock('../../../lib/api', () => ({ api: { graph: vi.fn() } }))

function node(id: string, degree = 1): GraphNode {
  return {
    id, title: id, kind: 'note', degree, inDegree: 0, outDegree: degree,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

function response(nodes: GraphNode[], edges: Array<[string, string]> = []): GraphResponse {
  return {
    nodes,
    edges: edges.map(([source, target]) => ({ source, target })),
    meta: { mode: 'global', centerId: null, depth: 1, totalNodes: nodes.length, totalEdges: edges.length, truncated: false, limit: 350 },
  }
}

function createState(): CanvasState {
  return {
    nodes: [], edges: [], scale: 1, offsetX: 0, offsetY: 0, width: 800, height: 600, viewLeft: 0, viewTop: 0,
    dragging: null, pointers: new Map(), pinch: null, searchHits: null, frame: 0, raf: 0, schedule: null,
  }
}

const idleContext = () => new Proxy({}, {
  get: (_target, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}),
}) as CanvasRenderingContext2D

interface FrameSource {
  pending: number
  step: () => void
  runUntilSettled: () => void
}

function manualFrames(): FrameSource {
  let queue: FrameRequestCallback[] = []
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queue.push(callback); return ++id })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  const source: FrameSource = {
    get pending() { return queue.length },
    step() { const due = queue; queue = []; for (const callback of due) callback(0) },
    runUntilSettled() {
      let frames = 0
      while (queue.length && frames < PHYSICS_FRAME_LIMIT + 40) { source.step(); frames++ }
    },
  }
  return source
}

function refreshStatus(): HTMLElement | null {
  return document.body.querySelector('[data-graph-refreshing]')
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null })
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('the layout a refresh keeps (G-06, G-07)', () => {
  it('carries the position, velocity and pin of every node the new response still holds', () => {
    const state = createState()
    buildInitialLayout(response([node('note-1'), node('note-2')], [['note-1', 'note-2']]), DEFAULT_PREFERENCES, state)
    const kept = state.nodes.find((item) => item.id === 'note-1')!
    kept.x = 123; kept.y = -45; kept.vx = 0.5; kept.vy = -0.25; kept.pinned = true

    buildInitialLayout(response([node('note-1'), node('note-2'), node('note-3')]), DEFAULT_PREFERENCES, state, state.nodes)

    const after = state.nodes.find((item) => item.id === 'note-1')!
    expect({ x: after.x, y: after.y, vx: after.vx, vy: after.vy, pinned: after.pinned })
      .toEqual({ x: 123, y: -45, vx: 0.5, vy: -0.25, pinned: true })
    expect(state.nodes.map((item) => item.id)).toEqual(['note-1', 'note-2', 'note-3'])
  })
})

describe('the fit a refreshed layout asks for (PERF-06)', () => {
  it('asks the camera to fit again when the new layout settles, not only the first time', () => {
    const state = createState()
    buildInitialLayout(response([node('note-1'), node('note-2')], [['note-1', 'note-2']]), DEFAULT_PREFERENCES, state)
    const frames = manualFrames()
    const onSettled = vi.fn()
    createGraphTicker({
      state, canvas: document.createElement('canvas'), ctx: idleContext(), colorsRef: { current: readThemeColors() },
      prefsRef: { current: DEFAULT_PREFERENCES }, hoverRef: { current: null }, selectedIdRef: { current: null },
      activeNoteIdRef: { current: null }, style: document.createElement('div').style, onSettled,
    })
    state.schedule?.()
    frames.runUntilSettled()
    expect(onSettled).toHaveBeenCalledTimes(1)

    state.frame = 0
    state.schedule?.()
    frames.runUntilSettled()
    expect(onSettled).toHaveBeenCalledTimes(2)
  })
})

describe('an in-place refresh on the real panel (G-06)', () => {
  it('keeps the canvas that is already on screen and says it is drawing the next response', async () => {
    await mountGraphPanel(panelGraph)
    const canvas = panelCanvas()
    expect(canvas).toBeTruthy()

    vi.mocked(api.graph).mockResolvedValueOnce(panelGraph)
    click(panelButton(t('graph.settings')))
    click(panelSwitch(t('graph.show_tags')))

    expect(api.graph).toHaveBeenCalledTimes(2)
    expect(panelCanvas()).toBe(canvas)
    expect(refreshStatus()?.textContent).toBe(t('graph.building_graph'))

    await settleGraphPanel()
    expect(panelCanvas()).toBe(canvas)
    expect(refreshStatus()).toBeNull()
  })
})
