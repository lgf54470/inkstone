import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { GRAPH_PREFS_KEY } from './constants'
import { pressKey } from './graph-canvas-mount.test-helpers'
import { click, mountGraphPanel, panelCanvas, panelOverlay, pressEscape, releaseGraphPanels, settleGraphPanel, settlePersist } from './graph-panel-mount.test-helpers'

/**
 * The whole point of a pin is that the picture the reader arranged is the picture they come back to
 * (G-07 step 2). These cases take the shortest real path — keyboard onto a node, the actions menu, pin
 * it — and then read what the panel left in storage, which is what a reload would start from.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const pair: GraphResponse = {
  nodes: [
    { id: 'a'.repeat(26), title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'b'.repeat(26), title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'a'.repeat(26), target: 'b'.repeat(26) }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function storedPins(): string[] {
  const raw = localStorage.getItem(GRAPH_PREFS_KEY)
  return raw ? (JSON.parse(raw) as { pinnedNodeIds?: string[] }).pinnedNodeIds ?? [] : []
}

/** The pin item of the actions menu, whichever way the selected node currently stands. */
function pressPinItem(label: string): void {
  const item = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')]
    .find((button) => button.textContent?.includes(label))
  if (!item) throw new Error(`the node actions menu has no item named ${label}`)
  click(item)
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

describe('a pin that outlives the panel (G-07)', () => {
  it('stores the node it pinned, and drops it again when the reader lets go', async () => {
    await mountGraphPanel(pair)
    const canvas = panelCanvas()!
    canvas.focus()
    await settleGraphPanel()

    // One press enters the response at its first node; the badge says which one that turned out to be,
    // so the case never has to guess the order the panel laid the pair out in.
    await act(() => { canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })) })
    await settleGraphPanel()
    const selected = panelOverlay('[data-graph-detail]').textContent ?? ''
    expect(selected).toContain('Alpha')

    pressKey(canvas, 'ContextMenu')
    pressPinItem(t('graph.pin_node'))
    await settlePersist()

    expect(storedPins()).toEqual(['a'.repeat(26)])

    pressEscape(canvas)
    pressKey(canvas, 'ContextMenu')
    pressPinItem(t('graph.unpin_node'))
    await settlePersist()

    expect(storedPins()).toEqual([])
  })
})
