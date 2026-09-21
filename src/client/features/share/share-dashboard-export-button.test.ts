import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareGlobalAnalytics } from '@shared/types'

const H = vi.hoisted(() => ({ globalAnalytics: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { share: { globalAnalytics: H.globalAnalytics } },
  ApiError: class ApiError extends Error {},
}))

import { renderElement } from '../../lib/test-render'
import { initI18n, t } from '../../lib/i18n'
import { ShareDashboardView } from './share-dashboard-view'

/**
 * SH-64's UI half: the button that hands the window over. The builder is tested on its own; what
 * is only true of the wiring is that the control carries an accessible name, that it stays inert
 * while there is nothing on screen to describe, and that clicking it actually produces one file.
 */
function analytics(): ShareGlobalAnalytics {
  return {
    range: 'all',
    totalShares: 1,
    activeShares: 1,
    totalViews: 3,
    totalVisitors: 2,
    viewsPerDay: 1,
    sparklineViews: [],
    sparklineVisitors: [],
    timeline: [],
    topNotes: [],
    topCountries: [],
    topReferrers: [],
    devices: [],
    osList: [],
    browsers: [],
    recentVisits: [],
    // Hygiene is off in this fixture: this file is about the export control, not the card.
    staleLinks: { thresholdDays: 0, total: 0, neverViewed: 0, items: [] },
    channels: [],
  }
}

async function mountView() {
  const rendered = renderElement(createElement(ShareDashboardView, {}))
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
  })
  return rendered
}

function exportButton(): HTMLButtonElement {
  const button = document.querySelector(`button[aria-label="${t('share.export_csv')}"]`)
  expect(button).not.toBeNull()
  return button as HTMLButtonElement
}

const downloaded: Blob[] = []
const originalCreateObjectURL = URL.createObjectURL

beforeEach(async () => {
  H.globalAnalytics.mockReset()
  downloaded.length = 0
  await initI18n()
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      downloaded.push(blob)
      return 'blob:csv'
    },
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: () => {} })
  const appendChild = document.body.appendChild.bind(document.body)
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    if (node instanceof HTMLAnchorElement) node.click = () => {}
    return appendChild(node)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateObjectURL })
})

describe('dashboard export control (SH-64)', () => {
  it('offers the export under an accessible name, and hands over one file per click', async () => {
    H.globalAnalytics.mockResolvedValue(analytics())
    const rendered = await mountView()

    const button = exportButton()
    expect(button.disabled).toBe(false)

    await act(async () => {
      button.click()
    })

    expect(downloaded).toHaveLength(1)
    expect(await downloaded[0].text()).toContain(t('share.range_label'))
    rendered.unmount()
  })

  it('stays inert while the dashboard has nothing on screen to describe', async () => {
    // A request that never answers is the honest way to hold the view in its first-load state:
    // there is no window yet, so there is no file to offer.
    H.globalAnalytics.mockReturnValue(new Promise(() => {}))
    const rendered = await mountView()

    expect(exportButton().disabled).toBe(true)
    rendered.unmount()
  })
})
