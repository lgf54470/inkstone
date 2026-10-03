import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { useSession } from '../../../store/session'
import { GRAPH_PREFS_KEY } from './constants'
import {
  click,
  legendRow,
  mountGraphPanel,
  panelInput,
  panelStatusText,
  releaseGraphPanels,
  searchRequestQueries,
  settleGraphPanel,
  waitQueryDebounce,
} from './graph-panel-mount.test-helpers'

/**
 * The legend has always said which colour means what; a reader who wants *only* that colour had to type the
 * filter line out (G-14 ④). Every row is already a line the search box understands — a rule carries its own
 * query, a tag row its `tag:`, a folder row its `path:` — so pressing one writes into the search line rather
 * than inventing a third way to narrow a graph: first press fades to it, second asks the server for only it,
 * third puts the graph back.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const twoTags: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: 'Life', folderColor: null, tags: [{ name: 'urgent', color: '#dc2626' }] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

const WORK = { id: 'r1', query: 'tag:work', color: '#4f46e5' }
const URGENT = { id: 'r2', query: 'tag:urgent', color: '#dc2626' }

function boxValue(): string {
  return panelInput(t('graph.search_notes')).value
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
  // The rules are preferences, so the legend they draw is on screen only because a reader wrote them.
  localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ colorGroups: [WORK, URGENT] }))
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('the legend is a control, not only a caption (G-14 ④)', () => {
  it('draws each row as a real button the keyboard can stop on', async () => {
    await mountGraphPanel(twoTags)
    const row = legendRow(WORK.query)

    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('type')).toBe('button')
    expect(row.tabIndex).toBeGreaterThanOrEqual(0)
    expect(row.getAttribute('aria-pressed')).toBe('false')
  })

  it('fades the graph to that colour on the first press, without a second request', async () => {
    await mountGraphPanel(twoTags)

    click(legendRow(WORK.query))
    await waitQueryDebounce()

    expect(boxValue()).toBe(WORK.query)
    expect(api.graph).toHaveBeenCalledTimes(1)
    expect(legendRow(WORK.query).getAttribute('aria-pressed')).toBe('true')
    expect(panelStatusText('search-status')).toBe(t('graph.matching_notes', { count: 1 }))
  })
})

describe('pressing the row that is already held cycles the search', () => {
  it('asks the server for only that colour on the second press', async () => {
    await mountGraphPanel(twoTags)

    click(legendRow(WORK.query))
    await waitQueryDebounce()
    click(legendRow(WORK.query))
    await settleGraphPanel()

    expect(searchRequestQueries()).toEqual([undefined, WORK.query])
  })

  it('puts the whole graph back on the third press', async () => {
    await mountGraphPanel(twoTags)

    click(legendRow(WORK.query))
    await waitQueryDebounce()
    click(legendRow(WORK.query))
    await settleGraphPanel()
    click(legendRow(WORK.query))
    await waitQueryDebounce()

    expect(boxValue()).toBe('')
    expect(legendRow(WORK.query).getAttribute('aria-pressed')).toBe('false')
    expect(searchRequestQueries()).toEqual([undefined, WORK.query, undefined])
  })

  it('moves the pressed row to the colour pressed next, still without a request', async () => {
    await mountGraphPanel(twoTags)

    click(legendRow(WORK.query))
    await waitQueryDebounce()
    click(legendRow(URGENT.query))
    await waitQueryDebounce()

    expect(boxValue()).toBe(URGENT.query)
    expect(legendRow(WORK.query).getAttribute('aria-pressed')).toBe('false')
    expect(legendRow(URGENT.query).getAttribute('aria-pressed')).toBe('true')
    expect(api.graph).toHaveBeenCalledTimes(1)
  })
})
