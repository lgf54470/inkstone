import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareInfo } from '@shared/types'

const H = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('../../lib/api', () => ({
  api: { share: { list: H.list, summary: vi.fn(async () => null) } },
  ApiError: class ApiError extends Error {},
}))

import { renderElement } from '../../lib/test-render'
import { initI18n, t } from '../../lib/i18n'
import { formatNumber } from '../../lib/time'
import { ShareHubModal } from './share-hub-modal'
import { useShareStore } from './share-store'

/**
 * SH-77 closed virtualization as unjustified — the list is capped server side — and that
 * close is only honest while the cap *is* disclosed. The sentence used to spell the number
 * out ("the first 500 only"), so raising the ceiling would have left the notice stating a
 * bound the list no longer had. The count now comes from the rows on screen.
 */
function shareRow(index: number): ShareInfo {
  return {
    slug: `slug-${index}`,
    noteId: `note-${index}`,
    url: `https://example.test/s/slug-${index}`,
    hasPassword: false,
    expiresAt: null,
    views: index,
    createdAt: index,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Title ${index}`,
  }
}

async function mountHubWithRows(rows: ShareInfo[], truncated: boolean) {
  H.list.mockResolvedValue({ shares: rows, total: rows.length, truncated, globalStats: null })
  const rendered = renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
  await act(async () => {
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve()
  })
  return rendered
}

beforeEach(async () => {
  vi.clearAllMocks()
  // The real messages, so the count is read out of the sentence rather than from a key echo.
  await initI18n()
  useShareStore.setState({
    category: 'all',
    folderId: null,
    tag: null,
    shares: [],
    truncated: false,
    loading: false,
    error: false,
    selectedNoteIds: new Set<string>(),
  })
})

describe('share list truncation notice (SH-77)', () => {
  it('states the number of rows it is actually showing rather than a literal ceiling', async () => {
    const rows = [shareRow(1), shareRow(2), shareRow(3)]
    const rendered = await mountHubWithRows(rows, true)

    expect(document.body.textContent).toContain(t('share.list_truncated', { count: formatNumber(3) }))
    rendered.unmount()
  })

  it('states the ceiling in a template, so the sentence cannot claim a bound of its own', () => {
    // The old copy read "showing the first 500 only" with the number typed into the sentence.
    // A placeholder is what makes the count follow the list; without one, two counts would
    // both read out the same sentence, and raising the server cap would leave the notice lying.
    expect(t('share.list_truncated', { count: formatNumber(3) }))
      .not.toBe(t('share.list_truncated', { count: formatNumber(500) }))
  })

  it('says nothing when the whole list fits', async () => {
    const rendered = await mountHubWithRows([shareRow(1)], false)

    expect(document.body.textContent).not.toContain(t('share.list_truncated', { count: formatNumber(1) }))
    rendered.unmount()
  })
})
