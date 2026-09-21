import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import type { ShareInfo } from '@shared/types'
import { ShareGridView } from './share-grid-view'
import { useShareStore } from './share-store'

/**
 * The rendering a person pays for when they tick one card. `PinStarButtons` stands in as the
 * counter because every card draws it exactly once per render: counting calls per note title is
 * counting that card's renders. Memoisation, note-scoped handlers and the folder map all show up
 * here at once — drop any of them and the untouched cards start redrawing.
 */
const renders = new Map<string, number>()

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
      summary: vi.fn(async () => ({ totalShares: 0, sharedNoteIds: [] })),
    },
  },
}))

vi.mock('./share-item-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./share-item-common')>()
  return {
    ...actual,
    PinStarButtons: ({ share }: { share: ShareInfo }) => {
      renders.set(share.noteId, (renders.get(share.noteId) ?? 0) + 1)
      return createElement('span', { 'data-render-probe': share.noteId })
    },
  }
})

function shareFixture(noteId: string): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 1,
    createdAt: 1,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: noteId,
  }
}

describe('share grid rendering cost (SH-59)', () => {
  beforeEach(() => {
    renders.clear()
    useShareStore.setState({ selectedNoteIds: new Set(), folders: [], shares: [] })
  })

  it('redraws only the card whose selection changed', async () => {
    const shares = ['note-a', 'note-b', 'note-c'].map(shareFixture)
    const rendered = renderElement(createElement(ShareGridView, {
      shares,
      onOpenQr: () => {},
      onOpenAnalytics: () => {},
      onOpenEdit: () => {},
    }))
    expect([...renders.entries()].sort()).toEqual([['note-a', 1], ['note-b', 1], ['note-c', 1]])

    await act(async () => {
      useShareStore.setState({ selectedNoteIds: new Set(['note-b']) })
    })

    expect(renders.get('note-a')).toBe(1)
    expect(renders.get('note-c')).toBe(1)
    expect(renders.get('note-b')).toBe(2)
    rendered.unmount()
  })
})
