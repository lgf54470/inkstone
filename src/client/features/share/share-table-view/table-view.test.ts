import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import type { ShareFolder, ShareInfo } from '@shared/types'
import { t } from '../../../lib/i18n'
import { renderElement } from '../../../lib/test-render'
import { useShareHubModal } from '../use-share-hub-modal'
import { useShareList } from '../use-share-list'
import { buildFolderMenuItems } from '../share-item-common'
import { ShareTableRow } from './row'

vi.mock('../share-item-common', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../share-item-common')>()
  return { ...actual, buildFolderMenuItems: vi.fn(actual.buildFolderMenuItems) }
})

interface RowCalls {
  select: unknown[][]
  toggle: unknown[][]
  move: unknown[][]
  revoke: unknown[][]
}

type ShareListSnapshot = { handleCopy: unknown; handleMoveToFolder: unknown; handleRevoke: unknown }
type HubOverlayCallbacks = { openQr: (share: ShareInfo) => void; openAnalytics: (share: ShareInfo) => void; openEdit: (share: ShareInfo) => void }

function makeShare(noteId: string, overrides: Partial<ShareInfo> = {}): ShareInfo {
  return {
    slug: `slug-${noteId}`,
    noteId,
    url: `https://example.test/s/${noteId}`,
    hasPassword: false,
    expiresAt: null,
    views: 3,
    createdAt: 0,
    isEnabled: true,
    lastViewedAt: null,
    noteTitle: `Note ${noteId}`,
    shareFolderId: 'f1',
    tags: [],
    ...overrides,
  }
}

const folders: ShareFolder[] = [
  { id: 'f1', parentId: null, name: 'Archive', createdAt: 0, updatedAt: 0 },
  { id: 'f2', parentId: null, name: 'Ideas', createdAt: 0, updatedAt: 0 },
]

function makeRowProps(calls: RowCalls) {
  return {
    share: makeShare('note-a'),
    isSelected: false,
    folders,
    folderById: new Map(folders.map((f) => [f.id, f])),
    copiedSlug: null,
    onToggleSelect: (...args: unknown[]) => { calls.select.push(args) },
    onTogglePin: () => {},
    onToggleStar: () => {},
    onToggleShare: (...args: unknown[]) => { calls.toggle.push(args) },
    onCopyLink: () => {},
    onOpenQr: () => {},
    onOpenAnalytics: () => {},
    onOpenEdit: () => {},
    onMoveToFolder: (...args: unknown[]) => { calls.move.push(args) },
    onRevoke: () => {},
  }
}

function buttonWithLabel(container: ParentNode, label: string): HTMLButtonElement | null {
  const buttons = Array.from(container.querySelectorAll('button'))
  return buttons.find((b) => b.getAttribute('aria-label') === label || b.getAttribute('title') === label) ?? null
}

function click(el: Element) {
  act(() => { (el as HTMLElement).click() })
}

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('table row handler contract (SH-22)', () => {
  it('selection and switch handlers receive the row note id', () => {
    const calls: RowCalls = { select: [], toggle: [], move: [], revoke: [] }
    const rendered = renderElement(createElement(ShareTableRow, makeRowProps(calls)))
    cleanups.push(rendered.unmount)

    click(rendered.container.querySelector('[role=checkbox]')!)
    click(rendered.container.querySelector('[role=switch]')!)

    expect(calls.select).toEqual([['note-a']])
    expect(calls.toggle).toEqual([['note-a', false]])
  })

  it('row is memoized so untouched rows skip re-render', () => {
    expect((ShareTableRow as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'))
  })
})

describe('folder menu laziness (SH-22)', () => {
  it('folder menu is absent until opened and moves with the row note id', () => {
    const calls: RowCalls = { select: [], toggle: [], move: [], revoke: [] }
    vi.mocked(buildFolderMenuItems).mockClear()
    const rendered = renderElement(createElement(ShareTableRow, makeRowProps(calls)))
    cleanups.push(rendered.unmount)
    expect(document.body.textContent).not.toContain('Ideas')
    expect(buildFolderMenuItems).not.toHaveBeenCalled()

    click(buttonWithLabel(rendered.container, t('share.batch_move_to_folder'))!)

    expect(buildFolderMenuItems).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain(t('share.no_folder'))
    expect(document.body.textContent).toContain('Ideas')
    const ideasItem = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Ideas'))!
    click(ideasItem)
    expect(calls.move).toEqual([['note-a', 'f2']])
  })
})

function renderTwice<T>(probe: ComponentType<{ onResult: (value: T) => void }>): T[] {
  const seen: T[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const el = createElement(probe, {
    onResult: (value: T) => { seen.push(value) },
  })
  act(() => { root.render(el) })
  act(() => { root.render(createElement(el.type, el.props)) })
  act(() => { root.unmount() })
  host.remove()
  return seen
}

describe('list and hub handler stability (SH-22)', () => {
  it('useShareList handlers keep identity across re-renders', () => {
    function ListProbe({ onResult }: { onResult: (list: ShareListSnapshot) => void }) {
      const { handleCopy, handleMoveToFolder, handleRevoke } = useShareList()
      onResult({ handleCopy, handleMoveToFolder, handleRevoke })
      return null
    }
    const seen = renderTwice<ShareListSnapshot>(ListProbe)
    expect(seen).toHaveLength(2)
    expect(seen[1].handleCopy).toBe(seen[0].handleCopy)
    expect(seen[1].handleMoveToFolder).toBe(seen[0].handleMoveToFolder)
    expect(seen[1].handleRevoke).toBe(seen[0].handleRevoke)
  })

  it('hub modal exposes stable openQr/openAnalytics/openEdit callbacks', () => {
    function HubProbe({ onResult }: { onResult: (hub: HubOverlayCallbacks) => void }) {
      const { openQr, openAnalytics, openEdit } = useShareHubModal(false)
      onResult({ openQr, openAnalytics, openEdit })
      return null
    }
    const seen = renderTwice<HubOverlayCallbacks>(HubProbe)
    expect(seen.length).toBeGreaterThanOrEqual(2)
    const [first, last] = [seen[0], seen[seen.length - 1]]
    expect(first.openQr).toBeTypeOf('function')
    expect(last.openQr).toBe(first.openQr)
    expect(last.openAnalytics).toBe(first.openAnalytics)
    expect(last.openEdit).toBe(first.openEdit)
  })
})
