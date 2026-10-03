import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { t } from '../../../lib/i18n'
import { nodeHasMenuActions } from './canvas-hooks'
import { mountGraphCanvas, pressKey, releaseGraphCanvases, walkRightTo } from './graph-canvas-mount.test-helpers'

/**
 * A pin the reader placed is a decision about the picture, so it has to outlive the panel that drew it
 * (G-07 step 2). The canvas cannot persist anything itself — the preferences belong to the panel that
 * owns them — so what it owes is a call: the node it just pinned, and whether it is now pinned.
 */
const trio: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: 'note-3', title: 'Gamma', kind: 'note', degree: 0, inDegree: 0, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
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

describe('a pin nobody can store (G-07, F-10)', () => {
  function menuLabels(graph: ReturnType<typeof mountGraphCanvas>): string[] {
    walkRightTo(graph, { Alpha: [0, 0], Beta: [120, 0], Gamma: [0, -120] })
    pressKey(graph.canvas, 'ContextMenu')
    return [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].map((item) => item.textContent?.trim() ?? '')
  }

  it('is not offered on the graph inside a note, which has no way to keep one', () => {
    const graph = mountGraphCanvas(trio)

    // The companion panel reads the preferences and never writes them, so a pin placed there lives exactly
    // as long as the note stays open — offering it would promise a second of the two.
    const labels = menuLabels(graph)
    expect(labels).not.toContain(t('graph.pin_node'))
    expect(labels).toContain(t('graph.open_note'))
  })

  it('is offered where the panel can store it', () => {
    const graph = mountGraphCanvas(trio, { onPinChange: vi.fn() })

    expect(menuLabels(graph)).toContain(t('graph.pin_node'))
  })

  it('opens nothing at all on a tag node the note graph cannot act on', () => {
    // The note's own graph: no tag filter to narrow with, and no preferences to write a pin into.
    const graph = mountGraphCanvas({
      ...trio,
      nodes: [{ ...trio.nodes[0]!, id: 'tag:work', title: 'work', kind: 'tag', tags: [] }, ...trio.nodes.slice(1)],
    }, { withoutTagFilter: true })

    pressKey(graph.canvas, 'ArrowRight')
    pressKey(graph.canvas, 'ContextMenu')

    expect(document.body.querySelector('[role="menu"]')).toBeNull()
  })

  it('leaves a tag node with nothing to do, so no popup is opened for it', () => {
    const drawn = { ...trio.nodes[0]!, x: 0, y: 0, vx: 0, vy: 0, r: 8, tagColor: null, colorGroup: null }
    const tag = { ...drawn, kind: 'tag' as const, title: 'work' }

    expect(nodeHasMenuActions(tag, { canPin: false, canFilterByTag: false })).toBe(false)
    expect(nodeHasMenuActions(tag, { canPin: true, canFilterByTag: false })).toBe(true)
    expect(nodeHasMenuActions(tag, { canPin: false, canFilterByTag: true })).toBe(true)
    expect(nodeHasMenuActions(drawn, { canPin: false, canFilterByTag: false })).toBe(true)
  })
})
