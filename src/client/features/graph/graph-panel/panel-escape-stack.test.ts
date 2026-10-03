import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { click, mountGraphPanel, panelButton, panelCanvas, panelDrawer, pressEscape, releaseGraphPanels } from './graph-panel-mount.test-helpers'

/**
 * Escape is how a keyboard reader unwinds the graph, and one press has to unwind exactly one layer:
 * the drawer that was opened last, the panel only once nothing sits above it. The stack that decides
 * that lives in the overlay hooks and only real mount order can put two layers on it, so these cases
 * mount the panel itself and press the keys.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

beforeAll(async () => {
  await initI18n()
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
})

describe('graph escape stack (TEST-01)', () => {
  it('closes the settings drawer that was opened last and leaves the graph on screen', async () => {
    const { close } = await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    const drawer = panelDrawer(t('graph.settings'))
    expect(drawer).toBeTruthy()

    const event = pressEscape(drawer!)
    expect(event.defaultPrevented).toBe(true)
    expect(panelDrawer(t('graph.settings'))).toBeNull()
    expect(close).not.toHaveBeenCalled()
    expect(panelCanvas()).toBeTruthy()
  })

  it('closes the graph on the second press, once nothing is open above it', async () => {
    const { close } = await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    pressEscape(panelDrawer(t('graph.settings'))!)

    pressEscape(panelCanvas()!)
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('gives Escape back to the graph when the drawer closed by its own button', async () => {
    const { close } = await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    click(panelDrawer(t('graph.settings'))!.querySelector('button[aria-label="' + t('common.close') + '"]')!)
    expect(panelDrawer(t('graph.settings'))).toBeNull()

    pressEscape(panelCanvas()!)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
