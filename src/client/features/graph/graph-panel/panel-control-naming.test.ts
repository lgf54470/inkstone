import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { initI18n, t } from '../../../lib/i18n'
import { mountGraphPanel, panelButton, releaseGraphPanels } from './graph-panel-mount.test-helpers'

/**
 * A control that says one thing out loud and another in print is the kind of mismatch a reader only
 * finds out about when the screen reader names a button they have never seen called that (G-35). The
 * graph's fit control used to be exactly that: the tooltip read `graph.fit` while the accessible name
 * read `graph.reset`. The pair itself — the message id on the print and on the name — is guarded in
 * `tests/graph-control-naming.test.ts`, because a tooltip's text only exists once a browser lays it out.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

const panelGraph: GraphResponse = {
  nodes: [
    { id: 'note-1', title: 'Alpha', kind: 'note', degree: 1, inDegree: 0, outDegree: 1, folderId: null, folderPath: null, folderColor: null, tags: [] },
  ],
  edges: [],
  meta: { mode: 'global', centerId: null, depth: 1, totalNodes: 1, totalEdges: 0, truncated: false, limit: 350 },
}

beforeAll(async () => {
  await initI18n()
  // The tooltip only shows for a pointer that can hover, which is the device this case is about.
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query === '(hover: hover) and (pointer: fine)', media: query,
    addEventListener: () => {}, removeEventListener: () => {},
  })))
})

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('a control named the way it is written (G-35)', () => {
  it('calls the fit control by the name the panel prints for it', async () => {
    await mountGraphPanel(panelGraph)

    expect(panelButton(t('graph.fit')).getAttribute('aria-label')).toBe(t('graph.fit'))
  })
})
