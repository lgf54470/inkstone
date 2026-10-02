import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphQuery, GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'
import { useUi } from '../../../store/ui'
import { GRAPH_PREFS_KEY } from './constants'
import {
  click,
  mountGraphPanel,
  panelButton,
  panelInput,
  panelTextButton,
  releaseGraphPanels,
  settleGraphPanel,
  typeInto,
  waitQueryDebounce,
} from './graph-panel-mount.test-helpers'

/**
 * A graph the reader narrowed to nothing is not an empty library (G-15): the panel described a state they
 * were not in — notes that have not been linked yet — and offered no way out of the narrowing that produced
 * it. These cases empty the graph the ways a reader can, and read what the panel says and what it offers.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const emptyGraph: GraphResponse = {
  nodes: [],
  edges: [],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 0, totalEdges: 0, truncated: false, limit: 350 },
}

const twoNotes: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'urgent', color: '#dc2626' }] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

/** Stored folder ids are cuid-shaped, so a filter the panel keeps has to look like one. */
const FOLDER_ID = 'a'.repeat(26)

function panelText(): string {
  return document.body.querySelector('[data-surface="graph"]')!.textContent ?? ''
}

function lastRequest(): Partial<GraphQuery> {
  const calls = vi.mocked(api.graph).mock.calls
  return (calls[calls.length - 1]?.[0] ?? {}) as Partial<GraphQuery>
}

function clearButton(): HTMLButtonElement {
  const button = panelTextButton(t('graph.clear_all_filters'))
  if (!button) throw new Error('the empty graph offers no way out')
  return button
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null })
  useUi.setState({ selectedTags: [] })
})

afterEach(() => {
  releaseGraphPanels()
  useUi.setState({ selectedTags: [] })
  vi.clearAllMocks()
})

describe('what an emptied graph says about itself', () => {
  it('names the filters when a tag filter emptied it, and offers a way back', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ tag: 'work' }))
    await mountGraphPanel(emptyGraph)

    expect(panelText()).toContain(t('graph.nothing_matches_the_filters'))
    expect(panelText()).not.toContain(t('graph.nothing_to_graph_yet'))
    expect(panelTextButton(t('graph.clear_all_filters'))).not.toBeNull()
  })

  it('names the filters when the line handed to the server matched nothing', async () => {
    await mountGraphPanel(twoNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    vi.mocked(api.graph).mockResolvedValue(emptyGraph)

    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()

    expect(panelText()).toContain(t('graph.nothing_matches_the_filters'))
  })

  it('keeps the empty-library copy when nothing narrows the graph', async () => {
    await mountGraphPanel(emptyGraph)

    expect(panelText()).toContain(t('graph.nothing_to_graph_yet'))
    expect(panelTextButton(t('graph.clear_all_filters'))).toBeNull()
  })

  it('counts a line the reader typed as a narrowing, filtered or not', async () => {
    await mountGraphPanel(emptyGraph)

    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()

    // Which of the two search modes is on does not decide what emptied the graph; the line itself does.
    expect(panelText()).toContain(t('graph.nothing_matches_the_filters'))
  })
})

describe('the way back out of a narrowing', () => {
  it('releases every filter with one press', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ tag: 'work', folderId: FOLDER_ID }))
    useUi.setState({ selectedTags: ['urgent'] })
    await mountGraphPanel(emptyGraph)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()
    expect(lastRequest().tags).toEqual(['work', 'urgent'])

    vi.mocked(api.graph).mockResolvedValue(twoNotes)
    click(clearButton())
    await waitQueryDebounce()

    expect(lastRequest().q).toBeUndefined()
    expect(lastRequest().tags).toBeUndefined()
    expect(lastRequest().folderId).toBeUndefined()
    expect(panelInput(t('graph.search_notes')).value).toBe('')
  })
})
