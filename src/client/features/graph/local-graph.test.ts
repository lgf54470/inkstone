import { createElement, act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { LocalGraphPanel } from './local-graph'
import { GRAPH_PREFS_KEY } from './graph-panel/constants'
import { click, mountGraphPanel, panelButton, panelSelect, releaseGraphPanels, selectOption, settleGraphPanel } from './graph-panel/graph-panel-mount.test-helpers'

vi.mock('../../lib/api', () => ({
  api: {
    graph: vi.fn(),
  },
}))

const sampleGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Note 1', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: null, folderColor: null, tags: [] },
    { id: 'note-2', title: 'Note 2', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'local', centerId: 'note-1', depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 100 },
}

/** The same pair with a tag on the first one, so a colour rule has something to paint. */
const taggedGraph: GraphResponse = {
  ...sampleGraph,
  nodes: [
    { ...sampleGraph.nodes[0]!, tags: [{ name: 'work', color: '#059669' }] },
    sampleGraph.nodes[1]!,
  ],
}

describe('LocalGraphPanel data lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders header and loads local graph data', async () => {
    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    expect(container.querySelector('section')).toBeTruthy()
    expect(api.graph).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'local', center: 'note-1' }),
      expect.any(AbortSignal),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('2')
    unmount()
  })

  it('handles error state and provides retry', async () => {
    vi.mocked(api.graph).mockRejectedValueOnce(new Error('Network failure'))
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Network failure')

    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.toLowerCase().includes('retry'))
    if (retryBtn) {
      await act(async () => {
        retryBtn.click()
        await new Promise((r) => setTimeout(r, 20))
      })
    }

    expect(container.textContent).toContain('2')
    unmount()
  })
})

describe('LocalGraphPanel action callbacks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fires callbacks on header action buttons', async () => {
    vi.mocked(api.graph).mockResolvedValueOnce(sampleGraph)
    const onOpenFullGraph = vi.fn()
    const onClose = vi.fn()
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, {
      noteId: 'note-1',
      onOpenFullGraph,
      onClose,
    }))

    await act(async () => {
      await Promise.resolve()
    })

    const buttons = container.querySelectorAll('button')
    for (const btn of buttons) {
      act(() => {
        btn.click()
      })
    }

    expect(onOpenFullGraph).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    unmount()
  })
})

/** The request the companion sent, which is where a preference either reaches the server or does not. */
function askedFor(): Record<string, unknown> {
  return vi.mocked(api.graph).mock.calls.at(-1)![0] as unknown as Record<string, unknown>
}

/** The words of the colour legend the companion draws, which only exists once a preference says to. */
function companionLegend(container: HTMLElement): string {
  const legend = container.querySelector('[data-graph-legend]')
  if (!legend) throw new Error('the companion graph draws no colour legend')
  return legend.textContent ?? ''
}

describe('the companion graph wearing the reader’s own preferences (G-20)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('asks for the neighbourhood the reader configured, not the one the panel shipped', () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ depth: 3, includeUnresolved: false, showTagNodes: true }))
    vi.mocked(api.graph).mockResolvedValueOnce(taggedGraph)
    const { unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    expect(askedFor()).toEqual(expect.objectContaining({
      mode: 'local', center: 'note-1', depth: 3, includeUnresolved: false, showTagNodes: true,
    }))
    unmount()
  })

  it('paints the colour rules the reader set, which the full graph has always honoured', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ groupBy: 'tag' }))
    vi.mocked(api.graph).mockResolvedValueOnce(taggedGraph)
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))
    await act(async () => { await Promise.resolve() })

    expect(companionLegend(container)).toContain('work')
    unmount()
  })

  it('keeps the note’s own neighbourhood even while the full graph is filtered to a tag', () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ tag: 'work', folderId: 'a'.repeat(26) }))
    vi.mocked(api.graph).mockResolvedValueOnce(taggedGraph)
    const { unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))

    // A filter the companion cannot show or clear would empty the panel with no way back (G-15).
    const request = askedFor()
    expect(request.tags).toBeUndefined()
    expect(request.folderId).toBeUndefined()
    expect(request.q).toBeUndefined()
    unmount()
  })
})

describe('one surface writes the shared preferences (G-20)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('leaves the writing to the panel that owns the settings', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ depth: 2 }))
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    vi.mocked(api.graph).mockResolvedValueOnce(taggedGraph)
    const { unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))
    await settleGraphPanel()

    // Two surfaces persisting the same key would leave whichever let go last holding the graph (G-20).
    expect(writes.mock.calls.filter((call) => call[0] === GRAPH_PREFS_KEY)).toEqual([])
    writes.mockRestore()
    unmount()
  })
})

describe('the companion graph following a change made elsewhere (G-20)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('takes on a rule set in the full graph while it sits open behind it', async () => {
    vi.mocked(api.graph).mockResolvedValue(taggedGraph)
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, { noteId: 'note-1' }))
    await settleGraphPanel()
    expect(container.querySelector('[data-graph-legend]')).toBeNull()

    await mountGraphPanel(taggedGraph)
    click(panelButton(t('graph.settings')))
    selectOption(panelSelect(t('graph.group_by')), 'tag')
    await settleGraphPanel()

    expect(companionLegend(container)).toContain('work')
    unmount()
    releaseGraphPanels()
  })
})
