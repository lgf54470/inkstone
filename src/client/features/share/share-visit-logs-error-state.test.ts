import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(async () => ({ visits: [], total: 0, page: 1, pageSize: 25, totalPages: 0 })),
      cleanVisits: vi.fn(async () => ({ deleted: 0 })),
    },
  },
}))

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function visitsFixture() {
  return {
    visits: [
      {
        id: 1,
        visitedAt: 0,
        noteTitle: 'Shared note',
        slug: 'abc123',
        country: 'US',
        city: null,
        referrer: null,
        referrerHost: null,
        deviceType: 'desktop',
        os: 'macOS',
        browser: 'Chrome',
        isBot: false,
        botName: null,
        isOwner: false,
        isSelfReferrer: false,
        channel: null,
        visitorFp: 'ab12cd34',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 25,
    totalPages: 1,
  }
}

function emptyFixture() {
  return { visits: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }
}

function alertInBody(): Element | null {
  return document.body.querySelector('[role="alert"]')
}

async function clickRetry(): Promise<void> {
  const retry = [...document.body.querySelectorAll('button')]
    .find((button) => button.textContent?.includes('common.retry'))
  expect(retry).toBeDefined()
  await act(async () => {
    retry!.click()
  })
  await flush()
}

function refreshButton(): HTMLButtonElement {
  const button = document.body.querySelector<HTMLButtonElement>('button[aria-label="common.refresh"]')
  expect(button).not.toBeNull()
  return button!
}

function mount(): ReturnType<typeof renderElement> {
  return renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
}

beforeEach(() => {
  vi.mocked(api.share.visits).mockClear()
  vi.mocked(api.share.visits).mockResolvedValue(emptyFixture() as never)
})

describe('share visit logs failure surfacing', () => {
  it('shows an alert with retry instead of an empty list when the logs request fails', async () => {
    vi.mocked(api.share.visits).mockRejectedValueOnce(new Error('boom'))
    const rendered = mount()
    await flush()

    expect(alertInBody()?.textContent).toContain('share.logs_load_failed')
    // The defect this guards: an unanswered read used to render as "no logs found", which is a
    // claim about the account's traffic rather than about the request.
    expect(document.body.textContent).not.toContain('share.no_logs_found')

    vi.mocked(api.share.visits).mockResolvedValueOnce(visitsFixture() as never)
    await clickRetry()

    expect(alertInBody()).toBeNull()
    expect(document.body.textContent).toContain('Shared note')
    rendered.unmount()
  })

  it('clears the rows it already showed when a later page fails', async () => {
    vi.mocked(api.share.visits).mockResolvedValueOnce(visitsFixture() as never)
    const rendered = mount()
    await flush()
    expect(document.body.textContent).toContain('Shared note')

    vi.mocked(api.share.visits).mockRejectedValueOnce(new Error('boom'))
    await act(async () => {
      refreshButton().click()
    })
    await flush()

    expect(alertInBody()?.textContent).toContain('share.logs_load_failed')
    expect(document.body.textContent).not.toContain('Shared note')
    expect(document.body.querySelector('[aria-busy="true"]')).toBeNull()
    rendered.unmount()
  })
})

describe('share visit logs loading and empty states', () => {
  it('stands in placeholders for the first page rather than calling it empty', async () => {
    vi.mocked(api.share.visits).mockReturnValueOnce(new Promise(() => {}))
    const rendered = mount()
    await flush()

    expect(document.body.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    expect(document.body.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(document.body.textContent).not.toContain('share.no_logs_found')
    rendered.unmount()
  })

  it('still says empty when the request really did find nothing', async () => {
    const rendered = mount()
    await flush()

    expect(alertInBody()).toBeNull()
    expect(document.body.textContent).toContain('share.no_logs_found')
    rendered.unmount()
  })
})
