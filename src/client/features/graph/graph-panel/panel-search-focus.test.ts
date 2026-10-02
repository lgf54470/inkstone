import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'
import { GRAPH_PREFS_KEY } from './constants'
import {
  click,
  mountGraphPanel,
  panelButton,
  panelCanvas,
  panelInput,
  panelStatusText,
  releaseGraphPanels,
  searchRequestQueries,
  settleGraphPanel,
  typeInto,
  waitQueryDebounce,
} from './graph-panel-mount.test-helpers'

/**
 * A reader who types a name into the graph's search box is looking for something in the graph they are
 * already looking at, not asking for a different graph (G-14). The old behaviour re-queried, which dropped
 * the links that made the note findable and, with the request throttling, blanked the canvas. These cases
 * type into the real header and count the requests it cost, read what the panel says it matched, and press
 * the two controls the search answers with.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const threeNotes: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 2, inDegree: 1, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-3', title: 'Gamma', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Life', folderColor: null, tags: [] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }, { source: 'note-2', target: 'note-3' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 3, totalEdges: 2, truncated: false, limit: 350 },
}

function panelText(): string {
  return document.body.querySelector('[data-surface="graph"]')!.textContent ?? ''
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
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('the search box locates the graph on screen instead of replacing it (G-14)', () => {
  it('types a name without asking the server again, and keeps the canvas that is already painted', async () => {
    await mountGraphPanel(threeNotes)
    const canvas = panelCanvas()

    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()

    expect(api.graph).toHaveBeenCalledTimes(1)
    expect(panelCanvas()).toBe(canvas)
    expect(panelStatusText('search-status')).toBe(t('graph.matching_notes', { count: 1 }))
  })

  it('keeps the links a faded node was reached through, since nothing was re-requested', async () => {
    await mountGraphPanel(threeNotes)

    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()

    // The response the faded graph is drawn from is still the whole one: Beta's two links are on screen.
    expect(searchRequestQueries()[0]).toBeUndefined()
    expect(api.graph).toHaveBeenCalledTimes(1)
  })
})

describe('what the search says about what it located (G-14)', () => {
  it('says so when the search hits nothing, rather than fading the field in silence', async () => {
    await mountGraphPanel(threeNotes)

    typeInto(panelInput(t('graph.search_notes')), 'Atlas')
    await waitQueryDebounce()

    expect(panelStatusText('search-status')).toBe(t('graph.no_matching_notes'))
    expect(api.graph).toHaveBeenCalledTimes(1)
  })

  it('offers the jump only where there is something to jump to', async () => {
    await mountGraphPanel(threeNotes)

    typeInto(panelInput(t('graph.search_notes')), 'Atlas')
    await waitQueryDebounce()
    expect(surfaceHasJump()).toBe(false)

    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    expect(surfaceHasJump()).toBe(true)
  })

  it('puts the first match under the reader, naming it the way an arrow key would', async () => {
    await mountGraphPanel(threeNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    expect(panelText()).not.toContain('Beta')

    click(panelButton(t('graph.jump_to_first_match')))
    await settleGraphPanel()

    expect(panelText()).toContain('Beta')
    expect(api.graph).toHaveBeenCalledTimes(1)
  })
})

describe('the search that really does narrow the graph, kept as a choice', () => {
  it('asks the server for only the matches when the reader turns that on', async () => {
    await mountGraphPanel(threeNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    expect(api.graph).toHaveBeenCalledTimes(1)

    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()

    expect(api.graph).toHaveBeenCalledTimes(2)
    expect(searchRequestQueries()[1]).toBe('Beta')
  })

  it('leaves the choice in the search box rather than in the stored preferences', async () => {
    await mountGraphPanel(threeNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()

    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()

    expect(JSON.parse(localStorage.getItem(GRAPH_PREFS_KEY) ?? '{}').onlyMatchingNotes).toBeUndefined()
  })
})

describe('the choice lasts as long as the search it was made for', () => {
  it('forgets the choice once the box is empty, so the next search starts faded rather than filtered', async () => {
    await mountGraphPanel(threeNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()
    expect(searchRequestQueries()[1]).toBe('Beta')

    typeInto(panelInput(t('graph.search_notes')), '')
    await waitQueryDebounce()

    typeInto(panelInput(t('graph.search_notes')), 'Gamma')
    await waitQueryDebounce()

    // Emptying the box ends the choice: the next word is faded in place and costs no request at all, since
    // the reader never pressed the switch again.
    expect(searchRequestQueries()).toEqual([undefined, 'Beta', undefined])
    expect(panelButton(t('graph.only_matching_notes')).getAttribute('aria-pressed')).toBe('false')
  })

  it('ends the choice when the line is left with nothing a search could match', async () => {
    await mountGraphPanel(threeNotes)
    typeInto(panelInput(t('graph.search_notes')), 'Beta')
    await waitQueryDebounce()
    click(panelButton(t('graph.only_matching_notes')))
    await settleGraphPanel()

    typeInto(panelInput(t('graph.search_notes')), '   ')
    await waitQueryDebounce()
    typeInto(panelInput(t('graph.search_notes')), 'Gamma')
    await waitQueryDebounce()

    // A line of spaces matches nothing, so the trimmed query is empty: same request shape as an erased box.
    expect(searchRequestQueries()).toEqual([undefined, 'Beta', undefined])
  })
})

function surfaceHasJump(): boolean {
  return Boolean(document.body.querySelector(`[data-surface="graph"] button[aria-label="${t('graph.jump_to_first_match')}"]`))
}
