import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const H = vi.hoisted(() => ({ globalAnalytics: vi.fn() }))

vi.mock('../../lib/api', () => ({ api: { share: { globalAnalytics: H.globalAnalytics } } }))

import { renderElement } from '../../lib/test-render'
import { initI18n, t } from '../../lib/i18n'
import { ShareDashboardView } from './share-dashboard-view'
import { AUTO_REFRESH_MS, readAutoRefresh, useShareAutoRefresh, writeAutoRefresh } from './share-auto-refresh'

/**
 * SH-65: the dashboard is a snapshot, and a snapshot with no age attached reads as a quiet week.
 * The poll has to be cheap (a hidden tab must not ask) and optional (a cadence is a preference,
 * not a policy) — both are what these assertions are about.
 */
function Probe({ enabled, onRefresh }: { enabled: boolean; onRefresh: () => void }) {
  useShareAutoRefresh({ enabled, refresh: onRefresh })
  return null
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

let refresh: Mock<() => void>

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  setHidden(false)
  refresh = vi.fn<() => void>()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('share auto refresh preference', () => {
  it('defaults to off and survives a round trip', () => {
    expect(readAutoRefresh()).toBe(false)

    writeAutoRefresh(true)
    expect(readAutoRefresh()).toBe(true)

    writeAutoRefresh(false)
    expect(readAutoRefresh()).toBe(false)
  })

  it('reads a stored value it cannot understand as off rather than throwing', () => {
    localStorage.setItem('inkstone_share_auto_refresh', 'yes-please')

    expect(readAutoRefresh()).toBe(false)
  })
})

describe('share auto refresh cadence', () => {
  it('asks on the cadence when it is on, and never when it is off', async () => {
    const off = renderElement(createElement(Probe, { enabled: false, onRefresh: refresh }))
    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS * 3)
    })
    expect(refresh).not.toHaveBeenCalled()
    off.unmount()

    const on = renderElement(createElement(Probe, { enabled: true, onRefresh: refresh }))
    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS)
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    on.unmount()
  })

})

describe('share auto refresh follows the tab being looked at', () => {
  it('stops asking while the page is hidden and asks once on the way back', async () => {
    const rendered = renderElement(createElement(Probe, { enabled: true, onRefresh: refresh }))

    setHidden(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      vi.advanceTimersByTime(AUTO_REFRESH_MS * 2)
    })
    expect(refresh).not.toHaveBeenCalled()

    setHidden(false)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // Back on screen: one immediate read, because that is when the snapshot is stalest.
    expect(refresh).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })

  it('stops asking once it is unmounted', async () => {
    const rendered = renderElement(createElement(Probe, { enabled: true, onRefresh: refresh }))
    rendered.unmount()

    await act(async () => {
      vi.advanceTimersByTime(AUTO_REFRESH_MS * 2)
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})

describe('dashboard freshness line and its switch (SH-65)', () => {
  beforeEach(async () => {
    H.globalAnalytics.mockResolvedValue({ timeline: [] } as never)
  })

  it('states the age of the numbers it drew', async () => {
    await initI18n()
    const rendered = renderElement(createElement(ShareDashboardView))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(document.body.textContent)
      .toContain(t('share.analytics_updated_at', { time: t('time.just_now') }))
    rendered.unmount()
  })

})

describe('dashboard auto refresh switch (SH-65)', () => {
  it('is a named switch that is off until asked for, and remembers it', async () => {
    await initI18n()
    const rendered = renderElement(createElement(ShareDashboardView))
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const control = document.body.querySelector<HTMLButtonElement>('button[role="switch"]')
    expect(control?.getAttribute('aria-label')).toBe(t('share.auto_refresh'))
    expect(control?.getAttribute('aria-checked')).toBe('false')

    await act(async () => {
      control!.click()
    })

    expect(control?.getAttribute('aria-checked')).toBe('true')
    expect(readAutoRefresh()).toBe(true)
    rendered.unmount()
  })

  it('keeps the age line away until something has actually loaded', async () => {
    await initI18n()
    H.globalAnalytics.mockReturnValue(new Promise(() => {}) as never)
    const rendered = renderElement(createElement(ShareDashboardView))
    await act(async () => {
      await Promise.resolve()
    })

    expect(document.body.textContent).not.toContain(t('share.analytics_updated_at', { time: t('time.just_now') }))
    rendered.unmount()
  })
})
