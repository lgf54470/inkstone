import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIMITS } from '@shared/constants'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { GRAPH_PREFS_KEY } from './constants'
import { pressKey } from './graph-canvas-mount.test-helpers'
import {
  click,
  mountGraphPanel,
  panelButton,
  panelCanvas,
  releaseGraphPanels,
  settleGraphPanel,
  panelTextButton,
  settlePersist,
} from './graph-panel-mount.test-helpers'

/**
 * A note the reader takes out of the graph is a decision about the picture, like a pin: it has to reach
 * the server that builds the picture, and it has to stay taken out (G-42). These cases take the shortest
 * real path — keyboard onto a node, the actions menu, exclude — and read both ends of it: the preference
 * the panel left in storage, the request line it then sent, and the way back the drawer offers.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const ALPHA = 'a'.repeat(26)
const BETA = 'b'.repeat(26)

const pair: GraphResponse = {
  nodes: [
    { id: ALPHA, title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: BETA, title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: ALPHA, target: BETA }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function storedExcluded(): string[] {
  const raw = localStorage.getItem(GRAPH_PREFS_KEY)
  const stored = raw ? JSON.parse(raw) as { excludedNoteIds?: unknown } : {}
  return Array.isArray(stored.excludedNoteIds) ? stored.excludedNoteIds as string[] : []
}

function lastRequest(): Record<string, unknown> {
  return vi.mocked(api.graph).mock.calls.at(-1)![0] as unknown as Record<string, unknown>
}

/** The item the note's own menu offers for this decision, whichever way it currently stands. */
function pressExcludeItem(label: string): void {
  const item = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')]
    .find((button) => button.textContent?.includes(label))
  if (!item) throw new Error(`the node actions menu has no item named ${label}`)
  click(item)
}

async function menuLabelsForSelected(): Promise<string[]> {
  const canvas = panelCanvas()!
  pressKey(canvas, 'ContextMenu')
  await settleGraphPanel()
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].map((item) => item.textContent?.trim() ?? '')
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('a note the reader took out of the graph (G-42)', () => {
  it('stores the note it excluded and asks the server again without it', async () => {
    await mountGraphPanel(pair)
    const canvas = panelCanvas()!
    canvas.focus()
    await settleGraphPanel()
    pressKey(canvas, 'ArrowRight')
    await settleGraphPanel()

    expect(await menuLabelsForSelected()).toContain(t('graph.exclude_from_graph'))
    pressExcludeItem(t('graph.exclude_from_graph'))
    await settlePersist()
    await settleGraphPanel()

    expect(storedExcluded()).toEqual([ALPHA])
    expect(lastRequest().excluded).toEqual([ALPHA])
  })

  it('says so on the same menu once the note is out, and puts it back on the second press', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ excludedNoteIds: [ALPHA] }))
    await mountGraphPanel(pair)
    const canvas = panelCanvas()!
    canvas.focus()
    await settleGraphPanel()
    pressKey(canvas, 'ArrowRight')
    await settleGraphPanel()

    const labels = await menuLabelsForSelected()
    expect(labels).toContain(t('graph.restore_to_graph'))
    expect(labels).not.toContain(t('graph.exclude_from_graph'))

    pressExcludeItem(t('graph.restore_to_graph'))
    await settlePersist()

    expect(storedExcluded()).toEqual([])
    expect(lastRequest().excluded).toBeUndefined()
  })

})

describe('the notes a reader took out, seen from the drawer (G-42)', () => {
  it('shows how many notes are out in the drawer, and takes them all back at once', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ excludedNoteIds: [ALPHA, BETA] }))
    await mountGraphPanel(pair)

    click(panelButton(t('graph.settings')))
    expect(document.body.textContent).toContain(t('graph.excluded_notes', { value: 2 }))

    click(panelTextButton(t('graph.restore_all_notes'))!)
    await settlePersist()

    expect(storedExcluded()).toEqual([])
    expect(LIMITS.graphExcludedMax).toBeGreaterThan(1)
  })
})
