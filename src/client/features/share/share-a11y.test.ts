import { act, createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderElement } from '../../lib/test-render'
import { useShareStore } from './share-store'
import { ShareTableRow } from './share-table-view/row'
import { ShareGridCard } from './share-grid-view/card'
import { ShareBatchBar } from './share-batch-bar'
import { ShareTrafficFilterPopover } from './share-traffic-filter-popover'
import { ShareSettingsModal } from './share-settings-modal'
import { SharePasswordCard, ShareSlugCard, ShareStatusCard, ShareTagsCard } from './share-edit-modal/sections'
import { ShareHubModal } from './share-hub-modal'
import type { ShareInfo } from '@shared/types'

vi.mock('../../lib/api', () => ({
  api: {
    share: {
      list: vi.fn(async () => ({ shares: [], total: 0, truncated: false, globalStats: null })),
      folders: { list: vi.fn(async () => []) },
      tags: { list: vi.fn(async () => []) },
      summary: vi.fn(async () => ({ totalShares: 0, sharedNoteIds: [] })),
      globalAnalytics: vi.fn(async () => { throw new Error('not used by these tests') }),
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

function rowProps() {
  return {
    share: shareFixture(),
    isSelected: false,
    folders: [],
    folderById: new Map(),
    copiedSlug: null,
    onToggleSelect: vi.fn(),
    onTogglePin: vi.fn(),
    onToggleStar: vi.fn(),
    onToggleShare: vi.fn(),
    onCopyLink: vi.fn(),
    onOpenQr: vi.fn(),
    onOpenAnalytics: vi.fn(),
    onOpenEdit: vi.fn(),
    onMoveToFolder: vi.fn(),
    onRevoke: vi.fn(),
  }
}

async function click(element: Element | null | undefined) {
  expect(element).toBeDefined()
  await act(async () => {
    (element as HTMLElement).click()
  })
}

function buttonsIn(scope: ParentNode): HTMLButtonElement[] {
  return [...scope.querySelectorAll('button')]
}

function labelledButton(container: ParentNode, label: string): HTMLElement | undefined {
  return [...container.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label)
}

function switchesIn(scope: ParentNode): HTMLButtonElement[] {
  return [...scope.querySelectorAll<HTMLButtonElement>('button[role="switch"]')]
}

function gridCardProps() {
  const props = rowProps()
  return {
    share: props.share,
    isSelected: false,
    folders: [],
    folderById: new Map(),
    copiedSlug: null,
    onToggleSelect: props.onToggleSelect,
    onTogglePin: props.onTogglePin,
    onToggleStar: props.onToggleStar,
    onToggleShare: props.onToggleShare,
    onCopy: props.onCopyLink,
    onOpenQr: props.onOpenQr,
    onOpenAnalytics: props.onOpenAnalytics,
    onOpenEdit: props.onOpenEdit,
    onMoveToFolder: props.onMoveToFolder,
    onRevoke: props.onRevoke,
  }
}

function editBundleFixture() {
  return {
    isEnabled: true,
    setIsEnabled: vi.fn(),
    shouldUseCustomSlug: false,
    setShouldUseCustomSlug: vi.fn(),
    customSlug: '',
    setCustomSlug: vi.fn(),
    isSlugChecking: false,
    slugAvailable: null,
    slugError: null,
    shouldUsePassword: false,
    setShouldUsePassword: vi.fn(),
    password: '',
    setPassword: vi.fn(),
    share: null,
    shareTags: ['alpha'],
    newTagInput: '',
    setNewTagInput: vi.fn(),
    handleAddTag: vi.fn(),
    handleRemoveTag: vi.fn(),
  }
}

beforeEach(() => {
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
  vi.clearAllMocks()
})

describe('share list row keyboard-accessible actions (SH-31)', () => {
  function renderRow() {
    const props = rowProps()
    const rendered = renderElement(createElement(ShareTableRow, props as never))
    return { ...props, rendered, container: rendered.container.querySelector('tr') as HTMLElement }
  }

  it('table row exposes a named "more actions" button that opens the shared menu', async () => {
    const { onOpenEdit, rendered, container } = renderRow()

    const more = labelledButton(container, 'common.more_actions')
    expect(more).toBeDefined()
    expect(more!.getAttribute('aria-haspopup')).toBe('menu')
    expect(more!.getAttribute('aria-expanded')).toBe('false')

    await click(more)
    expect(more!.getAttribute('aria-expanded')).toBe('true')
    const items = [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    const labels = items.map((item) => item.textContent)
    expect(labels).toContain('share.edit_share_settings')
    expect(labels).toContain('share.revoke_link')
    expect(labels).toContain('share.batch_move_to_folder')

    const editItem = items.find((item) => item.textContent === 'share.edit_share_settings')
    await click(editItem)
    expect(onOpenEdit).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })
})

describe('share grid card keyboard-accessible actions (SH-31)', () => {
  it('grid card exposes the same named "more actions" menu', async () => {
    const rendered = renderElement(createElement(ShareGridCard, gridCardProps() as never))

    const more = labelledButton(rendered.container, 'common.more_actions')
    expect(more).toBeDefined()
    expect(more!.getAttribute('aria-haspopup')).toBe('menu')

    await click(more)
    const items = [...document.body.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')]
    expect(items.map((item) => item.textContent)).toContain('share.qr_code_title')
    rendered.unmount()
  })
})

describe('share batch bar and hub modal names (SH-31)', () => {
  it('clear-selection control has an accessible name and fires on click', async () => {
    useShareStore.setState({ selectedNoteIds: new Set<string>(['note-1']) })
    const onClearSelection = vi.fn()
    const rendered = renderElement(createElement(ShareBatchBar, { selectedCount: 1, onClearSelection }))

    const clear = labelledButton(rendered.container, 'common.clear_selection')
    expect(clear).toBeDefined()
    await click(clear)
    expect(onClearSelection).toHaveBeenCalledTimes(1)
    rendered.unmount()
  })

  it('hub modal has its own accessible name instead of the generic dialog fallback', async () => {
    const rendered = renderElement(createElement(ShareHubModal, { open: true, onClose: () => {} }))
    await act(async () => { await Promise.resolve() })

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).toBeDefined()
    expect(dialog!.getAttribute('aria-label')).toBe('share.hub_title')
    rendered.unmount()
  })
})

describe('share traffic filter and settings switches (SH-31)', () => {
  it('traffic filter trigger announces expanded state and its switches are labelled', async () => {
    const rendered = renderElement(createElement(ShareTrafficFilterPopover))
    const trigger = buttonsIn(rendered.container).find((button) => button.textContent?.includes('share.filter_real_visitors_badge'))
    expect(trigger).toBeDefined()
    expect(trigger!.getAttribute('aria-expanded')).toBe('false')

    await click(trigger)
    expect(trigger!.getAttribute('aria-expanded')).toBe('true')
    // The panel is portaled out of this subtree — that is what keeps `fixed` placement clear of
    // the animated modal it can be opened inside — so its switches live on the document.
    expect(switchesIn(document.body).map((sw) => sw.getAttribute('aria-label'))).toEqual([
      'share.filter_bots_title',
      'share.filter_self_title',
      'share.filter_owner_title',
    ])
    rendered.unmount()
  })

  it('settings modal switches carry the row title as accessible name', () => {
    const rendered = renderElement(createElement(ShareSettingsModal, { open: true, onClose: () => {} }))
    // Modal mounts its panel through a portal, so look in the document instead of the container.
    expect(switchesIn(document.body).map((sw) => sw.getAttribute('aria-label'))).toEqual([
      'share.filter_exclude_bots',
      'share.filter_exclude_self',
      'share.filter_exclude_owner',
      'share.channel_collect_label',
    ])
    rendered.unmount()
  })
})

describe('share edit modal section switches (SH-31)', () => {
  it('edit modal section switches carry their card title as accessible name', () => {
    const bundle = editBundleFixture()
    const sections: ReactNode[] = [
      createElement(ShareStatusCard, { key: 's', b: bundle as never }),
      createElement(ShareSlugCard, { key: 'u', b: bundle as never }),
      createElement(SharePasswordCard, { key: 'p', b: bundle as never }),
      createElement(ShareTagsCard, { key: 't', b: bundle as never }),
    ]
    const rendered = renderElement(createElement('div', null, ...sections))

    expect(switchesIn(rendered.container).map((sw) => sw.getAttribute('aria-label'))).toEqual([
      'share.share_status',
      'share.custom_slug',
      'share.access_password',
    ])
    const removeTag = labelledButton(rendered.container, 'share.remove_tag')
    expect(removeTag).toBeDefined()
    rendered.unmount()
  })
})
