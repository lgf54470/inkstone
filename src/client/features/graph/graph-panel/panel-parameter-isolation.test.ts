import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@shared/constants'
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
  panelRange,
  panelSelect,
  panelSwitch,
  releaseGraphPanels,
  selectOption,
  setRangeValue,
  settleGraphPanel,
} from './graph-panel-mount.test-helpers'

/**
 * Half of the graph's preferences are drawn on the client and half of them decide what the server sends.
 * A reader who drags a force slider wants the picture to move, not to disappear behind a new request, so
 * these cases press each kind of control on the real panel and read how many requests it cost and whether
 * the canvas on screen is still the one that was already there.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const tagged: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderName: 'Work', folderColor: null, tags: [{ name: 'work', color: '#059669' }] },
    { id: 'note-2', title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderName: 'Life', folderColor: null, tags: [{ name: 'urgent', color: '#dc2626' }] },
  ],
  edges: [{ source: 'note-1', target: 'note-2' }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

const signedIn = { id: 'prefs-user', login: 'prefs', name: 'Prefs', avatarUrl: '', role: 'owner' as const, createdAt: 0, username: 'prefs' }

function legendSwatch(label: string): Element | null {
  const text = Array.from(document.body.querySelectorAll('[data-surface="graph"] span')).find((span) => span.textContent === label)
  return text?.previousElementSibling ?? null
}

function storedPrefs(key: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(key)
  return raw ? JSON.parse(raw) as Record<string, unknown> : null
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

describe('graph preferences kept off the network (PERF-01)', () => {
  it('moves the force sliders on the client, without a second request or a rebuilt canvas', async () => {
    await mountGraphPanel(tagged)
    const canvas = panelCanvas()
    expect(canvas).toBeTruthy()
    expect(api.graph).toHaveBeenCalledTimes(1)

    click(panelButton(t('graph.settings')))
    setRangeValue(panelRange(t('graph.repulsion')), '1500')
    setRangeValue(panelRange(t('graph.link_distance')), '120')
    setRangeValue(panelRange(t('graph.node_size')), '1.4')

    expect(api.graph).toHaveBeenCalledTimes(1)
    expect(panelCanvas()).toBe(canvas)
  })

  it('takes the appearance toggles and the grouping as a repaint of what is already on screen', async () => {
    await mountGraphPanel(tagged)
    const canvas = panelCanvas()
    expect(legendSwatch('work')).toBeNull()

    click(panelButton(t('graph.settings')))
    selectOption(panelSelect(t('graph.group_by')), 'tag')
    click(panelSwitch(t('graph.show_labels')))
    click(panelSwitch(t('graph.show_arrows')))

    expect(api.graph).toHaveBeenCalledTimes(1)
    expect(panelCanvas()).toBe(canvas)
    expect(legendSwatch('work')?.getAttribute('style')).toContain('background-color: rgb(5, 150, 105)')
  })
})

describe('the graph preference that really does change what the server sends', () => {
  it('asks the server again when a filter really does change which notes are drawn', async () => {
    await mountGraphPanel(tagged)
    click(panelButton(t('graph.settings')))

    click(panelSwitch(t('graph.show_tags')))
    expect(api.graph).toHaveBeenCalledTimes(2)
    await settleGraphPanel()
    expect(panelCanvas()).toBeTruthy()
  })
})

describe('where the graph preferences get stored', () => {
  it('stores the forces under the account that set them, not under whoever signs in next', async () => {
    useSession.setState({ user: signedIn })
    await mountGraphPanel(tagged)

    click(panelButton(t('graph.settings')))
    setRangeValue(panelRange(t('graph.repulsion')), '1500')

    expect(storedPrefs(`${GRAPH_PREFS_KEY}.prefs-user`)?.repulsion).toBe(1500)
    expect(storedPrefs(GRAPH_PREFS_KEY)).toBeNull()
  })
})

/**
 * The server answers up to `LIMITS.graphNodeLimitMax` nodes and the panel used to ask for the same 350
 * however full the library got, so the only sign a reader had of the ceiling was the badge counting what
 * came back (G-21). The limit is now a preference like the others that decide what is sent.
 */
describe('the node limit a reader can ask for (G-21)', () => {
  function lastRequest(): Record<string, unknown> {
    return vi.mocked(api.graph).mock.calls.at(-1)![0] as unknown as Record<string, unknown>
  }

  it('asks for the limit the reader stored, not the one the panel shipped', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ limit: LIMITS.graphNodeLimitMax }))
    await mountGraphPanel(tagged)

    expect(lastRequest().limit).toBe(LIMITS.graphNodeLimitMax)
  })

  it('moves the slider into the next request and leaves it stored', async () => {
    await mountGraphPanel(tagged)
    click(panelButton(t('graph.settings')))
    setRangeValue(panelRange(t('graph.node_limit')), String(LIMITS.graphNodeLimitMax))
    await settleGraphPanel()

    expect(lastRequest().limit).toBe(LIMITS.graphNodeLimitMax)
    expect(storedPrefs(GRAPH_PREFS_KEY)?.limit).toBe(LIMITS.graphNodeLimitMax)
  })
})
