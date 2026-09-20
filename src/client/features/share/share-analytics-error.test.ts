import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { useShareDashboardView } from './use-share-dashboard-view'
import { useShareNoteAnalytics } from './use-share-note-analytics'
import { ShareDashboardView } from './share-dashboard-view'
import { ShareNoteAnalyticsModal } from './share-note-analytics-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      globalAnalytics: vi.fn(),
      noteAnalytics: vi.fn(),
    },
  },
}))

type DashboardBundle = ReturnType<typeof useShareDashboardView>
type NoteBundle = ReturnType<typeof useShareNoteAnalytics>

let dashboardBundle: DashboardBundle | null = null
let noteBundle: NoteBundle | null = null

function DashboardProbe() {
  dashboardBundle = useShareDashboardView()
  return null
}

function NoteProbe() {
  noteBundle = useShareNoteAnalytics(true, 'note-1')
  return null
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function globalAnalyticsFixture() {
  return { timeline: [] } as never
}

beforeEach(() => {
  dashboardBundle = null
  noteBundle = null
  vi.clearAllMocks()
})

describe('share analytics failure surfacing (dashboard hook)', () => {
  it('dashboard hook reports the failure instead of leaving silent zeros', async () => {
    vi.mocked(api.share.globalAnalytics).mockRejectedValueOnce(new Error('boom'))
    const rendered = renderElement(createElement(DashboardProbe))
    await flush()

    expect(dashboardBundle!.error).toBe(true)
    expect(dashboardBundle!.analytics).toBeNull()
    expect(dashboardBundle!.isLoading).toBe(false)
    rendered.unmount()
  })

  it('dashboard hook clears stale data on a later failure and recovers after retry', async () => {
    vi.mocked(api.share.globalAnalytics).mockResolvedValueOnce(globalAnalyticsFixture())
    const rendered = renderElement(createElement(DashboardProbe))
    await flush()
    expect(dashboardBundle!.analytics).not.toBeNull()

    vi.mocked(api.share.globalAnalytics).mockRejectedValueOnce(new Error('boom'))
    await act(async () => {
      dashboardBundle!.setRange('24h')
    })
    await flush()
    expect(dashboardBundle!.analytics).toBeNull()
    expect(dashboardBundle!.error).toBe(true)

    vi.mocked(api.share.globalAnalytics).mockResolvedValueOnce(globalAnalyticsFixture())
    await act(async () => {
      await dashboardBundle!.loadData('24h')
    })
    expect(dashboardBundle!.error).toBe(false)
    expect(dashboardBundle!.analytics).not.toBeNull()
    rendered.unmount()
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function resolveWith<T>(pending: { promise: Promise<T>; resolve: (value: T) => void }, value: unknown) {
  await act(async () => {
    pending.resolve(value as T)
    await Promise.resolve()
  })
}

describe('share analytics request ordering (SH-71)', () => {
  async function mountAndSwitchRange() {
    const rendered = renderElement(createElement(DashboardProbe))
    await flush()
    await act(async () => {
      dashboardBundle!.setRange('24h')
    })
    await flush()
    return rendered
  }

  it('lets the newest dashboard request own the data and the spinner', async () => {
    const older = deferred<never>()
    const newer = deferred<never>()
    vi.mocked(api.share.globalAnalytics).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const rendered = await mountAndSwitchRange()

    const [firstCall, secondCall] = vi.mocked(api.share.globalAnalytics).mock.calls
    expect(firstCall[0]).toBe('7d')
    expect(secondCall[0]).toBe('24h')
    expect(firstCall[2]?.aborted).toBe(true)
    expect(secondCall[2]?.aborted).toBe(false)

    await resolveWith(older, { marker: 'older' })
    expect(dashboardBundle!.analytics).toBeNull()
    expect(dashboardBundle!.isLoading).toBe(true)

    await resolveWith(newer, { marker: 'newer' })
    expect(dashboardBundle!.analytics).toEqual({ marker: 'newer' })
    expect(dashboardBundle!.isLoading).toBe(false)
    rendered.unmount()
  })

  it('ignores a failure from the request it already replaced', async () => {
    const older = deferred<never>()
    const newer = deferred<never>()
    vi.mocked(api.share.globalAnalytics).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const rendered = await mountAndSwitchRange()

    await resolveWith(newer, { marker: 'newer' })
    await act(async () => {
      older.reject(new Error('late failure'))
      await Promise.resolve()
    })

    expect(dashboardBundle!.analytics).toEqual({ marker: 'newer' })
    expect(dashboardBundle!.error).toBe(false)
    rendered.unmount()
  })
})

describe('share analytics request ordering (SH-71, note modal)', () => {
  it('keeps the note modal data of the newest request', async () => {
    const older = deferred<never>()
    const newer = deferred<never>()
    vi.mocked(api.share.noteAnalytics).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const rendered = renderElement(createElement(NoteProbe))
    await flush()

    await act(async () => {
      noteBundle!.setRange('30d')
    })
    await flush()

    const [firstCall, secondCall] = vi.mocked(api.share.noteAnalytics).mock.calls
    expect(firstCall[1]).toBe('7d')
    expect(secondCall[1]).toBe('30d')
    expect(firstCall[3]?.aborted).toBe(true)

    await resolveWith(older, { marker: 'older' })
    expect(noteBundle!.data).toBeNull()

    await resolveWith(newer, { marker: 'newer' })
    expect(noteBundle!.data).toEqual({ marker: 'newer' })
    expect(noteBundle!.isLoading).toBe(false)
    rendered.unmount()
  })
})

describe('share analytics failure surfacing (note hook)', () => {
  it('note analytics hook exposes loading and failure state', async () => {
    vi.mocked(api.share.noteAnalytics).mockReturnValueOnce(new Promise(() => {}))
    const rendered = renderElement(createElement(NoteProbe))
    await flush()
    expect(noteBundle!.isLoading).toBe(true)
    rendered.unmount()

    vi.mocked(api.share.noteAnalytics).mockRejectedValueOnce(new Error('boom'))
    const second = renderElement(createElement(NoteProbe))
    await flush()
    expect(noteBundle!.error).toBe(true)
    expect(noteBundle!.data).toBeNull()
    expect(noteBundle!.isLoading).toBe(false)
    second.unmount()
  })
})

async function clickRetry(root: ParentNode) {
  const retry = [...root.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('common.retry'))
  expect(retry).toBeDefined()
  await act(async () => {
    retry!.click()
  })
  await flush()
}

describe('share analytics failure surfacing (dashboard view)', () => {
  it('shows an alert with retry instead of zeroed cards when loading fails', async () => {
    vi.mocked(api.share.globalAnalytics).mockRejectedValueOnce(new Error('boom'))
    const rendered = renderElement(createElement(ShareDashboardView))
    await flush()

    const alert = rendered.container.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('share.analytics_load_failed')
    expect(rendered.container.textContent).not.toContain('share.total_views_pv')

    vi.mocked(api.share.globalAnalytics).mockResolvedValueOnce(globalAnalyticsFixture())
    await clickRetry(rendered.container)

    expect(rendered.container.querySelector('[role="alert"]')).toBeNull()
    expect(rendered.container.textContent).toContain('share.total_views_pv')
    rendered.unmount()
  })
})

describe('share analytics failure surfacing (note modal)', () => {
  it('shows an alert with retry instead of zeroed stats when loading fails', async () => {
    vi.mocked(api.share.noteAnalytics).mockRejectedValueOnce(new Error('boom'))
    const rendered = renderElement(
      createElement(ShareNoteAnalyticsModal, { open: true, onClose: () => {}, noteId: 'note-1' }),
    )
    await flush()

    const alert = document.body.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('share.analytics_load_failed')
    expect(document.body.textContent).not.toContain('share.total_views_pv')

    vi.mocked(api.share.noteAnalytics).mockResolvedValueOnce({ timeline: [], topCountries: [], topReferrers: [], recentVisits: [] } as never)
    await clickRetry(document.body)

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
    expect(document.body.textContent).toContain('share.total_views_pv')
    rendered.unmount()
  })
})
