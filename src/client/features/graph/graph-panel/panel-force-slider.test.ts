import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { GRAPH_FORCE_RANGE, GRAPH_FORCE_RANGES } from '../../../lib/graph-settings'
import { GRAPH_PREFS_KEY } from './constants'
import {
  cancelRange,
  click,
  dragRange,
  mountGraphPanel,
  panelButton,
  panelCanvas,
  panelRange,
  releaseGraphPanels,
  releaseRange,
  settleGraphPanel,
  settlePersist,
  stepRange,
} from './graph-panel-mount.test-helpers'
import { GRAPH_PREFS_PERSIST_DEBOUNCE_MS } from './use-graph-prefs'

/**
 * A force slider is the one control a reader drags through dozens of values in a second, so these cases
 * ask what a single drag costs: how many times the panel is told, and how many times storage is written
 * (G-11). The other half pins that the track a reader drags on and the clamp a stored value passes
 * through are the same numbers, read from one table (G-32).
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const panelGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function prefWrites(calls: unknown[][]): unknown[][] {
  return calls.filter((call) => String(call[0]).startsWith(GRAPH_PREFS_KEY))
}

function storedPrefs(): Record<string, unknown> | null {
  const raw = localStorage.getItem(GRAPH_PREFS_KEY)
  return raw ? JSON.parse(raw) as Record<string, unknown> : null
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('a force slider that decides once (G-11)', () => {
  it('keeps a drag to itself until the handle is released, then writes it once', async () => {
    await mountGraphPanel(panelGraph)
    const canvas = panelCanvas()
    click(panelButton(t('graph.settings')))
    const repulsion = panelRange(t('graph.repulsion'))
    await settlePersist()

    const writes = vi.spyOn(Storage.prototype, 'setItem')
    stepRange(repulsion, '1200')
    stepRange(repulsion, '1500')
    await settleGraphPanel()

    expect(prefWrites(writes.mock.calls)).toEqual([])
    expect(api.graph).toHaveBeenCalledTimes(1)
    expect(panelCanvas()).toBe(canvas)

    releaseRange(repulsion)
    await settlePersist()

    const committed = prefWrites(writes.mock.calls)
    expect(committed).toHaveLength(1)
    expect(JSON.parse(String(committed[0][1])).repulsion).toBe(1500)
    writes.mockRestore()
  })

  it('keeps the value a gesture reached when the browser takes the gesture back', async () => {
    await mountGraphPanel(panelGraph)
    click(panelButton(t('graph.settings')))
    const repulsion = panelRange(t('graph.repulsion'))
    await settlePersist()

    stepRange(repulsion, '1700')
    cancelRange(repulsion)
    await settlePersist()

    expect(storedPrefs()?.repulsion).toBe(1700)
  })

  it('flushes a preference the reader set just before closing the panel', async () => {
    await mountGraphPanel(panelGraph)
    click(panelButton(t('graph.settings')))
    dragRange(panelRange(t('graph.repulsion')), '1600')
    releaseGraphPanels()

    expect(storedPrefs()?.repulsion).toBe(1600)
  })
})

/** The other half of G-11: the write is on a window, not on every change that reaches the preference. */
describe('a preference that persists on a window (G-11)', () => {
  it('coalesces two commits made inside one debounce window into a single write', async () => {
    await mountGraphPanel(panelGraph)
    click(panelButton(t('graph.settings')))
    const repulsion = panelRange(t('graph.repulsion'))
    await settlePersist()
    const writes = vi.spyOn(Storage.prototype, 'setItem')

    stepRange(repulsion, '1200')
    releaseRange(repulsion)
    // Half the window: the second commit arrives while the first is still waiting. Without a debounce
    // the first write has already gone out by now, which is what this case is there to notice.
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, GRAPH_PREFS_PERSIST_DEBOUNCE_MS / 2)) })
    stepRange(repulsion, '1400')
    releaseRange(repulsion)
    await settlePersist()

    expect(prefWrites(writes.mock.calls)).toHaveLength(1)
    expect(JSON.parse(String(prefWrites(writes.mock.calls)[0][1])).repulsion).toBe(1400)
    writes.mockRestore()
  })
})

/** The other half of G-32: the track a reader drags and the clamp a stored value passes through agree. */
describe('a force slider that offers what the settings keep (G-32)', () => {
  it('names the value it holds, the way the component library does', async () => {
    await mountGraphPanel(panelGraph)
    click(panelButton(t('graph.settings')))
    const repulsion = panelRange(t('graph.repulsion'))

    expect(repulsion.getAttribute('aria-label')).toBe(t('graph.repulsion'))
    expect(repulsion.getAttribute('aria-valuetext')).toBe(String(GRAPH_FORCE_RANGE.repulsion.default))
  })

  it('drags on the same track the stored preference is clamped to', async () => {
    await mountGraphPanel(panelGraph)
    click(panelButton(t('graph.settings')))

    for (const control of GRAPH_FORCE_RANGES) {
      const range = panelRange(t(control.labelKey))
      expect(Number(range.min)).toBe(control.min)
      expect(Number(range.max)).toBe(control.max)
      expect(Number(range.step)).toBe(control.step)
    }
  })
})
