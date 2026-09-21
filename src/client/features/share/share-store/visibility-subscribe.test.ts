import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShareInfo } from '@shared/types'

const H = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('../../../store/visibility-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../store/visibility-sources')>()
  return { ...actual, pushVisibilitySnapshot: H.push }
})

import { useShareStore } from './index'

function shareRow(noteId: string): ShareInfo {
  return {
    slug: `s-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 0,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
  }
}

/**
 * SH-76: the projection the notes store reads is derived from `shares` and `summary` alone,
 * but the subscriber used to rebuild its id set on every store write — including every
 * keystroke and every row selection — and then compare it to the previous one to discover
 * nothing had changed. The test distinguishes the two behaviours at the boundary it can
 * observe: whether the push happens at all for a write that cannot have changed the answer.
 */
describe('share visibility projection subscription (SH-76)', () => {
  beforeEach(() => {
    H.push.mockClear()
  })

  it('pushes when the shares reference changes and stays quiet when it does not', () => {
    const shares = [shareRow('n1')]
    useShareStore.setState({ shares, summary: null })
    expect(H.push).toHaveBeenCalledTimes(1)
    H.push.mockClear()

    // Unrelated slices: same `shares` array, same `summary` — none of these can change the projection.
    useShareStore.getState().setViewMode('grid')
    useShareStore.getState().toggleSelect('n1')
    useShareStore.getState().clearSelection()
    expect(H.push).not.toHaveBeenCalled()

    // A new array holding the same notes is still a new input, so the projection is rebuilt.
    useShareStore.setState({ shares: [...shares] })
    expect(H.push).toHaveBeenCalledTimes(1)
  })

  it('pushes when only the summary changes', () => {
    useShareStore.setState({ shares: [], summary: null })
    H.push.mockClear()

    useShareStore.setState({ summary: { totalShares: 1, sharedNoteIds: new Set(['n9']) } })
    expect(H.push).toHaveBeenCalledTimes(1)
  })
})
