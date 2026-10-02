import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { t } from '../../../lib/i18n'
import { mountGraphCanvas, pressKey, releaseGraphCanvases, walkRightTo } from './graph-canvas-mount.test-helpers'

/**
 * A pin the reader placed is a decision about the picture, so it has to outlive the panel that drew it
 * (G-07 step 2). The canvas cannot persist anything itself — the preferences belong to the panel that
 * owns them — so what it owes is a call: the node it just pinned, and whether it is now pinned.
 */
const trio: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-3', title: 'Gamma', kind: 'note', degree: 0, inDegree: 0, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 1, truncated: false, limit: 350 },
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  releaseGraphCanvases()
})

describe('a pin the panel is told about (G-07)', () => {
  it('reports the node it pinned, and the state it ended in', () => {
    const onPinChange = vi.fn()
    const graph = mountGraphCanvas(trio, { onPinChange })
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'ContextMenu')

    const item = [...(document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button') ?? [])]
      .find((button) => button.textContent?.includes(t('graph.pin_node')))
    expect(item).toBeTruthy()
    item!.click()

    expect(onPinChange).toHaveBeenCalledWith('note-2', true)
    expect(graph.state.nodes.find((node) => node.id === 'note-2')?.pinned).toBe(true)
  })

  it('says so again when the reader lets the node go', () => {
    const onPinChange = vi.fn()
    const graph = mountGraphCanvas(trio, { onPinChange })
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    graph.state.nodes.find((node) => node.id === 'note-2')!.pinned = true
    pressKey(graph.canvas, 'ContextMenu')

    const item = [...(document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button') ?? [])]
      .find((button) => button.textContent?.includes(t('graph.unpin_node')))
    expect(item).toBeTruthy()
    item!.click()

    expect(onPinChange).toHaveBeenCalledWith('note-2', false)
  })
})
