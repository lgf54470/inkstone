import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReactNode } from 'react'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import type { ShareInfo } from '@shared/types'
import { api } from '../../../lib/api'
import { useShareStore } from './index'
import { isNoteShared, selectShareRow, shareRowIndex, useShareRowForNote } from './row-index'

const patchNote = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('../../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(),
      create: vi.fn(),
      batch: vi.fn(),
      batchToggleGroup: vi.fn(),
      folders: { list: vi.fn() },
      tags: { list: vi.fn() },
    },
  },
}))

vi.mock('../../../store/notes', () => ({
  useNotes: { getState: () => ({ patchNote }) },
}))

function shareRow(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 0,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    ...overrides,
  }
}

beforeAll(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  vi.mocked(api.share.list).mockResolvedValue({ shares: [], globalStats: null } as never)
})

describe('share row index (SH-23)', () => {
  it('selectShareRow returns the exact row object or null', () => {
    const a = shareRow('note-a')
    const b = shareRow('note-b')
    expect(selectShareRow([a, b], 'note-b')).toBe(b)
    expect(selectShareRow([a, b], 'note-unknown')).toBeNull()
    expect(selectShareRow([], 'note-a')).toBeNull()
  })

  it('reuses the cached index for the same shares array', () => {
    const shares = [shareRow('note-a'), shareRow('note-b')]
    expect(shareRowIndex(shares)).toBe(shareRowIndex(shares))
    expect(shareRowIndex([...shares])).not.toBe(shareRowIndex(shares))
    expect(shareRowIndex(shares).get('note-a')).toBe(shares[0])
  })
})

function RowProbe({ noteId, onRender }: { noteId: string; onRender: () => void }) {
  useShareRowForNote(noteId)
  onRender()
  return null
}

let root: Root | null = null
let renders: Record<string, number>

function renderProbes(ids: string[]) {
  root = createRoot(document.createElement('div'))
  act(() => {
    root?.render(ids.map((id) => createElement(RowProbe, {
      key: id,
      noteId: id,
      onRender: () => { renders[id] = (renders[id] ?? 0) + 1 },
    })) as unknown as ReactNode)
  })
}

beforeEach(() => {
  renders = {}
  useShareStore.setState({ shares: [], loading: false, error: false })
  vi.clearAllMocks()
})

afterEach(() => {
  act(() => { root?.unmount() })
  root = null
  useShareStore.setState({ shares: [] })
})

describe('per-row write isolation (SH-23)', () => {
  it('a write to one row does not re-render probes for other rows', () => {
    const a = shareRow('note-a')
    const b = shareRow('note-b')
    useShareStore.setState({ shares: [a, b] })
    renderProbes(['note-a', 'note-b'])
    expect(renders['note-a']).toBe(1)
    expect(renders['note-b']).toBe(1)

    const aUpdated = shareRow('note-a', { views: 9 })
    act(() => { useShareStore.getState().applyServerShare(aUpdated) })

    expect(renders['note-b']).toBe(1)
    expect(renders['note-a']).toBe(2)
    expect(api.share.list).not.toHaveBeenCalled()
  })
})

describe('per-row appearance (SH-23)', () => {
  it('a probe for a note without a share row re-renders when its row appears', () => {
    useShareStore.setState({ shares: [] })
    renderProbes(['note-c'])
    expect(renders['note-c']).toBe(1)

    const c = shareRow('note-c')
    act(() => { useShareStore.setState({ shares: [c] }) })

    expect(renders['note-c']).toBe(2)
    expect(selectShareRow(useShareStore.getState().shares, 'note-c')).toBe(c)
  })
})

describe('isNoteShared across the summary-only startup window (SH-19)', () => {
  it('answers from the summary id set before the full list ever loads', () => {
    const summary = { totalShares: 1, sharedNoteIds: new Set(['note-a']) }
    expect(isNoteShared({ shares: [], summary }, 'note-a')).toBe(true)
    expect(isNoteShared({ shares: [], summary }, 'note-b')).toBe(false)
  })

  it('follows list membership once the summary has been dropped by a list load', () => {
    expect(isNoteShared({ shares: [shareRow('note-a')], summary: null }, 'note-a')).toBe(true)
    expect(isNoteShared({ shares: [], summary: null }, 'note-a')).toBe(false)
  })

  it('keeps a visible row shared even if the stale summary missed it', () => {
    const summary = { totalShares: 0, sharedNoteIds: new Set<string>() }
    expect(isNoteShared({ shares: [shareRow('note-a')], summary }, 'note-a')).toBe(true)
  })
})
