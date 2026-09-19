import { act, createElement, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { api } from '../../lib/api'
import { useShareStore } from './share-store'
import { ShareHubModal } from './share-hub-modal'
import { ShareHubToolbar } from './share-hub-toolbar'
import { ShareBatchBar } from './share-batch-bar'
import { ShareEditModal } from './share-edit-modal'
import { needsNewSharePasscode } from './share-form'
import type { ShareInfo } from '@shared/types'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
      summary: vi.fn(async () => ({ totalShares: 0, sharedNoteIds: [] })),
      globalAnalytics: vi.fn(async () => { throw new Error('not used by these tests') }),
      visits: vi.fn(async () => ({ visits: [], total: 0 })),
      getNoteShare: vi.fn(async () => ({ share: null })),
      checkSlug: vi.fn(async () => ({ available: true })),
    },
  },
}))

function shareFixture(overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: 'abc123',
    noteId: 'note-1',
    url: 'https://example.test/s/abc123',
    hasPassword: false,
    expiresAt: null,
    views: 3,
    createdAt: 1,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: 'Title',
    ...overrides,
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function labelledButton(scope: ParentNode, label: string): HTMLElement | undefined {
  return [...scope.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

function dialogByText(text: string): HTMLElement | null {
  return [...document.body.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .find((dialog) => dialog.textContent?.includes(text)) ?? null
}

const mounts: Array<{ unmount: () => void }> = []
function mount(node: ReactNode) {
  const rendered = renderElement(node)
  mounts.push(rendered)
  return rendered
}

beforeEach(() => {
  vi.clearAllMocks()
  useShareStore.setState({
    category: 'all',
    folderId: null,
    tag: null,
    statusFilter: 'all',
    search: '',
    sort: 'views_desc',
    viewMode: 'table',
    selectedNoteIds: new Set<string>(),
    shares: [],
    folders: [],
    tags: [],
    globalStats: null,
    summary: null,
    loading: false,
    error: false,
    truncated: false,
  })
})

afterEach(() => {
  while (mounts.length) mounts.pop()!.unmount()
})

describe('share passcode minimum is the single shared standard (SH-36)', () => {
  it('treats a 7-character new passcode as too short, matching the server minimum', () => {
    expect(needsNewSharePasscode(true, false, '1234567')).toBe(true)
  })

  it('accepts a passcode at the 8-character server minimum', () => {
    expect(needsNewSharePasscode(true, false, '12345678')).toBe(false)
  })
})

describe('hub edit modal opens once per mount (SH-36)', () => {
  it('closing the edit modal survives a later list refresh without reopening', async () => {
    // Fresh array per call: a refresh that hands the store the same shares
    // reference would never re-fire the initial-note effect.
    vi.mocked(api.share.list).mockImplementation(async () => ({
      shares: [shareFixture()], total: 0, truncated: false, globalStats: null,
    }) as never)
    mount(createElement(ShareHubModal, { open: true, onClose: () => {}, initialNoteId: 'note-1' }))
    await flush()

    const editDialog = dialogByText('share.edit_share_settings')
    expect(editDialog).not.toBeNull()
    await act(async () => { labelledButton(editDialog!, 'common.close')!.click() })
    await flush()
    expect(dialogByText('share.edit_share_settings')).toBeNull()

    await act(async () => { labelledButton(document.body, 'common.refresh')!.click() })
    await flush()
    expect(dialogByText('share.edit_share_settings')).toBeNull()
  })
})

describe('hub close resets child overlays (SH-36)', () => {
  let setOpenRef: (value: boolean) => void = () => {}
  function HubToggle() {
    const [open, setOpen] = useState(true)
    setOpenRef = setOpen
    return createElement(ShareHubModal, { open, onClose: () => setOpen(false) })
  }

  it('reopening the hub after closing it does not restore the visit logs modal', async () => {
    mount(createElement(HubToggle))
    await flush()

    await act(async () => { labelledButton(document.body, 'share.visit_logs_title')!.click() })
    await flush()
    expect(dialogByText('share.col_time')).not.toBeNull()

    await act(async () => { setOpenRef(false) })
    await flush()
    await act(async () => { setOpenRef(true) })
    await flush()
    expect(dialogByText('share.col_time')).toBeNull()
  })
})

describe('note share load failure is not silent (SH-36)', () => {
  it('warns when fetching the current share for the editor fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(api.share.getNoteShare).mockRejectedValueOnce(new Error('boom'))
    mount(createElement(ShareEditModal, { open: true, onClose: () => {}, noteId: 'note-1', noteTitle: 'Title' }))
    await flush()

    expect(warn.mock.calls.some((call) => String(call[0]).includes('[share]'))).toBe(true)
    warn.mockRestore()
  })
})

describe('hub toolbar view toggle is a radiogroup (SH-36)', () => {
  it('exposes table/grid as radios reflecting and updating the store view mode', async () => {
    mount(createElement(ShareHubToolbar))
    await flush()

    const group = document.body.querySelector('[role="radiogroup"][aria-label="share.view_mode"]')
    expect(group).not.toBeNull()
    const radios = [...group!.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(['share.view_table', 'share.view_grid'])
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')

    await act(async () => { radios[1]!.click() })
    expect(useShareStore.getState().viewMode).toBe('grid')
  })
})

describe('batch selection count is announced (SH-36)', () => {
  it('renders the selected count in a status region', () => {
    mount(createElement(ShareBatchBar, { selectedCount: 3, onClearSelection: () => {} }))
    const status = document.body.querySelector('[role="status"]')
    expect(status?.textContent).toContain('share.selected_count')
  })
})
