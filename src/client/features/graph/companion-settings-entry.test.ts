import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphResponse } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { LocalGraphPanel } from './local-graph'
import { mountGraphPanel, click, panelDrawer, releaseGraphPanels } from './graph-panel/graph-panel-mount.test-helpers'

/**
 * The companion panel holds no settings of its own — it reads the ones the full graph writes (G-20) —
 * so the way out it offers has to lead there. These cases press the button in the companion's header and
 * then mount the real panel to see whether it honours what was asked.
 */

vi.mock('../../lib/api', () => ({
  api: {
    graph: vi.fn(),
  },
}))

const emptyGraph: GraphResponse = {
  nodes: [],
  edges: [],
  meta: { mode: 'local', centerId: 'note-1', depth: 1, totalNodes: 0, totalEdges: 0, truncated: false, limit: 100 },
}

function settingsEntry(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.getAttribute('aria-label') === t('graph.settings'))
  if (!button) throw new Error('the companion graph offers no way to the graph settings')
  return button
}

describe('reaching the graph settings from the companion (G-20)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(api.graph).mockResolvedValue(emptyGraph)
    useUi.setState({ panel: null, graphSettingsRequested: false })
  })

  it('asks for the settings the moment the reader presses the header button', () => {
    const { container, unmount } = renderElement(createElement(LocalGraphPanel, {
      noteId: 'note-1',
      onOpenSettings: () => useUi.getState().openGraphSettings(),
    }))

    click(settingsEntry(container))

    expect(useUi.getState().panel).toBe('graph')
    expect(useUi.getState().graphSettingsRequested).toBe(true)
    unmount()
  })

  it('finds the drawer already out when the graph opens on that request', async () => {
    useUi.getState().openGraphSettings()
    await mountGraphPanel(emptyGraph)

    expect(panelDrawer(t('graph.settings'))).toBeTruthy()
    expect(useUi.getState().graphSettingsRequested).toBe(false)
    releaseGraphPanels()
  })

  it('opens the graph on its own terms when nothing was asked for', async () => {
    await mountGraphPanel(emptyGraph)

    expect(panelDrawer(t('graph.settings'))).toBeNull()
    releaseGraphPanels()
  })
})
