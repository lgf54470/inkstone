import { act, createElement, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { useUi } from '../../store/ui'
import { exportVisitsToCsv } from './share-helpers'
import { ShareVisitLogsModal } from './share-visit-logs-modal'
import { useShareVisitLogs } from './use-share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(),
      cleanVisits: vi.fn(async () => ({ deleted: 0 })),
    },
  },
}))

vi.mock('./share-helpers', async (importOriginal) => {
  const module = await importOriginal<typeof import('./share-helpers')>()
  return { ...module, exportVisitsToCsv: vi.fn() }
})

const TOTAL = 260

function visitRow(id: number) {
  return {
    id,
    noteId: 'note-1',
    noteTitle: 'Shared note',
    slug: 'abc123',
    visitedAt: 1_700_000_000_000 - id * 60_000,
    country: 'US',
    region: null,
    city: null,
    referrer: null,
    referrerHost: null,
    deviceType: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    isBot: false,
  }
}

const ALL_ROWS = Array.from({ length: TOTAL }, (_, id) => visitRow(id))

function servePage(page = 1, limit = 50) {
  const start = (page - 1) * limit
  return {
    visits: ALL_ROWS.slice(start, start + limit),
    total: TOTAL,
    page,
    limit,
    totalPages: Math.ceil(TOTAL / limit),
  }
}

