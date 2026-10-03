import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import type { GraphResponse } from '@shared/types'
import { api } from '../../../lib/api'
import { initI18n, t } from '../../../lib/i18n'
import { useUi } from '../../../store/ui'
import { GRAPH_PREFS_KEY } from './constants'
import {
  click,
  mountGraphPanel,
  panelButton,
  panelSelect,
  releaseGraphPanels,
  selectOption,
  settleGraphPanel,
  settlePersist,
} from './graph-panel-mount.test-helpers'

/**
 * Who points at a note and what it points at are two different questions, and the local graph has only
 * ever answered both (G-44). The choice belongs beside the depth it narrows, in the surface that is
 * already centred on a note — the overview has no centre to point from.
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
  meta: { mode: 'local', centerId: ALPHA, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function stored(): Record<string, unknown> {
  const raw = localStorage.getItem(GRAPH_PREFS_KEY)
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
}

function lastRequest(): Record<string, unknown> {
  return vi.mocked(api.graph).mock.calls.at(-1)![0] as unknown as Record<string, unknown>
}

function directionSelect(): HTMLSelectElement {
  return panelSelect(t('graph.link_direction'))
}

/** The scope toggle names its options by their visible text, not by an aria-label of their own. */
function chooseScope(label: string): void {
  const radio = [...document.querySelectorAll<HTMLButtonElement>('button[role="radio"]')]
    .find((item) => item.textContent?.trim() === label)
  if (!radio) throw new Error(`the scope toggle has no ${label}`)
  click(radio)
}

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
  // The local graph is centred on the note the reader is reading, so the case puts one under the cursor.
  useUi.setState({ activeNoteId: ALPHA })
})

afterEach(() => {
  releaseGraphPanels()
  useUi.setState({ activeNoteId: null })
  vi.clearAllMocks()
})

describe('the direction the local graph walks (G-44)', () => {
  it('is not offered while the panel is drawing the whole library', async () => {
    await mountGraphPanel(pair)
    click(panelButton(t('graph.settings')))
    await settleGraphPanel()

    expect(() => directionSelect()).toThrow()
  })

  it('is offered once the panel is centred on a note, and reaches the next request', async () => {
    await mountGraphPanel(pair)
    chooseScope(t('graph.local'))
    await settleGraphPanel()
    click(panelButton(t('graph.settings')))
    await settleGraphPanel()

    selectOption(directionSelect(), 'incoming')
    await settleGraphPanel()
    await settlePersist()

    expect(stored().direction).toBe('incoming')
    expect(lastRequest().direction).toBe('incoming')
  })

  it('stays out of the request when the reader goes back to the whole library', async () => {
    localStorage.setItem(GRAPH_PREFS_KEY, JSON.stringify({ mode: 'local', direction: 'outgoing' }))
    await mountGraphPanel(pair)
    await settleGraphPanel()
    expect(lastRequest().direction).toBe('outgoing')

    act(() => { useUi.setState({ activeNoteId: null }) })
    chooseScope(t('graph.global'))
    await settleGraphPanel()

    expect(lastRequest().direction).toBeUndefined()
  })
})
