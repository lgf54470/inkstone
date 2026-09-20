import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import type { ShareInfo } from '@shared/types'
import { t } from '../../lib/i18n'
import { api } from '../../lib/api'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareNoteSubmenu } from './share-note-submenu'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      getNoteShare: vi.fn(),
      create: vi.fn(),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
    },
  },
}))

function shareRow(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 1,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    shareFolderId: null,
    tags: [],
    ...overrides,
  }
}

function buttonByText(container: ParentNode, label: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'))
  const found = buttons.find((b) => b.textContent?.trim() === label)
  if (!found) throw new Error(`no submenu button labelled ${label}`)
  return found
}

let writeText: ReturnType<typeof vi.fn>

beforeEach(() => {
  useShareStore.setState({ shares: [], summary: null })
  writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function clickCopy(container: ParentNode, closeMenu: () => void): Promise<void> {
  const { unmount } = renderElement(createElement(ShareNoteSubmenu, {
    noteId: 'note-a',
    noteTitle: 'Note A',
    share: null,
    closeMenu,
    onOpenSettings: () => {},
    onOpenQr: () => {},
    onOpenAnalytics: () => {},
  }))
  await act(async () => {
    buttonByText(container, t('share.copy_link')).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  unmount()
}

describe('submenu ensureShare with a summary-only startup (SH-19)', () => {
  it('fetches the existing share from the server instead of publishing a new one', async () => {
    const existing = shareRow('note-a')
    vi.mocked(api.share.getNoteShare).mockResolvedValue({ share: existing, noteTitle: 'Note A' })

    await clickCopy(document.body, () => {})

    expect(api.share.getNoteShare).toHaveBeenCalledWith('note-a')
    expect(api.share.create).not.toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(existing.url)
  })

  it('still creates a share when the server confirms the note is unshared', async () => {
    const created = shareRow('note-a', { slug: 'fresh' })
    vi.mocked(api.share.getNoteShare).mockResolvedValue({ share: null, noteTitle: 'Note A' })
    vi.mocked(api.share.create).mockResolvedValue({ share: created })

    await clickCopy(document.body, () => {})

    expect(api.share.create).toHaveBeenCalledWith('note-a', { isEnabled: true })
    expect(writeText).toHaveBeenCalledWith(created.url)
  })
})
