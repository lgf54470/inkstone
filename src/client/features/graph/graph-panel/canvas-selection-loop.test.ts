import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphResponse, GraphNode } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { cancelPointer, movePointer, mountGraphCanvas, pressKey, pressPointer, releaseGraphCanvases, type GraphCanvasMount } from './graph-canvas-mount.test-helpers'
import { previewProbe } from './preview-stub.test-helpers'
import type { CanvasNode } from './types'

/**
 * Selecting a node asks the panel for two things it holds in state: the announcement and the preview card.
 * Both used to be handed an object whose identity changed on every render, and because the effect that
 * writes them listed that object as a dependency, each write scheduled the next one: the panel never came
 * back. These cases count the paints one selection costs.
 */

vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function node(id: string, title: string): GraphNode {
  return {
    id, title, kind: 'note', degree: 1, inDegree: 0, outDegree: 1,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const pair: GraphResponse = {
  nodes: [node('note-1', 'Alpha'), node('note-2', 'Beta')],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

/** What the panel says out loud when the reader lands on Alpha. */
function alphaSpoken(): string {
  return `Alpha, ${t('graph.direction_counts', { incoming: 0, outgoing: 1 })}`
}

/** Where the drawing puts a node, as pixels on the screen — the place a press has to land on. */
function screenCentreOf(graph: GraphCanvasMount, node: CanvasNode): { x: number; y: number } {
  const { viewLeft, viewTop, offsetX, offsetY, scale } = graph.state
  return { x: viewLeft + offsetX + node.x * scale, y: viewTop + offsetY + node.y * scale }
}

/** The card hanging on the graph, named — or null while the graph has none. */
function cardTitle(graph: GraphCanvasMount): string | null {
  return graph.container.querySelector('[data-preview-card]')?.getAttribute('data-preview-card') ?? null
}

function liveText(graph: GraphCanvasMount): string | undefined {
  return graph.container.querySelector('[aria-live="polite"]')?.textContent
}

/** Where the panel hangs the card, taken as the centre of the anchor element it handed over. */
function cardCentre(): { x: number; y: number } {
  const anchor = previewProbe.anchor
  if (!anchor?.isConnected) throw new Error('the preview card was given no anchor to hang from')
  return {
    x: Number.parseFloat(anchor.style.left) + Number.parseFloat(anchor.style.width) / 2,
    y: Number.parseFloat(anchor.style.top) + Number.parseFloat(anchor.style.height) / 2,
  }
}

interface Drag {
  graph: GraphCanvasMount
  start: { x: number; y: number }
}

/** Mounts the pair with both nodes where a case can reason about them, instead of on the panel's spiral. */
function mountPlaced(): GraphCanvasMount {
  const graph = mountGraphCanvas(pair)
  const [alpha, beta] = graph.state.nodes
  alpha!.x = 100
  alpha!.y = 100
  beta!.x = 100
  beta!.y = 320
  return graph
}

/** Presses the named node where the drawing puts it, and leaves the reader holding it. */
function pressNode(graph: GraphCanvasMount, title: string): { x: number; y: number } {
  const node = graph.state.nodes.find((candidate) => candidate.title === title)
  if (!node) throw new Error(`the fixture draws no ${title}`)
  const start = screenCentreOf(graph, node)
  pressPointer(graph.canvas, 'pointerdown', start.x, start.y)
  return start
}

/** A mounted pair with its first node pressed: the drag most of these cases are about. */
function pressFirstNode(): Drag {
  const graph = mountPlaced()
  return { graph, start: pressNode(graph, 'Alpha') }
}

beforeAll(async () => {
  await initI18n()
  // jsdom has neither a PointerEvent nor pointer capture, and the canvas takes the capture on every press.
  HTMLElement.prototype.setPointerCapture = function capture() {}
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  releaseGraphCanvases()
  previewProbe.renders = 0
  previewProbe.subscribes = 0
  previewProbe.anchor = null
})

describe('one selection, one paint', () => {
  it('paints the preview card once for the node a reader selected', () => {
    const graph = mountGraphCanvas(pair)
    previewProbe.renders = 0

    // The first arrow enters the graph at the first node (G-23), so one press is one selection.
    pressKey(graph.canvas, 'ArrowRight')

    expect(graph.container.querySelector('[data-preview-card="Alpha"]')).toBeTruthy()
    expect(previewProbe.renders).toBe(1)
  })

  it('keeps the single link-hover subscription it opened when the reader moves the selection', () => {
    const graph = mountGraphCanvas(pair)

    pressKey(graph.canvas, 'ArrowRight')
    pressKey(graph.canvas, 'ArrowLeft')

    expect(previewProbe.subscribes).toBe(1)
  })
})

// The card hangs from a place the panel worked out when the node was pressed, and a drag moves the node
// without working that place out again: the reader was left holding a card floating over empty canvas, at
// the spot where the node used to be, until the pointer found another one. These cases drag a node and
// read where the card is while the drag runs and after the reader lets go (G-16).
describe('the card goes while the reader drags the node (G-16)', () => {
  it('puts the card away while the reader is still dragging the node', () => {
    const { graph, start } = pressFirstNode()
    expect(cardTitle(graph)).toBe('Alpha')

    movePointer(graph.canvas, start.x + 40, start.y)

    expect(cardTitle(graph)).toBeNull()
  })

  it('puts the card away on a diagonal that only passes the click once both axes count', () => {
    const { graph, start } = pressFirstNode()
    // Three pixels each way is still inside the click on either axis alone; the line is the two of them added.
    movePointer(graph.canvas, start.x + 3, start.y + 3)

    expect(cardTitle(graph)).toBeNull()
  })

  it('puts the card away for the drag that follows one the browser took back', () => {
    const { graph, start } = pressFirstNode()
    movePointer(graph.canvas, start.x + 40, start.y)
    // The gesture is cancelled, so the reader never lets go and the canvas has no release to tidy up with.
    cancelPointer(graph.canvas)

    const beta = pressNode(graph, 'Beta')
    expect(cardTitle(graph)).toBe('Beta')
    movePointer(graph.canvas, beta.x + 30, beta.y)

    expect(cardTitle(graph)).toBeNull()
  })
})

describe('the card comes back on the node the reader dropped (G-16)', () => {
  it('hangs the card back on the node where the reader let go', () => {
    const { graph, start } = pressFirstNode()
    movePointer(graph.canvas, start.x + 40, start.y + 25)
    pressPointer(graph.canvas, 'pointerup', start.x + 40, start.y + 25)

    expect(cardTitle(graph)).toBe('Alpha')
    expect(cardCentre().x).toBeCloseTo(start.x + 40, 6)
    expect(cardCentre().y).toBeCloseTo(start.y + 25, 6)
  })

  it('keeps the card through a press whose pointer barely moved, and brings it to the node', () => {
    const { graph, start } = pressFirstNode()
    movePointer(graph.canvas, start.x + 2, start.y + 2)
    expect(cardTitle(graph)).toBe('Alpha')

    pressPointer(graph.canvas, 'pointerup', start.x + 2, start.y + 2)

    expect(cardTitle(graph)).toBe('Alpha')
    expect(cardCentre().x).toBeCloseTo(start.x + 2, 6)
  })
})

// Putting the card away must not turn a drag into something else: the reader who dragged a node does not
// get the note opened under them, and a panned camera still leaves them standing on what they were on.
describe('a dragged node is still not a clicked node (G-16)', () => {
  it('does not open the note the reader dragged, however they held a key when letting go', () => {
    const { graph, start } = pressFirstNode()
    movePointer(graph.canvas, start.x + 60, start.y)
    pressPointer(graph.canvas, 'pointerup', start.x + 60, start.y, { ctrlKey: true })

    expect(graph.open).not.toHaveBeenCalled()
    expect(cardTitle(graph)).toBe('Alpha')
  })

  it('leaves no card hanging over the graph while the camera is panned', () => {
    const { graph, start } = pressFirstNode()
    pressPointer(graph.canvas, 'pointerup', start.x, start.y)
    expect(cardTitle(graph)).toBe('Alpha')

    const empty = { x: start.x + 300, y: start.y + 200 }
    pressPointer(graph.canvas, 'pointerdown', empty.x, empty.y)
    movePointer(graph.canvas, empty.x - 60, empty.y - 40)
    pressPointer(graph.canvas, 'pointerup', empty.x - 60, empty.y - 40)

    expect(cardTitle(graph)).toBeNull()
    // Panning moves the camera, not the node the reader is on: it must not put the selection down.
    expect(liveText(graph)).toBe(alphaSpoken())
  })
})
