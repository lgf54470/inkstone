import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { GRAPH_PREFS_KEY } from './constants'
import { click, mountGraphPanel, panelButton, panelSwitch, releaseGraphPanels, settleGraphPanel, settlePersist } from './graph-panel-mount.test-helpers'

/**
 * An exported graph is the picture a reader pastes somewhere else, so the two choices that decide what
 * leaves the app — the note names and the ground under it — belong with the rest of the picture's
 * settings (G-05, G-45). These cases open the drawer the reader opens and follow one switch from the
 * drawer into storage, which is what the next export reads.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const pair: GraphResponse = {
  nodes: [
    { id: 'a'.repeat(26), title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
    { id: 'b'.repeat(26), title: 'Beta', kind: 'note', degree: 1, inDegree: 1, outDegree: 0, folderId: null, folderPath: null, folderColor: null, tags: [] },
  ],
  edges: [{ source: 'a'.repeat(26), target: 'b'.repeat(26) }],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 2, totalEdges: 1, truncated: false, limit: 350 },
}

function stored(): Record<string, unknown> {
  const raw = localStorage.getItem(GRAPH_PREFS_KEY)
  return raw ? JSON.parse(raw) as Record<string, unknown> : {}
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

describe('the export choices in the drawer (G-05, G-45)', () => {
  it('offers both switches where the reader sets the rest of the picture', async () => {
    await mountGraphPanel(pair)
    await settleGraphPanel()
    click(panelButton(t('graph.settings')))

    expect(panelSwitch(t('graph.export_without_titles'))).toBeTruthy()
    expect(panelSwitch(t('graph.export_transparent_background'))).toBeTruthy()
  })

  it('carries a switch from the drawer into what the next export will read', async () => {
    await mountGraphPanel(pair)
    await settleGraphPanel()
    click(panelButton(t('graph.settings')))
    click(panelSwitch(t('graph.export_without_titles')))
    await settlePersist()

    expect(stored().exportWithoutTitles).toBe(true)
    expect(stored().exportTransparentBackground).toBe(false)
  })
})
