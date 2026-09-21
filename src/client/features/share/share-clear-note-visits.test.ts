import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareInfo } from '@shared/types'

const H = vi.hoisted(() => ({ cleanVisitsForNote: vi.fn(), list: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      cleanVisitsForNote: H.cleanVisitsForNote,
      list: H.list,
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
  ApiError: class ApiError extends Error {},
}))

vi.mock('../../components/overlay', async (importOriginal) => {
  const module = await importOriginal<typeof import('../../components/overlay')>()
  return { ...module, confirm: vi.fn(async () => true), prompt: vi.fn(async () => 'wipe-12345678') }
})

import { renderElement } from '../../lib/test-render'
import { confirm, prompt } from '../../components/overlay'
import { initI18n, t } from '../../lib/i18n'
import { useUi } from '../../store/ui'
import { useShareStore } from './share-store'
import { ShareNoteSubmenu } from './share-note-submenu'

/**
 * SH-63: a live link's visitor history could only be deleted by wiping every log of the account.
 * The scoped delete has to be a deliberate act — a danger confirm plus the account password the
 * endpoint demands — and a link with nothing to delete must not be reported as a success.
 */
function shareRow(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 4,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    shareFolderId: null,
    tags: [],
    ...overrides,
  }
}

function menuButton(label: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
  expect(found, `menu entry ${label}`).toBeDefined()
  return found as HTMLButtonElement
}

async function openMenuAndClearVisits(): Promise<{ unmount: () => void }> {
  const rendered = renderElement(createElement(ShareNoteSubmenu, {
    noteId: 'note-a',
    noteTitle: 'Note A',
    share: shareRow('note-a'),
    closeMenu: () => {},
    onOpenSettings: () => {},
    onOpenQr: () => {},
    onOpenAnalytics: () => {},
  }))
  await act(async () => {
    menuButton(t('share.clear_note_visits')).click()
  })
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
  })
  return rendered
}

function lastToast() {
  const { toasts } = useUi.getState()
  return toasts[toasts.length - 1]
}

beforeEach(async () => {
  vi.clearAllMocks()
  await initI18n()
  vi.mocked(confirm).mockResolvedValue(true)
  vi.mocked(prompt).mockResolvedValue('wipe-12345678')
  useUi.setState({ toasts: [] })
  H.list.mockResolvedValue({ shares: [], total: 0, truncated: false, globalStats: null })
  useShareStore.setState({ shares: [shareRow('note-a')], summary: null, loading: false, error: false })
})

describe('clearing one link’s visit records (SH-63)', () => {
  it('asks for a danger confirmation and the account password before deleting', async () => {
    H.cleanVisitsForNote.mockResolvedValue({ ok: true, deleted: 3 })
    const rendered = await openMenuAndClearVisits()

    expect(vi.mocked(confirm).mock.calls[0][0]).toMatchObject({ tone: 'danger' })
    // The prompt has to name this scope: "every visit log" is the wrong sentence here.
    expect(vi.mocked(prompt).mock.calls[0][0].description).toBe(t('share.verify_password_clear_note'))
    expect(H.cleanVisitsForNote).toHaveBeenCalledWith('note-a', 'wipe-12345678')
    // The rows' visit counts are what was just deleted, so the list is fetched again.
    expect(H.list).toHaveBeenCalled()
    expect(lastToast()?.title).toBe(t('share.clear_note_visits_success', { count: 3 }))
    expect(lastToast()?.tone).toBe('success')
    rendered.unmount()
  })

  it('reports a link with nothing to delete as a warning, not as a success', async () => {
    H.cleanVisitsForNote.mockResolvedValue({ ok: true, deleted: 0 })
    const rendered = await openMenuAndClearVisits()

    expect(lastToast()?.title).toBe(t('share.clear_note_visits_none'))
    expect(lastToast()?.title).not.toBe(t('share.clear_note_visits_success', { count: 0 }))
    expect(lastToast()?.tone).toBe('warning')
    rendered.unmount()
  })

  it('deletes nothing when the confirmation is dismissed', async () => {
    vi.mocked(confirm).mockResolvedValue(false)
    const rendered = await openMenuAndClearVisits()

    expect(prompt).not.toHaveBeenCalled()
    expect(H.cleanVisitsForNote).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('deletes nothing when the password prompt is dismissed', async () => {
    vi.mocked(prompt).mockResolvedValue(null)
    const rendered = await openMenuAndClearVisits()

    expect(H.cleanVisitsForNote).not.toHaveBeenCalled()
    rendered.unmount()
  })
})
