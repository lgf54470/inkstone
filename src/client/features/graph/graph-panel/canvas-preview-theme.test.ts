import { act } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { GraphNode, GraphResponse } from '@shared/types'
import { initI18n } from '../../../lib/i18n'
import { mountGraphCanvas, pressKey, releaseGraphCanvases } from './graph-canvas-mount.test-helpers'
import { previewProbe } from './preview-stub.test-helpers'

/**
 * A theme flip can reach the panel with nothing it is subscribed to: the account menu is out of reach
 * while the graph is open, so a "follow the system" flip only writes the document attribute, and another
 * tab's flip never touches this store at all. The preview card is React, not canvas, so the attribute has
 * to schedule a render — these cases flip it and read the flag the card was handed.
 */

vi.mock('../../preview', async () => (await import('./preview-stub.test-helpers')).previewStubModule())

function node(id: string, title: string, inDegree: number, outDegree: number): GraphNode {
  return {
    id, title, kind: 'note',
    degree: inDegree + outDegree, inDegree, outDegree,
    folderId: null, folderName: null, folderColor: null, tags: [],
  }
}

const trio: GraphResponse = {
  nodes: [node('note-1', 'Alpha', 1, 2), node('note-2', 'Beta', 0, 1), node('note-3', 'Gamma', 2, 0)],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 1, truncated: false, limit: 350 },
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  releaseGraphCanvases()
  document.documentElement.removeAttribute('data-theme')
  previewProbe.dark = null
})

async function flipDocumentTheme(theme: 'dark' | 'light'): Promise<void> {
  await act(async () => {
    document.documentElement.dataset.theme = theme
    await new Promise((resolve) => { setTimeout(resolve, 0) })
  })
}

describe('the preview card after a flip the panel did not cause', () => {
  it('re-renders the open card with the flipped theme', async () => {
    document.documentElement.dataset.theme = 'light'
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')
    expect(previewProbe.dark).toBe(false)

    await flipDocumentTheme('dark')

    expect(previewProbe.dark).toBe(true)
  })

  it('follows the flip back as well, not just the first change it sees', async () => {
    document.documentElement.dataset.theme = 'dark'
    const graph = mountGraphCanvas(trio)
    pressKey(graph.canvas, 'ArrowRight')
    expect(previewProbe.dark).toBe(true)

    await flipDocumentTheme('light')

    expect(previewProbe.dark).toBe(false)
  })
})