/** Same page shape over a history of any length, for the cap case. */
function serveHistory(total: number) {
  return async (params?: { page?: number; limit?: number }) => {
    const limit = params?.limit ?? 50
    const page = params?.page ?? 1
    const start = (page - 1) * limit
    const end = Math.min(start + limit, total)
    return {
      visits: Array.from({ length: Math.max(0, end - start) }, (_, index) => visitRow(start + index)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }
}

/** Mounts the hook directly so a test can open and close the modal around an in-flight export. */
function ExportProbe() {
  const [open, setOpen] = useState(true)
  const logs = useShareVisitLogs(open)
  return createElement(
    'div',
    null,
    createElement('button', { onClick: () => void logs.handleExport() }, 'start-export'),
    createElement('button', { onClick: () => setOpen(false) }, 'close-logs'),
    createElement('span', { 'data-testid': 'progress' }, logs.exportProgress ? 'progressing' : 'idle'),
  )
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function bodyButton(key: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes(key))
  expect(found, `button with text ${key}`).toBeDefined()
  return found!
}

function visitsCallsWithLimit(limit: number) {
  return vi.mocked(api.share.visits).mock.calls
    .map(([params]) => params)
    .filter((params) => params?.limit === limit)
}

function lastToast() {
  const { toasts } = useUi.getState()
  return toasts[toasts.length - 1]
}

async function mountLogsModal(props: { initialNoteId?: string } = {}) {
  const rendered = renderElement(
    createElement(ShareVisitLogsModal, { open: true, onClose: () => {}, ...props }),
  )
  await settle()
  return rendered
}

async function clickExport() {
  await act(async () => {
    bodyButton('share.export_csv').click()
  })
  await settle()
}

beforeEach(() => {
  vi.clearAllMocks()
  useUi.setState({ toasts: [] })
  vi.mocked(api.share.visits).mockImplementation(async (params) => servePage(params?.page ?? 1, params?.limit ?? 50))
})

describe('visit logs CSV export covers every page of the current query', () => {
  it('collects all 260 rows over 100-row pages instead of the visible 25', async () => {
    const rendered = await mountLogsModal()
    await clickExport()

    const exportCalls = visitsCallsWithLimit(100)
    expect(exportCalls.map((params) => params?.page)).toEqual([1, 2, 3])
    expect(exportVisitsToCsv).toHaveBeenCalledTimes(1)
    expect(vi.mocked(exportVisitsToCsv).mock.calls[0][0]).toHaveLength(TOTAL)
    expect(lastToast()?.title).toBe('share.export_success')
    rendered.unmount()
  })
})

describe('visit logs CSV export carries the query on screen', () => {
  it('keeps the active filter and note scope on the export requests', async () => {
    const rendered = await mountLogsModal({ initialNoteId: 'note-9' })
    await act(async () => {
      bodyButton('share.filter_bot_only').click()
    })
    await settle()
    await clickExport()

    const exportCalls = visitsCallsWithLimit(100)
    expect(exportCalls.length).toBeGreaterThan(0)
    for (const params of exportCalls) {
      expect(params).toMatchObject({ filter: 'bot', noteId: 'note-9' })
    }
    rendered.unmount()
  })

  it('keeps the picked time window on the export requests (audit #10)', async () => {
    const rendered = await mountLogsModal()
    await act(async () => {
      bodyButton('7d').click()
    })
    await settle()
    await clickExport()

    const exportCalls = visitsCallsWithLimit(100)
    expect(exportCalls.length).toBeGreaterThan(0)
    for (const params of exportCalls) {
      expect(params).toMatchObject({ range: '7d' })
    }

    // The all window sends no range value — the shape the endpoint answered before the control.
    vi.mocked(api.share.visits).mockClear()
    await act(async () => {
      bodyButton('share.range_all').click()
    })
    await settle()
    await clickExport()
    for (const params of visitsCallsWithLimit(100)) {
      expect(params?.range).toBeUndefined()
    }
    rendered.unmount()
  })
})

describe('visit logs CSV export failure surfacing', () => {
  it('surfaces a failure toast and re-enables the button when a page fetch fails', async () => {
    let calls = 0
    vi.mocked(api.share.visits).mockImplementation(async (params) => {
      calls += 1
      if (calls === 1) return servePage(1, params?.limit ?? 50)
      throw new Error('network down')
    })
    const rendered = await mountLogsModal()
    await clickExport()

    expect(exportVisitsToCsv).not.toHaveBeenCalled()
    expect(lastToast()?.title).toBe('common.action_failed')
    expect(bodyButton('share.export_csv').disabled).toBe(false)
    rendered.unmount()
  })
})

// Serves every page at once except pages after the first, which wait for the test to release
// them — that window is where progress and cancellation can be observed.
function gatedServe() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  return {
    impl: async (params?: { page?: number; limit?: number }) => {
      const page = params?.page ?? 1
      if (page >= 2) await gate
      return servePage(page, params?.limit ?? 50)
    },
    release: () => release(),
  }
}

describe('visit log export progress and cap (SH-75)', () => {
  it('stops at the cap and says the history is longer instead of growing silently', async () => {
    const HISTORY = 12_000
    vi.mocked(api.share.visits).mockImplementation(serveHistory(HISTORY))

    const rendered = await mountLogsModal()
    await clickExport()

    const exportCalls = visitsCallsWithLimit(100)
    expect(exportCalls.length).toBe(50)
    expect(exportCalls[exportCalls.length - 1]?.page).toBe(50)
    expect(vi.mocked(exportVisitsToCsv).mock.calls[0][0]).toHaveLength(5000)
    expect(lastToast()?.title).toBe('share.export_truncated')
    rendered.unmount()
  })

  it('announces how far the walk has got while it is still running', async () => {
    const gate = gatedServe()
    vi.mocked(api.share.visits).mockImplementation(gate.impl)

    const rendered = await mountLogsModal()
    await act(async () => { bodyButton('share.export_csv').click() })
    await settle()

    // Page one is in, page two is held open: the live region has something to report.
    expect(document.body.textContent).toContain('share.export_progress')
    expect(exportVisitsToCsv).not.toHaveBeenCalled()

    gate.release()
    await settle()
    expect(exportVisitsToCsv).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })
})

describe('visit log export cancellation (SH-75)', () => {
  it('cancels the walk when the modal closes and writes no partial file', async () => {
    const gate = gatedServe()
    vi.mocked(api.share.visits).mockImplementation(gate.impl)

    const rendered = renderElement(createElement(ExportProbe))
    await settle()
    await act(async () => { bodyButton('start-export').click() })
    await settle()
    expect(document.body.textContent).toContain('progressing')

    await act(async () => { bodyButton('close-logs').click() })
    gate.release()
    await settle()

    expect(exportVisitsToCsv).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('idle')
    rendered.unmount()
  })
})
