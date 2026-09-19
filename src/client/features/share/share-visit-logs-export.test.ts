import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { useUi } from '../../store/ui'
import { exportVisitsToCsv } from './share-helpers'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

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
