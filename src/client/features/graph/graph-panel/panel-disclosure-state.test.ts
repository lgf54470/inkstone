import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { click, mountGraphPanel, panelButton, panelDrawer, releaseGraphPanels } from './graph-panel-mount.test-helpers'

/**
 * The header control that discloses the graph settings is a reader's only handle on whether the drawer is
 * already open, and a button that opens a panel owes that to the accessibility tree as an expanded state.
 * These cases read it off the control itself, before and after the press, because a state that lives only
 * in React leaves the reader holding a button that says nothing.
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

describe('the graph settings disclosure', () => {
  it('says on the control whether the drawer it opens is open', async () => {
    await mountGraphPanel()
    const disclosure = panelButton(t('graph.settings'))
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')

    click(disclosure)
    expect(panelDrawer(t('graph.settings'))).toBeTruthy()
    expect(panelButton(t('graph.settings')).getAttribute('aria-expanded')).toBe('true')
  })

  it('takes the state back when the reader closes the drawer with the same control', async () => {
    await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    click(panelButton(t('graph.settings')))

    expect(panelDrawer(t('graph.settings'))).toBeNull()
    expect(panelButton(t('graph.settings')).getAttribute('aria-expanded')).toBe('false')
  })
})
