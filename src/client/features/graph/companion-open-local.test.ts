import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import type { GraphResponse } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { LocalGraphPanel } from './local-graph'
import { GRAPH_PREFS_KEY } from './graph-panel/constants'
import { mountGraphPanel, click, releaseGraphPanels, settleGraphPanel } from './graph-panel/graph-panel-mount.test-helpers'

/**
 * A note's companion graph is already centred on that note, so the way out of it should not drop the
 * reader back into a whole-vault picture (G-48). The companion asks, the full panel honours, and the ask
 * is spent on the way — the same one-shot channel the settings drawer uses (G-20).
 */

vi.mock('../../lib/api', () => ({
  api: {
    graph: vi.fn(),
  },
}))

const emptyGraph: GraphResponse = {
  nodes: [],
  edges: [],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 0, totalEdges: 0, truncated: false, limit: 100 },
}

function resetGraphState(): void {
  localStorage.clear()
  vi.mocked(api.graph).mockResolvedValue(emptyGraph)
  useUi.setState({ panel: null, graphLocalRequested: false, activeNoteId: 'note-9' })
}

function fullGraphEntry(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.getAttribute('aria-label') === t('graph.open_full_graph'))
  if (!button) throw new Error('the companion graph offers no way to the full graph')
  return button
}

describe('the companion header asks for the note-centred view (G-48)', () => {
  beforeEach(resetGraphState)

  it('asks for the note-centred view the moment the reader presses the header button', () => {
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, {
      noteId: 'note-9',
      onOpenFullGraph: () => useUi.getState().openGraphAroundNote(),
    }))

    click(fullGraphEntry(container))

    expect(useUi.getState().panel).toBe('graph')
    expect(useUi.getState().graphLocalRequested).toBe(true)
    unmount()
  })

  it('sends the local view from its very first request when that was asked for', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'global' }))
    useUi.getState().openGraphAroundNote()
    const asked = vi.mocked(api.graph).mock.calls.length
    await mountGraphPanel(emptyGraph)

    const sent = vi.mocked(api.graph).mock.calls.slice(asked).map((call) => call[0])
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ mode: 'local', center: 'note-9' })
    expect(useUi.getState().graphLocalRequested).toBe(false)
    releaseGraphPanels()
  })

  it('turns a graph that is already open into the note-centred view', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'global' }))
    const asked = vi.mocked(api.graph).mock.calls.length
    await mountGraphPanel(emptyGraph)

    // The panel is already on screen, so the ask can only reach it through its own effect.
    act(() => { useUi.getState().openGraphAroundNote() })
    await settleGraphPanel()

    const sent = vi.mocked(api.graph).mock.calls.slice(asked).map((call) => call[0])
    expect(sent[0]).toMatchObject({ mode: 'global' })
    expect(sent.at(-1)).toMatchObject({ mode: 'local', center: 'note-9' })
    expect(useUi.getState().graphLocalRequested).toBe(false)
    releaseGraphPanels()
  })
})

describe('the full panel honours the ask and spends it (G-48)', () => {
  beforeEach(resetGraphState)

  it('goes back to the stored mode once the ask has been spent', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'global' }))
    useUi.getState().openGraphAroundNote()
    await mountGraphPanel(emptyGraph)
    releaseGraphPanels()

    // The panel honoured the ask and left its own mark on the preference key, so a reader who now puts
    // the stored mode back to global and opens the graph again gets global: the ask does not fire twice.
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'global' }))
    const asked = vi.mocked(api.graph).mock.calls.length
    await mountGraphPanel(emptyGraph)

    expect(vi.mocked(api.graph).mock.calls.slice(asked).map((call) => call[0]?.mode)).toEqual(['global'])
    releaseGraphPanels()
  })
})
