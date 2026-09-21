import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareSession } from '@shared/types'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { ShareSessionsPanel } from './share-sessions-panel'
import { ShareVisitLogsModal } from './share-visit-logs-modal'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      visits: vi.fn(),
      sessions: vi.fn(),
      cleanVisits: vi.fn(async () => ({ deleted: 0 })),
    },
  },
}))

function session(overrides: Partial<ShareSession> = {}): ShareSession {
  return {
    fingerprint: 'a1b2c3d4',
    startedAt: 1_700_000_000_000,
    lastSeenAt: 1_700_000_600_000,
    visits: 3,
    notes: [{ noteId: 'note-1', noteTitle: 'First note', slug: 'abc123', visits: 2 }],
    ...overrides,
  }
}

function panel(overrides: Partial<Parameters<typeof ShareSessionsPanel>[0]['bundle']> = {}) {
  const bundle = {
    sessions: [session()],
    isLoading: false,
    isAppending: false,
    hasError: false,
    hasMore: false,
    loadMore: vi.fn(),
    reload: vi.fn(),
    ...overrides,
  }
  return { bundle, rendered: renderElement(createElement(ShareSessionsPanel, { bundle })) }
}

function buttonByText(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes(label))
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function visitsPage() {
  return {
    visits: [{
      id: 1,
      noteId: 'note-1',
      noteTitle: 'Shared note',
      slug: 'abc123',
      visitedAt: 1_700_000_000_000,
      country: 'US',
      region: null,
      city: null,
      referrer: null,
      referrerHost: null,
      deviceType: 'desktop',
      os: 'macOS',
      browser: 'Chrome',
      isBot: false,
    }],
    total: 1,
    page: 1,
    limit: 25,
    totalPages: 1,
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  await initI18n()
  useUi.setState({ toasts: [] })
  vi.mocked(api.share.visits).mockResolvedValue(visitsPage() as never)
  vi.mocked(api.share.sessions).mockResolvedValue({ sessions: [session()], nextCursor: null, limit: 25 } as never)
})

/**
 * ADR-0003: the session view answers "did this visitor read it through", so what has to hold is
 * that the reading order survives, that a session is presented as a table rather than a pile of
 * divs, and that the two miss states carry their own copy.
 */
describe('session panel (ADR-0003)', () => {
  it('lists a session as a table with its notes in reading order and their counts', () => {
    const { rendered } = panel({
      sessions: [session({
        notes: [
          { noteId: 'note-1', noteTitle: 'First note', slug: 'abc123', visits: 2 },
          { noteId: 'note-2', noteTitle: 'Second note', slug: 'def456', visits: 1 },
        ],
      })],
    })
    const table = rendered.container.querySelector('table')

    expect(table).toBeTruthy()
    expect([...rendered.container.querySelectorAll('th')].map((th) => th.getAttribute('scope'))).toEqual(['col', 'col', 'col', 'col'])
    const notes = [...rendered.container.querySelectorAll('tbody ul li')].map((li) => li.textContent)
    expect(notes[0]).toContain('First note')
    expect(notes[0]).toContain('/s/abc123')
    expect(notes[1]).toContain('Second note')
    expect(notes[0]).toContain('2 ×')
    rendered.unmount()
  })

  it('says a range has no sessions instead of leaving the table blank', () => {
    const { rendered } = panel({ sessions: [] })

    expect(rendered.container.textContent).toContain(t('share.sessions_empty'))
    rendered.unmount()
  })

})

/**
 * The other half of the same contract: what the panel does when the load is slow, empty or failed.
 * Kept as its own block so each `it` stays about one behaviour.
 */
describe('session panel miss states (ADR-0003)', () => {
  it('offers a retry when the load failed and there is nothing to show', () => {
    const { bundle, rendered } = panel({ sessions: [], hasError: true })

    expect(rendered.container.textContent).toContain(t('share.sessions_load_failed'))
    buttonByText(t('common.retry'))!.click()
    expect(bundle.reload).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })

  it('keeps the sessions it already had when a later page fails', () => {
    const { rendered } = panel({ hasError: true })

    // The rows are still there, so the failure is reported beside them rather than replacing them.
    expect(rendered.container.querySelector('tbody ul li')?.textContent).toContain('First note')
    expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(t('share.sessions_load_failed'))
    rendered.unmount()
  })

  it('offers more sessions only while there are more, and loads them on request', () => {
    const { bundle, rendered } = panel({ hasMore: true })

    buttonByText(t('share.sessions_load_more'))!.click()
    expect(bundle.loadMore).toHaveBeenCalledTimes(1)
    rendered.unmount()

    const done = panel({ hasMore: false })
    expect(buttonByText(t('share.sessions_load_more'))).toBeUndefined()
    done.rendered.unmount()
  })

  it('explains the session rule and repeats what a fingerprint is not', () => {
    const { rendered } = panel()
    const text = rendered.container.textContent ?? ''

    expect(text).toContain(t('share.sessions_hint'))
    expect(text).toContain(t('share.visitor_count_note'))
    rendered.unmount()
  })
})

describe('session view entry point (ADR-0003)', () => {
  it('starts on the rows and switches to the sessions the worker folds', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await settle()
    expect(api.share.visits).toHaveBeenCalled()
    expect(api.share.sessions).not.toHaveBeenCalled()

    act(() => {
      buttonByText(t('share.view_sessions'))!.click()
    })
    await settle()

    expect(rendered.container.ownerDocument.body.textContent).toContain('a1b2c3d4')
    expect(api.share.sessions).toHaveBeenCalledWith(expect.objectContaining({
      range: '30d',
      filters: { excludeBots: true, excludeSelf: true, excludeOwner: true },
    }))
    rendered.unmount()
  })

  it('drops the row-only controls while the sessions are on screen', async () => {
    const rendered = renderElement(createElement(ShareVisitLogsModal, { open: true, onClose: () => {} }))
    await settle()
    expect(buttonByText(t('share.export_csv'))).toBeTruthy()

    act(() => {
      buttonByText(t('share.view_sessions'))!.click()
    })
    await settle()

    // Search, the CSV export and the cleanup act on rows, and sessions cannot be searched or
    // exported: offering them here would be offering controls that do nothing.
    expect(buttonByText(t('share.export_csv'))).toBeUndefined()
    expect(document.body.querySelector(`[placeholder="${t('share.search_logs_placeholder')}"]`)).toBeNull()
    const rangeSwitch = [...document.body.querySelectorAll('[role="radiogroup"], [role="group"]')].flatMap((group) => [...group.querySelectorAll('button')])
    expect(rangeSwitch.map((button) => button.textContent)).toContain('24h')
    rendered.unmount()
  })
})
