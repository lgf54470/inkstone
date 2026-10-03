import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import {
  mountGraphCanvas,
  releaseGraphCanvases,
  type GraphCanvasMount,
} from './graph-canvas-mount.test-helpers'
import { DEFAULT_PREFERENCES } from './constants'

/**
 * A drawing that throws is the one failure mode a canvas panel cannot show a broken picture for: the
 * frame loop stops mid-settle, the camera never fits, and the reader is left holding a half-painted
 * graph with nothing said about it (G-13). These cases refuse the frame from the fixture and read what
 * the panel does about it — a named failure, a way back, and a loop that can be asked again.
 */

const pair: GraphResponse = {
  nodes: [
    { id: 'a'.repeat(26), title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: 'b'.repeat(26), title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'a'.repeat(26), target: 'b'.repeat(26) }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

let queued: FrameRequestCallback[] = []
let failing = false

/** The frame loop is driven by hand: nothing here waits for jsdom's own animation clock. */
function pump(): void {
  act(() => { queued.shift()?.(0) })
}

function paintError(graph: GraphCanvasMount): HTMLElement | null {
  return graph.container.querySelector('[data-graph-paint-error]')
}

function retryButton(graph: GraphCanvasMount): HTMLButtonElement | null {
  return [...graph.container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes(t('common.retry'))) ?? null
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  queued = []
  failing = true
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queued.push(cb); return queued.length })
  // The refused frame is an expected failure of this fixture, not a leak into the next case's console.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  releaseGraphCanvases()
  failing = false
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a graph that cannot be drawn (G-13)', () => {
  it('says which picture failed, instead of freezing on half of it', () => {
    const graph = mountGraphCanvas(pair, { prefs: DEFAULT_PREFERENCES, shouldFailPaint: () => failing })
    pump()

    expect(paintError(graph)?.textContent).toContain(t('graph.could_not_draw'))
    expect(paintError(graph)?.getAttribute('role')).toBe('alert')
    expect(retryButton(graph)).toBeTruthy()
  })

  it('asks for a frame again when the reader hands the drawing a second try', () => {
    const graph = mountGraphCanvas(pair, { prefs: DEFAULT_PREFERENCES, shouldFailPaint: () => failing })
    pump()
    expect(queued).toHaveLength(0)

    failing = false
    act(() => { retryButton(graph)?.click() })

    expect(paintError(graph)).toBeNull()
    expect(queued.length).toBeGreaterThan(0)
    pump()
    expect(queued.length).toBeGreaterThan(0)
  })
})
