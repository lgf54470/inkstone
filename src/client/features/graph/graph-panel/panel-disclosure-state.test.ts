import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { initI18n, t } from '../../../lib/i18n'
import { click, mountGraphPanel, panelButton, panelDrawer, panelSwitch, pressEscape, releaseGraphPanels } from './graph-panel-mount.test-helpers'

/**
 * The header control that discloses the graph settings is a reader's only handle on whether the drawer is
 * already open, and a button that opens a panel owes that to the accessibility tree as an expanded state.
 * These cases read it off the control itself, before and after the press, because a state that lives only
 * in React leaves the reader holding a button that says nothing.
 */
vi.mock('../../../lib/api', () => ({
  api: { graph: vi.fn() },
}))

/** The shape jsdom hands the panel: no media query matches, so it lays out as it would on a phone. */
function stubNarrowViewport(): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
}

/** The wide layout, where the same drawer is a column beside the canvas rather than over it. */
function stubWideViewport(): void {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('min-width'), media: query, addEventListener: () => {}, removeEventListener: () => {},
  })))
}

beforeAll(async () => {
  await initI18n()
  stubNarrowViewport()
})

afterEach(() => {
  releaseGraphPanels()
  vi.clearAllMocks()
  // A case that widens the viewport for itself must not hand that width to the next one.
  stubNarrowViewport()
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

describe('the drawer the disclosure owns (G-25)', () => {
  it('points the control at the drawer it opens', async () => {
    await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    const drawer = panelDrawer(t('graph.settings'))!

    expect(drawer.id).toBeTruthy()
    expect(panelButton(t('graph.settings')).getAttribute('aria-controls')).toBe(drawer.id)
  })

  it('is the dialog it is on the phone layout, where it covers the canvas', async () => {
    await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    const drawer = panelDrawer(t('graph.settings'))!

    expect(drawer.getAttribute('role')).toBe('dialog')
    expect(drawer.getAttribute('aria-modal')).toBe('true')
    expect(panelButton(t('graph.settings')).getAttribute('aria-haspopup')).toBe('dialog')
  })

  it('is a named region, not a dialog, on the wide layout where it is a column of the panel', async () => {
    stubWideViewport()
    await mountGraphPanel()
    // A control that opens a column must not claim a popup dialog it does not open.
    expect(panelButton(t('graph.settings')).getAttribute('aria-haspopup')).toBeNull()

    click(panelButton(t('graph.settings')))
    const drawer = panelDrawer(t('graph.settings'))!
    expect(drawer.getAttribute('role')).toBe('region')
    expect(drawer.getAttribute('aria-modal')).toBeNull()
  })

  it('describes a toggle by the hint drawn beside its label', async () => {
    await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    const control = panelSwitch(t('graph.clear_closes_panel'))
    const describedBy = control.getAttribute('aria-describedby')

    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)?.getAttribute('aria-label')).toBe(t('graph.clear_closes_panel_hint'))
  })
})

describe('the focus the drawer takes and gives back (G-25)', () => {
  it('takes focus when it opens and hands it back to the control that opened it', async () => {
    await mountGraphPanel()
    const disclosure = panelButton(t('graph.settings'))
    click(disclosure)
    expect(document.activeElement).toBe(panelDrawer(t('graph.settings')))

    click(panelButton(t('graph.settings')))
    expect(document.activeElement).toBe(disclosure)
  })

  it('hands focus back when the drawer closes from inside it', async () => {
    await mountGraphPanel()
    click(panelButton(t('graph.settings')))
    pressEscape(panelDrawer(t('graph.settings'))!)

    expect(panelDrawer(t('graph.settings'))).toBeNull()
    expect(document.activeElement).toBe(panelButton(t('graph.settings')))
  })
})
