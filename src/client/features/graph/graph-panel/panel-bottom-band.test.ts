import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'
import { pressKey } from './graph-canvas-mount.test-helpers'
import { GRAPH_PREFS_KEY } from './constants'
import { mountGraphPanel, panelCanvas, panelOverlay, releaseGraphPanels, settleGraphPanel } from './graph-panel-mount.test-helpers'

/**
 * The colour legend hangs bottom-left and the node detail badge bottom-centre, and both used to be measured
 * from the same `bottom-4`. Measured in a browser at 375px: three rule rows make the legend 16→184px and the
 * badge 126→249px on the same line, so 58px of the badge was laid across the rows a reader presses to filter
 * (G-18). jsdom lays nothing out, so what a case can pin here is the structure that layout comes from — one
 * band holding both, stacked, with no band of its own on either child. The pixels are the browser's answer.
 */

vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

function node(id: string, title: string, tags: Array<{ name: string, color: string }>): GraphResponse['nodes'][number] {
  return {
    id, title, kind: 'note', degree: 1, inDegree: 0, outDegree: 1,
    folderId: null, folderName: 'Work', folderColor: null, tags,
  }
}

const coloured: GraphResponse = {
  nodes: [node('note-1', 'Alpha', [{ name: 'work', color: '#059669' }]), node('note-2', 'Beta', [{ name: 'urgent', color: '#dc2626' }])],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

const WORK = { id: 'r1', query: 'tag:work', color: '#4f46e5' }

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
  // The walk that selects a node is the keyboard one, and the canvas takes pointer capture on every press.
  HTMLElement.prototype.setPointerCapture = function capture() {}
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null })
  // The rules are preferences, so the legend they draw is on screen only because a reader wrote them.
  localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ colorGroups: [WORK] }))
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

/** Selects the first node the arrows reach, which is what puts the detail badge on screen. */
async function selectFirstNode(): Promise<void> {
  pressKey(panelCanvas()!, 'ArrowRight')
  await settleGraphPanel()
}

describe('the legend and the detail badge are one band, not two (G-18)', () => {
  it('stacks the legend over the badge instead of laying the badge across the rows', async () => {
    await mountGraphPanel(coloured)
    await selectFirstNode()

    const legend = panelOverlay('[data-graph-legend]')
    const detail = panelOverlay('[data-graph-detail]')
    expect(detail.textContent).toContain('Alpha')

    expect(detail.parentElement).toBe(legend.parentElement)
    expect(detail.parentElement?.className).toContain('flex-col')
    // Neither child carries a band of its own: two `bottom-4` on two absolutes is how they met in the
    // middle of the canvas in the first place.
    expect(legend.className).not.toContain('absolute')
    expect(detail.className).not.toContain('absolute')
    // The band is the whole bottom edge, so the badge it centres stays where it always was, and the
    // legend keeps its own left side rather than drifting into that centring.
    expect(detail.parentElement?.className).toContain('inset-x-4')
    expect(legend.className).toContain('self-start')
    // The legend is the row the band lays first, which is what leaves the badge on the edge it has
    // always sat on rather than floating over the colour list.
    expect(detail.parentElement?.firstElementChild).toBe(legend)
    expect(detail.parentElement?.lastElementChild).toBe(detail)
  })

  it('keeps the badge on the bottom edge when nothing colours the graph', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ colorGroups: [] }))
    await mountGraphPanel(coloured)
    await selectFirstNode()

    const detail = panelOverlay('[data-graph-detail]')
    expect(detail.textContent).toContain(t('graph.direction_counts', { incoming: 0, outgoing: 1 }))
    expect(detail.parentElement?.className).toContain('bottom-4')
  })
})
